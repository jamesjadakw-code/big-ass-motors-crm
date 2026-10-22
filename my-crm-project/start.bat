@echo off
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  echo Install the LTS version, then double-click start.bat again.
  start https://nodejs.org
  pause
  exit /b
)
if not exist client\node_modules (
  echo First-time setup, this takes a few minutes...
  call npm run install:all
)
echo Starting your CRM. A browser tab will open in a few seconds.
echo Close this window to stop the app.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:5173"
call npm run dev
pause
