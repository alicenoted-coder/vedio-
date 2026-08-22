import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext } from "playwright";

// 一組看起來像真實桌機 Chrome 的設定，降低被反爬蟲一眼識破的機率。
// 這不是「隱形」——平台仍可能擋——只是把最基本的破綻補起來。
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  close: () => Promise<void>;
}

export interface LaunchOptions {
  headful?: boolean; // 顯示瀏覽器視窗（手動登入時用）
  authFile?: string; // 之前存下的登入 session（storageState）
  locale?: string;
}

export async function launchSession(opts: LaunchOptions = {}): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: !opts.headful,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: opts.locale ?? "zh-TW",
    timezoneId: "Asia/Taipei",
    viewport: { width: 1366, height: 900 },
    // 若有存好的登入狀態就帶上（IG / FB 需要）
    storageState:
      opts.authFile && existsSync(opts.authFile) ? opts.authFile : undefined,
  });

  // 移除 navigator.webdriver 這個最明顯的自動化指紋
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return {
    browser,
    context,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

// 自動往下捲動，讓平台的無限捲動載入更多內容。
// 回傳 false 代表已經到底（高度不再變）。
export async function autoScroll(
  page: import("playwright").Page,
  rounds: number,
  pauseMs = 1200
): Promise<void> {
  let lastHeight = 0;
  for (let i = 0; i < rounds; i++) {
    const height = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return document.body.scrollHeight;
    });
    await page.waitForTimeout(pauseMs);
    if (height === lastHeight) break; // 到底了
    lastHeight = height;
  }
}
