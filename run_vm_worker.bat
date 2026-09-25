@echo off
setlocal enabledelayedexpansion
title Receipt Processor — Headless VM Worker Node
color 0a

echo =====================================================================
echo  CENTRAL RECEIPT PROCESSOR — HEADLESS VM WORKER NODE
echo  Continuous Multi-Client Background Worker for Virtual Machines
echo =====================================================================
echo.

cd /d "%~dp0"
echo [INFO] Working directory: %cd%

set "WORKER_ID=%COMPUTERNAME%-node"
if not "%~1"=="" set "WORKER_ID=%~1"

set "INBOX_DIR=inbox"
if not "%~2"=="" set "INBOX_DIR=%~2"

echo [INFO] Worker Node Identifier: %WORKER_ID%
echo [INFO] Inbox Root Directory:   %INBOX_DIR%
echo.

:: Check python
set "PY_CMD=python"
py --version >nul 2>&1
if %errorlevel% equ 0 set "PY_CMD=py"

echo [INFO] Verifying requirements...
%PY_CMD% -m pip install -q -r requirements.txt >nul 2>&1

echo [INFO] Launching headless VM worker node...
%PY_CMD% receipt_processor.py --headless --worker-id "%WORKER_ID%" --folder "%INBOX_DIR%" --workers 6

pause
