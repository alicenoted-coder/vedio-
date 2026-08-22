import type { Page } from "playwright";
import type { BrowserSession } from "./browser";
import { autoScroll } from "./browser";
import type { PostRecord, ProfileRecord, ScrapeRecord } from "./types";

// Facebook 是四個平台裡最難的：登入牆最重、HTML class 全是亂數、
// 還會偵測自動化。這裡走 DOM 盡力抽取，建議搭配 login 先存 session。
// 結構一改就可能失準，所以把選擇器集中在這、方便日後維護。

// 把中文 / 英文的數量字串轉成數字："1.2萬" -> 12000、"3.4K" -> 3400
function parseCount(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.replace(/,/g, "").match(/([\d.]+)\s*(萬|億|K|M|k|m)?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  switch (m[2]) {
    case "萬":
      return Math.round(n * 1e4);
    case "億":
      return Math.round(n * 1e8);
    case "K":
    case "k":
      return Math.round(n * 1e3);
    case "M":
    case "m":
      return Math.round(n * 1e6);
    default:
      return Math.round(n);
  }
}

export async function scrapeFacebookPage(
  session: BrowserSession,
  pageName: string,
  limit: number
): Promise<ScrapeRecord[]> {
  const handle = pageName.replace(/^@/, "");
  const url = `https://www.facebook.com/${handle}`;
  const page: Page = await session.context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);

  const scrapedAt = new Date().toISOString();
  const out: ScrapeRecord[] = [];

  // 粉專基本資訊：標題 + 簡介（盡力，FB 常擋）
  const name = (await page.title()).replace(/\s*[|｜].*$/, "").trim() || handle;
  out.push({
    platform: "facebook",
    kind: "profile",
    id: handle,
    username: handle,
    name,
    url,
    scrapedAt,
  } satisfies ProfileRecord);

  await autoScroll(page, Math.max(4, Math.ceil(limit / 4)));
  await page.waitForTimeout(1500);

  // 每篇貼文是一個 role="article"。在頁面內把文字與互動數抽出來，
  // 互動數多半藏在 aria-label（例："讚: 123"、"5 則留言"）。
  const posts = await page.evaluate(() => {
    const articles = Array.from(
      document.querySelectorAll('[role="article"]')
    ).slice(0, 60);
    return articles.map((el) => {
      const text = (el.querySelector('[data-ad-preview="message"]') ?? el).textContent ?? "";
      const labels = Array.from(el.querySelectorAll("[aria-label]"))
        .map((n) => n.getAttribute("aria-label") ?? "")
        .filter(Boolean);
      const link =
        (el.querySelector('a[href*="/posts/"]') as HTMLAnchorElement | null)?.href ??
        (el.querySelector('a[href*="/videos/"]') as HTMLAnchorElement | null)?.href ??
        "";
      return { text: text.trim(), labels, link };
    });
  });

  const findLabel = (labels: string[], re: RegExp) =>
    labels.find((l) => re.test(l));

  let count = 0;
  for (const p of posts) {
    if (!p.text && !p.link) continue;
    if (count >= limit) break;
    out.push({
      platform: "facebook",
      kind: "post",
      id: p.link || `${handle}#${count}`,
      url: p.link || url,
      author: name,
      text: p.text,
      likes: parseCount(findLabel(p.labels, /讚|like|reaction/i)),
      comments: parseCount(findLabel(p.labels, /留言|comment/i)),
      reposts: parseCount(findLabel(p.labels, /分享|share/i)),
      scrapedAt,
    } satisfies PostRecord);
    count++;
  }

  await page.close();
  return out;
}
