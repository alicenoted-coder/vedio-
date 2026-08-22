# vedio-

抓網頁資料的工具，裡面其實是**兩支獨立的爬蟲**，程度不同、用途不同：

| | `scrape.mjs`（通用引擎） | `scraper/`（平台專用，來自 `claude` repo PR #5） |
|---|---|---|
| 定位 | 什麼網站都能用的**萬用抓取工具** | 專門對付**蝦皮、Threads、Instagram、Facebook** |
| 懂不懂內容 | 不懂，只負責「存下畫面」 | 懂，會把資料**解析**成商品/貼文/個人檔案欄位 |
| 輸出 | 原始 HTML + 截圖 + API 側錄 log | 整理好的 CSV（開 Excel 直接用） |

**先講最重要的事：這兩支工具技術上是「同一招」——都是開 Playwright 真瀏覽器、側錄 XHR/fetch API——只是一個做得通用、一個做得深。** 詳細差異看下面「兩支爬蟲差在哪」整節。

---

## ⚠️ 合規提醒（兩支工具都適用）

自建爬蟲擷取他人頁面**違反各平台服務條款**，平台可能封鎖你的帳號/IP。請：
1. 僅抓**公開、彙總、去識別化**資料做研究比對
2. 依台灣《個人資料保護法》，避免蒐集可識別特定個人的資料
3. `scraper/` 已內建禮貌限速；`scrape.mjs` 是通用工具，頻率請自行拿捏
4. 風險自負，不要拿去做商業轉售或大量高頻抓取

---

## 安裝

```bash
npm install
npx playwright install chromium    # 下載瀏覽器本體（約 150MB，只需一次）
```

Windows / Mac 也可以直接雙擊 `安裝-Windows.bat` / `安裝-Mac.command`，會自動幫你跑完上面兩步。

---

## 工具一：`scrape.mjs`（通用引擎）

**任何網址都能用**，不管理平台是什麼，也不解析內容——單純「幫你把 JS 跑完的畫面存下來」。

**用途**：你想抓的網站不在 `scraper/` 支援的四個平台裡（不是蝦皮/Threads/IG/FB），或是你只是想先看看某個網頁的 API 長什麼樣、還不確定要不要正式做解析。

```bash
# 網址本身會變（有分頁參數）
node scrape.mjs "https://site/list?page=2" "https://site/list?page=3"

# 網址不變、要點「下一頁」按鈕的 SPA
node scrape.mjs "https://site/list" --next ".pagination .next" --pages 4
```

選項：`--next <css>` 下一頁按鈕、`--pages <n>` 抓幾頁、`--wait <css>` 多等某元素出現、`--out <dir>` 輸出資料夾（預設 `./out`）。

每頁輸出到 `out/`：
- `page-N.html`（渲染完成的 DOM）
- `page-N.png`（整頁截圖，留證用）
- `page-N.api.jsonl`（側錄到的背景 API 回應，每行一筆 JSON——這個常常比爬 HTML 更好用）

**你拿到這些檔案後要自己看、自己寫程式解析**，它不會幫你變成 CSV。

---

## 工具二：`scraper/`（蝦皮/Threads/IG/Facebook 專用）

**看得懂**這四個平台的資料長什麼樣，直接輸出整理好的 CSV。

```bash
# IG / FB 有登入牆，先手動登入存 session（會開瀏覽器視窗，登入後回終端機按 Enter）
npm run scrape -- login instagram
npm run scrape -- login facebook

# 蝦皮賣場：基本資訊 + 商品（名稱/價格/銷量/評分/庫存）
npm run scrape -- shopee --shop <賣場username> --limit 100

# Threads / Instagram：個人檔案 + 貼文（內容/讚/留言/瀏覽）
npm run scrape -- threads --user <handle> --limit 30
npm run scrape -- instagram --user <handle>

# Facebook 粉專：粉專名稱 + 貼文（盡力）
npm run scrape -- facebook --page <粉專名>
```

共用選項：`--limit <n>`（預設 50）、`--out <path>`（預設 `data/<platform>-<目標>.csv`）、`--headful`（顯示瀏覽器除錯）、`--auth <path>`（指定 session 檔）。

