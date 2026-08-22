#!/bin/bash
cd "$(dirname "$0")"
echo "============================================"
echo " 爬蟲環境自動安裝（Mac）"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[X] 找不到 Node.js。"
  echo "    請先到 https://nodejs.org 下載 LTS 版安裝，"
  echo "    裝完後再點一次這個檔案。"
  read -p "按 Enter 關閉..."
  exit 1
fi
echo "[OK] Node.js $(node -v)"

echo
echo "[1/2] 安裝套件中（第一次約 1~3 分鐘）..."
npm install || { echo "[X] npm install 失敗，請截圖上面的錯誤訊息求助。"; read -p "按 Enter 關閉..."; exit 1; }

echo
echo "[2/2] 下載專用瀏覽器（約 150MB）..."
npx playwright install chromium || { echo "[X] 瀏覽器下載失敗，請檢查網路後再點一次這個檔案。"; read -p "按 Enter 關閉..."; exit 1; }

echo
echo "============================================"
echo " 全部裝好了！接下來照「scraper/新手教學.md」"
echo " 的第 4、5 步開始抓資料。"
echo "============================================"
read -p "按 Enter 關閉..."
