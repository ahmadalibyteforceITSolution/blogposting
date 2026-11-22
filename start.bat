@echo off
title FB AutoBlog Master - Facebook & Groups Auto-Poster
color 0B

echo ===================================================================
echo             FB AUTOBLOG MASTER - LUXURY SOFTWARE SUITE
echo       Autonomous ^& 1-Click Facebook Groups ^& Pages Multi-Poster
echo ===================================================================
echo.

cd /d "%~dp0"

echo [*] Checking dependencies...
if not exist node_modules (
    echo [*] Installing required packages...
    call npm install
)

echo [*] Launching FB AutoBlog Master Dashboard on http://localhost:3000 ...
echo [*] Press Ctrl+C in this window to stop the software.
echo.

node server/index.js
pause
