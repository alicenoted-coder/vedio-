import type { BrowserSession } from "./browser";
import type { ProductRecord, ProfileRecord, ScrapeRecord } from "./types";

// 蝦皮台灣站。策略：先用真實瀏覽器開賣場頁拿到 cookie / 通過反爬，
// 再用同一個 context 的 request 去打它的內部 v4 JSON API。
// 這些端點是蝦皮網頁自己在用的，欄位最齊全，比刮 DOM 穩。
const BASE = "https://shopee.tw";

const apiHeaders = (referer: string) => ({
  "x-api-source": "pc",
  "x-shopee-language": "zh-Hant",
  "x-requested-with": "XMLHttpRequest",
  referer,
  accept: "application/json",
});

interface ShopDetail {
  shopid: number;
  name: string;
  account?: { username?: string };
  follower_count?: number;
  item_count?: number;
  rating_star?: number;
  description?: string;
}

interface ItemBasic {
  itemid: number;
  shopid: number;
  name: string;
  price?: number; // micro：實際價格 = price / 100000
  stock?: number;
  sold?: number;
  historical_sold?: number;
  item_rating?: { rating_star?: number; rating_count?: number[] };
}

const micro = (v?: number) => (typeof v === "number" ? v / 100000 : undefined);

async function getJson<T>(
  session: BrowserSession,
  url: string,
  referer: string
): Promise<T | null> {
  const res = await session.context.request.get(url, { headers: apiHeaders(referer) });
  if (!res.ok()) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function scrapeShopee(
  session: BrowserSession,
  shopUsername: string,
  limit: number
): Promise<ScrapeRecord[]> {
  const shopUrl = `${BASE}/${shopUsername}`;
  const page = await session.context.newPage();
  // 先載入賣場頁，讓 context 取得必要 cookie，並通過初步反爬檢查
  await page.goto(shopUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const out: ScrapeRecord[] = [];
  const scrapedAt = new Date().toISOString();

  // 1) 賣場基本資訊
  const detailRes = await getJson<{ data?: ShopDetail }>(
    session,
    `${BASE}/api/v4/shop/get_shop_detail?username=${encodeURIComponent(shopUsername)}`,
    shopUrl
  );
  const detail = detailRes?.data;
  if (!detail?.shopid) {
    await page.close();
    throw new Error(
      `拿不到賣場「${shopUsername}」的資料。可能賣場不存在、被反爬擋下，或蝦皮改了 API。` +
        `試試加 --headful 觀察，或先 npm run scrape -- login shopee 過人機驗證。`
    );
  }

  const profile: ProfileRecord = {
    platform: "shopee",
    kind: "profile",
    id: String(detail.shopid),
    username: detail.account?.username ?? shopUsername,
    name: detail.name ?? shopUsername,
    url: shopUrl,
    followers: detail.follower_count,
    itemCount: detail.item_count,
    rating: detail.rating_star,
    description: detail.description,
    scrapedAt,
  };
  out.push(profile);

  // 2) 賣場商品（依熱門排序，分頁抓到 limit）
  const PAGE_SIZE = 30;
  for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
    const url =
      `${BASE}/api/v4/search/search_items?by=pop&shopid=${detail.shopid}` +
      `&limit=${PAGE_SIZE}&offset=${offset}&order=desc&page_type=shop` +
      `&scenario=PAGE_SHOP_SEARCH&version=2`;
    const res = await getJson<{ items?: { item_basic?: ItemBasic }[] }>(
      session,
      url,
      shopUrl
    );
    const items = res?.items ?? [];
    if (items.length === 0) break;

    for (const wrap of items) {
      const it = wrap.item_basic;
      if (!it) continue;
      const product: ProductRecord = {
        platform: "shopee",
        kind: "product",
        id: String(it.itemid),
        name: it.name,
        url: `${BASE}/product/${it.shopid}/${it.itemid}`,
        price: micro(it.price),
        currency: "TWD",
        sold: it.historical_sold ?? it.sold,
        stock: it.stock,
        rating: it.item_rating?.rating_star,
        ratingCount: it.item_rating?.rating_count?.[0],
        shop: profile.name,
        scrapedAt,
      };
      out.push(product);
      if (out.length - 1 >= limit) break;
    }
    if (items.length < PAGE_SIZE) break;
    await page.waitForTimeout(800); // 禮貌限速，別把對方打掛
  }

  await page.close();
  return out;
}
