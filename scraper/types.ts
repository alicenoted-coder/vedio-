// 四個平台共用的資料模型。所有 adapter 都產出這三種 record 之一，
// 再由 csv.ts 攤平成同一張表，方便匯出比對。

export type Platform = "shopee" | "threads" | "instagram" | "facebook";

export type RecordKind = "profile" | "product" | "post";

// 賣場 / 粉專 / 個人檔案的基本資訊
export interface ProfileRecord {
  platform: Platform;
  kind: "profile";
  id: string; // 平台內部 id（shopid / user id）
  username: string; // @handle 或賣場 username
  name: string; // 顯示名稱
  url: string;
  followers?: number; // 粉絲 / 追蹤數
  following?: number;
  itemCount?: number; // 賣場商品數
  rating?: number; // 賣場評分（0–5）
  description?: string; // 簡介 / 自我介紹
  scrapedAt: string;
}

// 單一商品（蝦皮為主）
export interface ProductRecord {
  platform: Platform;
  kind: "product";
  id: string; // itemid
  name: string;
  url: string;
  price?: number; // 已換算成元（非 micro）
  currency?: string;
  sold?: number; // 累積銷量
  rating?: number; // 商品評分（0–5）
  ratingCount?: number;
  stock?: number;
  shop?: string; // 所屬賣場
  scrapedAt: string;
}

// 一篇貼文（Threads / IG / FB）
export interface PostRecord {
  platform: Platform;
  kind: "post";
  id: string;
  url: string;
  author: string;
  text: string;
  likes?: number;
  comments?: number;
  reposts?: number;
  views?: number;
  timestamp?: string; // ISO8601（拿得到才填）
  scrapedAt: string;
}

export type ScrapeRecord = ProfileRecord | ProductRecord | PostRecord;