完整新手教學看 `scraper/新手教學.md`。

### 各平台可靠度（誠實說明）

| 平台 | 方式 | 可靠度 | 備註 |
|------|------|--------|------|
| 蝦皮 | 真實瀏覽器帶 cookie 打內部 JSON API | 較高 | 欄位最全；蝦皮改 API 或加強人機驗證時需更新端點 |
| Threads | 攔截 GraphQL JSON + 遞迴收割 | 中 | 公開貼文多半拿得到；登入後更穩 |
| Instagram | 同上 | 中偏低 | 登入牆重，**強烈建議先 `login`** |
| Facebook | DOM 抽取 | 低 | 反爬最強、HTML 全亂數，務必先 `login`，結構一改就需調整選擇器 |

`data/`（輸出）與 `.auth/`（登入 session，含敏感資料）已加入 `.gitignore`，**不會被 commit**。

---

## 🔍 兩支爬蟲差在哪（結構上完整比較）

這是你要求要講清楚的部分，逐項攤開：

### 1. 檔案結構：一支獨檔 vs. 拆成多個模組

```
scrape.mjs              ← 全部邏輯塞在同一個檔案（146 行）：
                            參數解析、開瀏覽器、側錄、存檔，都在這裡

scraper/                ← 拆成 8 個檔案，各司其職：
├── cli.ts                  指令進入點 + 參數解析（對應 scrape.mjs 裡的 parseArgs 那段）
├── browser.ts               開瀏覽器 + 自動捲動（對應 scrape.mjs 裡開 browser/context 那段，但多了防偵測）
├── shopee.ts                 蝦皮專用：怎麼打蝦皮的 API、欄位怎麼對應
├── meta.ts                   Threads/IG 專用：怎麼從 GraphQL 回應找貼文
├── facebook.ts                Facebook 專用：DOM 選擇器怎麼寫
├── walk.ts                    遞迴掃 JSON、用「資料形狀」找目標物件（scrape.mjs 沒有這層，因為它不需要懂內容）
├── csv.ts                     輸出成 CSV（scrape.mjs 沒有，因為它只存原始 log）
└── types.ts                   profile/product/post 的型別定義
```

**為什麼一個要拆、一個不用拆？** `scrape.mjs` 只做「開瀏覽器、存畫面」這一件事，不需要理解拿到的資料是什麼，所以塞一個檔案就夠。`scraper/` 要理解「這是一個商品」「這是一則貼文」，還要處理四個不同平台各自的怪癖，邏輯量大很多，拆開才好維護——改蝦皮的抓法不會不小心動到 Facebook 的。

### 2. 語言與執行方式

| | `scrape.mjs` | `scraper/` |
|---|---|---|
| 語言 | 純 JavaScript（`.mjs`） | TypeScript（`.ts`），要靠 `tsx` 執行 |
| 怎麼跑 | `node scrape.mjs ...` | `npm run scrape -- ...`（背後是 `tsx scraper/cli.ts`） |
| 型別檢查 | 沒有 | 有（`types.ts` 定義好 `ScrapeRecord` 等型別，寫錯欄位編譯期就會抓到） |

### 3. 登入處理：完全沒有 vs. 一整套 session 機制

- **`scrape.mjs`**：完全沒有登入概念，開瀏覽器就是全新、乾淨的訪客身份。遇到需要登入才看得到內容的頁面，它就是抓不到。
- **`scraper/`**：有專門的 `login` 指令（`cli.ts` 的 `runLogin`）——開一個看得到畫面的瀏覽器，你手動登入（含過人機驗證），按 Enter 後把登入狀態存成 `.auth/<platform>.json`，之後每次抓取都自動帶上這個檔案（`browser.ts` 的 `launchSession` 接收 `authFile` 參數）。這是因為 **IG / FB 幾乎所有內容都有登入牆**，沒有這套機制根本抓不到東西。

### 4. 防偵測程度：預設 vs. 特別加固

