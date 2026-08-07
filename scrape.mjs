#!/usr/bin/env node
/**
 * scrape.mjs — 用 headless Chromium 抓 JS 動態載入的頁面
 *
 * 一般的 curl/requests 只能拿到「JS 執行前」的 HTML 骨架，
 * 這支工具用 Playwright 開真的瀏覽器，等 JS 跑完、資料載入後
 * 才把渲染結果存下來，同時側錄頁面打的 XHR/fetch API——
 * 很多時候直接打那支 API 拿 JSON 比爬 HTML 更乾淨。
 *
 * 用法：
 *   直接給多個網址（URL 有換頁參數時）：
 *     node scrape.mjs "https://site/list?page=2" "https://site/list?page=3"
 *
 *   URL 不變、要點「下一頁」按鈕的 SPA：
 *     node scrape.mjs "https://site/list" --next ".pagination .next" --pages 4
 *
 * 選項：
 *   --next <css>      下一頁按鈕的 CSS selector（點擊換頁模式）
 *   --pages <n>       點擊換頁模式下總共要抓幾頁（含第 1 頁）
 *   --wait <css>      每頁額外等待此 selector 出現才算載入完成
 *   --out <dir>       輸出目錄（預設 ./out）
 *
 * 每頁輸出三種檔案到 out/：
 *   page-N.html        JS 渲染完成後的完整 DOM
 *   page-N.png         整頁截圖（QA 留證用）
 *   page-N.api.jsonl   該頁期間側錄到的 XHR/fetch 回應（每行一筆 JSON）
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.mjs',
  ];
  for (const c of candidates) {
    try {
      return import(c.endsWith('.mjs') ? c : require.resolve(c));
    } catch {
      /* 換下一個候選路徑 */
    }
  }
  throw new Error('找不到 playwright，請先 npm install playwright');
}

function parseArgs(argv) {
  const opts = { urls: [], next: null, pages: 1, wait: null, out: 'out' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--next') opts.next = argv[++i];
    else if (a === '--pages') opts.pages = Number(argv[++i]);
    else if (a === '--wait') opts.wait = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else opts.urls.push(a);
  }
  if (!opts.urls.length) {
    console.error('用法請看檔案開頭註解；至少要給一個 URL');
    process.exit(1);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const { chromium } = await loadPlaywright();

fs.mkdirSync(opts.out, { recursive: true });

// 環境有對外 proxy 時讓 Chromium 走同一條路。
// 注意：Playwright 設了 proxy 後連 localhost 都會被強制走 proxy，
// 所以目標全是本機時就不掛 proxy。
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
const isLocal = (u) => ['localhost', '127.0.0.1', '::1'].includes(new URL(u).hostname);
const useProxy = proxyServer && !opts.urls.every(isLocal);
const browser = await chromium.launch(
  useProxy ? { proxy: { server: proxyServer } } : {}
);
// proxy 做 TLS 解密時憑證不在 Chromium 信任鏈裡，抓取用途可放行
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

let apiLog = [];
page.on('response', async (res) => {
  const type = res.request().resourceType();
  if (type !== 'xhr' && type !== 'fetch') return;
  const entry = {
    status: res.status(),
    method: res.request().method(),
    url: res.url(),
  };
  try {
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json')) entry.body = await res.json();
  } catch {
    /* 回應可能已被釋放或非 JSON，只留 URL 也夠用 */
  }
  apiLog.push(entry);
});

async function settle() {
  await page.waitForLoadState('networkidle');
  if (opts.wait) await page.waitForSelector(opts.wait, { timeout: 15000 });
}

async function capture(n) {
  const html = await page.content();
  fs.writeFileSync(path.join(opts.out, `page-${n}.html`), html);
  await page.screenshot({
    path: path.join(opts.out, `page-${n}.png`),
    fullPage: true,
  });
  fs.writeFileSync(
    path.join(opts.out, `page-${n}.api.jsonl`),
    apiLog.map((e) => JSON.stringify(e)).join('\n')
  );
  console.log(
    `[page ${n}] 已存 HTML(${html.length} bytes)、截圖、API 側錄 ${apiLog.length} 筆`
  );
  apiLog = [];
}

if (opts.next) {
  // 點擊換頁模式：同一個 URL，靠按「下一頁」載入後面幾頁
  await page.goto(opts.urls[0]);
  await settle();
  await capture(1);
  for (let n = 2; n <= opts.pages; n++) {
    await page.click(opts.next);
    await settle();
    await capture(n);
  }
} else {
  // 多 URL 模式：每個網址各抓一頁
  for (let i = 0; i < opts.urls.length; i++) {
    await page.goto(opts.urls[i]);
    await settle();
    await capture(i + 1);
  }
}

await browser.close();
console.log(`完成，輸出在 ${path.resolve(opts.out)}/`);
