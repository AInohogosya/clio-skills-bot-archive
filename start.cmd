@echo off
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js could not be found. Please install Node.js 20 or later from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
node "%~dp0start.mjs" %*
