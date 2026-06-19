@echo off
cd /d C:\MCP_Files\NoSpoil_WorldCup\website
set LOG_DIR=C:\MCP_Files\NoSpoil_WorldCup\.tmp\auto-update
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo [%date% %time%] auto-update start >> "%LOG_DIR%\run.log"
node auto-update.js >> "%LOG_DIR%\run.log" 2>&1
echo [%date% %time%] auto-update done >> "%LOG_DIR%\run.log"
