# vedio-

用 headless Chromium（Playwright）抓取 JS 動態載入頁面的小工具。

一般 `curl` / `requests` 只能拿到「JS 執行前」的 HTML 骨架，對於資料由前端 JS
非同步載入的頁面（SPA、無限捲動、分頁按鈕等）無法直接取得完整內容。這裡的
`scrape.mjs` 會開一個真的瀏覽器，等頁面 JS 執行完、資料載入後才擷取結果，
同時側錄頁面發出的 XHR/fetch API 回應——很多時候直接拿那支 API 的 JSON
會比爬渲染後的 HTML 更乾淨、更好處理。

## 需求

- Node.js
- [Playwright](https://playwright.dev/)（`npm install playwright`，需含瀏覽器執行檔）

## 用法

給多個網址（適用於換頁參數在 URL 上的情況）：

```bash
node scrape.mjs "https://site/list?page=2" "https://site/list?page=3"
```

URL 不變、要靠點擊「下一頁」按鈕換頁的 SPA：

```bash
node scrape.mjs "https://site/list" --next ".pagination .next" --pages 4
```

## 選項

| 選項 | 說明 |
| --- | --- |
| `--next <css>` | 「下一頁」按鈕的 CSS selector（點擊換頁模式） |
| `--pages <n>` | 點擊換頁模式下總共要抓幾頁（含第 1 頁） |
| `--wait <css>` | 每頁額外等待此 selector 出現才算載入完成 |
| `--out <dir>` | 輸出目錄（預設 `./out`） |

## 輸出

每頁會在輸出目錄產生三個檔案：

- `page-N.html` — JS 渲染完成後的完整 DOM
- `page-N.png` — 整頁截圖（可用於 QA 留證）
- `page-N.api.jsonl` — 該頁期間側錄到的 XHR/fetch 回應，每行一筆 JSON

## 環境變數

若環境設有 `HTTPS_PROXY` / `https_proxy`，且目標網址非本機（`localhost` /
`127.0.0.1` / `::1`），Chromium 會自動透過該 proxy 連線；proxy 做 TLS 解密時
會忽略憑證驗證錯誤，僅供抓取用途使用。
