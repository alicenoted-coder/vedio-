@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  爬蟲環境自動安裝（Windows）
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] 找不到 Node.js。
  echo     請先到 https://nodejs.org 下載 LTS 版安裝，
  echo     裝完後再點一次這個檔案。
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v

echo.
echo [1/2] 安裝套件中（第一次約 1~3 分鐘）...
call npm install
if errorlevel 1 (
  echo [X] npm install 失敗，請截圖上面的錯誤訊息求助。
  pause
  exit /b 1
)

echo.
echo [2/2] 下載專用瀏覽器（約 150MB）...
call npx playwright install chromium
if errorlevel 1 (
  echo [X] 瀏覽器下載失敗，請檢查網路後再點一次這個檔案。
  pause
  exit /b 1
)

echo.
echo ============================================
echo  全部裝好了！接下來照「scraper\新手教學.md」
echo  的第 4、5 步開始抓資料。
echo ============================================
pause