- **`scrape.mjs`**：用 Playwright 預設的瀏覽器設定，沒有刻意偽裝。
- **`scraper/`**：`browser.ts` 特別做了幾件事降低被抓包機率：
  - 固定成一個常見桌機 Chrome 的 User-Agent 字串
  - 加 `--disable-blink-features=AutomationControlled` 啟動參數
  - 用 `addInitScript` 把 `navigator.webdriver` 這個「這是自動化程式」的最明顯破綻抹掉
  - 設定台灣時區/語系，讓行為更像本地真人

  （這不是「隱形」，各平台仍可能認得出來，只是把最基本的破綻補上。）

### 5. 有沒有「自動捲動」

- **`scrape.mjs`**：沒有捲動邏輯，只支援「換頁」（改網址或點下一頁按鈕）。遇到「往下捲才會載入更多」的無限捲動頁面，它抓不到捲動後才出現的內容。
- **`scraper/`**：`browser.ts` 有 `autoScroll()`，會自動往下捲、等待載入、偵測「捲了也沒有變高」就停止——這是 Threads/IG/FB 這種 feed 式頁面必備的功能。

### 6. 輸出哲學：原始證據 vs. 結構化資料

- **`scrape.mjs`** 的目標是「留下完整證據，讓人事後自己判斷」——所以存 HTML 全文、截圖、每一筆 API 回應的原始 JSON，什麼都不丟、什麼都不加工。
- **`scraper/`** 的目標是「直接給你能用的資料表」——所以它要做兩件 `scrape.mjs` 不做的事：
  1. **理解**資料形狀（`walk.ts` 用遞迴掃描＋形狀比對，從一大包 GraphQL JSON 裡「認出」哪一段是貼文、哪一段是使用者，不綁死固定路徑，平台小改版比較不會整支壞）
  2. **攤平成 CSV**（`csv.ts`，三種不同結構的資料——賣場/粉專資訊、商品、貼文——統一攤成同一張表，含 BOM 讓 Excel 開繁體中文不亂碼）

### 一句話總結

> `scrape.mjs` 是**地基**（開瀏覽器、存畫面、側錄 API，什麼網站都能用）；
> `scraper/` 是**蓋在地基上的專用建築**（登入、防偵測、自動捲動、資料解析、CSV 輸出，只服務四個特定平台）。
>
> 如果之後要擴充支援第五個平台，理論上可以直接重用 `scrape.mjs` 的側錄邏輯 + `scraper/browser.ts` 的登入/防偵測機制，只需要新寫一支「這個平台的資料長什麼樣」的解析檔（像 `shopee.ts` 那樣），不用整套重寫。

---

## 專案結構總覽

```
scrape.mjs                  # 通用引擎（單檔，任何網站）
scraper/
├── cli.ts                  # 指令進入點：login / shopee / threads / instagram / facebook
├── browser.ts               # Playwright 真實瀏覽器 + 防偵測 + 自動捲動
├── shopee.ts                 # 蝦皮：帶 cookie 打內部 v4 JSON API
├── meta.ts                   # Threads / IG：攔截 GraphQL 回應 + 遞迴收割貼文
├── facebook.ts                # FB 粉專：DOM 盡力抽取
├── walk.ts                    # 遞迴掃 JSON、用「形狀」找目標物件
├── csv.ts                     # 三種 record 攤平成同一張 CSV（含 BOM）
├── types.ts                   # profile / product / post 共用型別
└── 新手教學.md                # 給新手的逐步教學
安裝-Mac.command / 安裝-Windows.bat   # 一鍵安裝腳本（雙擊執行）
```

---

## 這個 repo 是怎麼來的

`vedio-` 原本只有 `scrape.mjs` 這支通用引擎（沒有 README 說明、也沒有 `package.json`，是半成品）。
`scraper/` 這整套蝦皮/社群專用爬蟲原本是加在 `alicenoted-coder/claude` 這個 repo 的 PR #5 裡，
因為跟那個 repo 的「照片辨識」主業務完全無關，只是同樣用 Playwright 抓資料、性質上更接近 `vedio-`，
所以合併搬到這裡，跟原本的 `scrape.mjs` 放在一起，並且補齊了 `package.json`、`.gitignore`，
讓這個 repo 現在可以直接 `npm install` 跑起來。
