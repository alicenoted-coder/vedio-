import type { Page } from "playwright";
import type { BrowserSession } from "./browser";
import { autoScroll } from "./browser";
import { walk } from "./walk";
import type { Platform, PostRecord, ProfileRecord, ScrapeRecord } from "./types";

// Threads 與 Instagram 都是 Meta，貼文資料都走 GraphQL，回應結構也很像：
// 物件帶 `code`（短碼）+ caption / like_count。所以兩邊共用這支收割器：
// 在頁面捲動時攔截所有 JSON 回應，事後遞迴掃出長得像貼文的節點。

const POST_PATH: Record<Exclude<Platform, "shopee" | "facebook">, string> = {
  threads: "post",
  instagram: "p",
};

interface MetaCaption {
  text?: string;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function looksLikePost(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.code === "string" &&
    ("caption" in obj || "like_count" in obj || "text_post_app_info" in obj)
  );
}

function harvestPosts(
  jsonBlobs: unknown[],
  platform: "threads" | "instagram",
  author: string,
  scrapedAt: string
): PostRecord[] {
  const byCode = new Map<string, PostRecord>();

  for (const blob of jsonBlobs) {
    walk(blob, (obj) => {
      if (!looksLikePost(obj)) return;
      const code = obj.code as string;
      if (byCode.has(code)) return;

      const caption = obj.caption as MetaCaption | null | undefined;
      const tpa = obj.text_post_app_info as
        | Record<string, unknown>
        | undefined;
      const takenAt = asNumber(obj.taken_at);

      byCode.set(code, {
        platform,
        kind: "post",
        id: String(obj.pk ?? code),
        url: `https://www.${platform === "threads" ? "threads.net" : "instagram.com"}/${POST_PATH[platform]}/${code}/`,
        author,
        text: caption?.text ?? "",
        likes: asNumber(obj.like_count),
        comments:
          asNumber(obj.comment_count) ??
          asNumber(tpa?.direct_reply_count),
        reposts: asNumber(tpa?.repost_count),
        views:
          asNumber((obj.play_count as number)) ??
          asNumber(obj.view_count),
        timestamp: takenAt ? new Date(takenAt * 1000).toISOString() : undefined,
        scrapedAt,
      });
    });
  }

  return [...byCode.values()];
}

// 從攔截到的 JSON 找出個人檔案（粉絲數、簡介…）。
function harvestProfile(
  jsonBlobs: unknown[],
  platform: "threads" | "instagram",
  username: string,
  url: string,
  scrapedAt: string
): ProfileRecord | null {
  let found: ProfileRecord | null = null;
  for (const blob of jsonBlobs) {
    if (found) break;
    walk(blob, (obj) => {
      if (found) return;
      // user 節點：有 username + 粉絲數欄位
      const uname = obj.username;
      const followers =
        asNumber(obj.follower_count) ??
        asNumber((obj.edge_followed_by as Record<string, unknown>)?.count);
      if (typeof uname === "string" && followers !== undefined) {
        found = {
          platform,
          kind: "profile",
          id: String(obj.pk ?? obj.id ?? uname),
          username: uname,
          name: (obj.full_name as string) ?? uname,
          url,
          followers,
          following: asNumber(obj.following_count),
          description:
            (obj.biography as string) ??
            (obj.biography_with_entities as Record<string, unknown>)?.raw_text as
              | string
              | undefined,
          scrapedAt,
        };
      }
    });
  }
  return found;
}

export async function scrapeMetaProfile(
  session: BrowserSession,
  platform: "threads" | "instagram",
  username: string,
  limit: number
): Promise<ScrapeRecord[]> {
  const handle = username.replace(/^@/, "");
  const url =
    platform === "threads"
      ? `https://www.threads.net/@${handle}`
      : `https://www.instagram.com/${handle}/`;

  const page: Page = await session.context.newPage();
  const jsonBlobs: unknown[] = [];

  // 攔截所有像 JSON 的回應，留著事後收割
  page.on("response", async (res) => {
    const ct = res.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;
    try {
      jsonBlobs.push(await res.json());
    } catch {
      /* 非 JSON 或已被消費，略過 */
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);

  // 捲動觸發更多貼文載入；估每輪約多 6 篇
  const rounds = Math.max(3, Math.ceil(limit / 6));
  await autoScroll(page, rounds);
  await page.waitForTimeout(1500);

  const scrapedAt = new Date().toISOString();
  const out: ScrapeRecord[] = [];

  const profile = harvestProfile(jsonBlobs, platform, handle, url, scrapedAt);
  if (profile) out.push(profile);

  const posts = harvestPosts(jsonBlobs, platform, handle, scrapedAt).slice(0, limit);
  out.push(...posts);

  await page.close();

  if (out.length === 0) {
    throw new Error(
      `${platform} 沒抓到任何資料。多半是登入牆——先執行 ` +
        `npm run scrape -- login ${platform} 手動登入存 session，再重跑。`
    );
  }
  return out;
}
