import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ScrapeRecord } from "./types";

// 三種 record 攤平後的欄位聯集，固定順序方便人看 / 匯入試算表。
const COLUMNS = [
  "platform",
  "kind",
  "id",
  "username",
  "name",
  "author",
  "text",
  "url",
  "price",
  "currency",
  "sold",
  "stock",
  "rating",
  "ratingCount",
  "followers",
  "following",
  "itemCount",
  "likes",
  "comments",
  "reposts",
  "views",
  "description",
  "timestamp",
  "scrapedAt",
] as const;

function escapeCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  let s = String(value);
  // 把換行壓成空白，避免 CSV 列被貼文內文撐爆
  s = s.replace(/\r?\n/g, " ").trim();
  if (/[",]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(records: ScrapeRecord[]): string {
  const header = COLUMNS.join(",");
  const rows = records.map((rec) =>
    COLUMNS.map((col) => escapeCell((rec as unknown as Record<string, unknown>)[col])).join(",")
  );
  // 加 BOM，Excel 開繁中才不會亂碼
  return "﻿" + [header, ...rows].join("\n") + "\n";
}

export async function writeCsv(path: string, records: ScrapeRecord[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toCsv(records), "utf8");
}
