import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { launchSession } from "./browser";
import { writeCsv } from "./csv";
import { scrapeShopee } from "./shopee";
import { scrapeMetaProfile } from "./meta";
import { scrapeFacebookPage } from "./facebook";
import type { Platform, ScrapeRecord } from "./types";

// 極簡 flag 解析：--key value，以及單獨的 --headful。
function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        bools.add(key);
      }
    }
  }
  return { flags, bools };
}

const LOGIN_URL: Record<Platform, string> = {
  shopee: "https://shopee.tw/buyer/login",
  threads: "https://www.threads.net/login",
  instagram: "https://www.instagram.com/accounts/login/",
  facebook: "https://www.facebook.com/login",
};

const authPath = (platform: string) => `.auth/${platform}.json`;

// login 指令：開可見的瀏覽器，讓使用者手動登入（含人機驗證），
// 按 Enter 後把登入 session 存成 storageState，之後抓取就能帶上。
async function runLogin(platform: Platform) {
  const session = await launchSession({ headful: true });
  const page = await session.context.newPage();
  await page.goto(LOGIN_URL[platform], { waitUntil: "domcontentloaded" });

  const rl = createInterface({ input: stdin, output: stdout });
  console.log(
    `\n已開啟 ${platform} 登入頁。請在彈出的瀏覽器視窗手動登入（含驗證碼）。`
  );
  await rl.question("登入完成後，回到這裡按 Enter 儲存 session…");
  rl.close();

  await session.context.storageState({ path: authPath(platform) });
  await session.close();
  console.log(`已儲存登入狀態到 ${authPath(platform)}`);
}

function usage() {
  console.log(`社群／電商資料擷取 CLI（研究用，請遵守各平台條款與個資法）

用法：
  npm run scrape -- login <platform>                先登入存 session（IG/FB 幾乎必須）
  npm run scrape -- shopee    --shop <username>     抓賣場基本資訊 + 商品（名稱/價格/銷量）
  npm run scrape -- threads   --user <handle>       抓個人檔案 + 貼文（內容/互動數）
  npm run scrape -- instagram --user <handle>
  npm run scrape -- facebook  --page <pagename>

共用選項：
  --limit <n>     最多抓幾筆商品/貼文（預設 50）
  --out <path>    CSV 輸出路徑（預設 data/<platform>-<目標>.csv）
  --headful       顯示瀏覽器視窗（除錯用）
  --auth <path>   指定登入 session 檔（預設 .auth/<platform>.json）

範例：
  npm run scrape -- login instagram
  npm run scrape -- shopee --shop someshop --limit 100
  npm run scrape -- threads --user natgeo --limit 30 --out data/ng.csv
`);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const { flags, bools } = parseArgs(rest);

  if (!command || command === "help" || bools.has("help")) {
    usage();
    return;
  }

  if (command === "login") {
    const platform = rest[0] as Platform;
    if (!LOGIN_URL[platform]) {
      console.error(`未知平台：${rest[0]}（shopee / threads / instagram / facebook）`);
      process.exit(1);
    }
    await runLogin(platform);
    return;
  }

  const platform = command as Platform;
  const limit = flags.limit ? parseInt(flags.limit, 10) : 50;
  const headful = bools.has("headful");
  const authFile = flags.auth ?? authPath(platform);

  const session = await launchSession({ headful, authFile });
  let records: ScrapeRecord[] = [];
  let target = "";

  try {
    switch (platform) {
      case "shopee":
        target = flags.shop ?? "";
        if (!target) throw new Error("缺少 --shop <username>");
        records = await scrapeShopee(session, target, limit);
        break;
      case "threads":
      case "instagram":
        target = flags.user ?? "";
        if (!target) throw new Error("缺少 --user <handle>");
        records = await scrapeMetaProfile(session, platform, target, limit);
        break;
      case "facebook":
        target = flags.page ?? "";
        if (!target) throw new Error("缺少 --page <pagename>");
        records = await scrapeFacebookPage(session, target, limit);
        break;
      default:
        usage();
        await session.close();
        process.exit(1);
    }
  } finally {
    await session.close();
  }

  const out =
    flags.out ?? `data/${platform}-${target.replace(/[^\w.-]/g, "_")}.csv`;
  await writeCsv(out, records);

  const products = records.filter((r) => r.kind === "product").length;
  const posts = records.filter((r) => r.kind === "post").length;
  const profiles = records.filter((r) => r.kind === "profile").length;
  console.log(
    `完成：profile ${profiles}、product ${products}、post ${posts} 筆 → ${out}`
  );
}

main().catch((err) => {
  console.error("錯誤：", err instanceof Error ? err.message : err);
  process.exit(1);
});
