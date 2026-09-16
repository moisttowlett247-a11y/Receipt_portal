@echo off
title Farm & Small Business Receipt Processor Launcher
color 0b
echo =====================================================================
echo  FARM ^& SMALL BUSINESS RECEIPT PROCESSOR
echo  High-Speed AI Receipt OCR, QuickBooks Integration ^& License Manager
echo =====================================================================
echo.

:: 1. Check if Python is installed and accessible in PATH
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not detected in your system PATH!
    echo.
    echo Please install Python 3.10 or newer from https://www.python.org/
    echo IMPORTANT: Make sure to check the box "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Python found:
python --version
echo.

:: 2. Check for requirements.txt and install missing dependencies
if exist "%~dp0requirements.txt" (
    echo [INFO] Checking and installing required dependencies from requirements.txt...
    python -m pip install --quiet --upgrade pip
    python -m pip install -r "%~dp0requirements.txt"
    if %errorlevel% neq 0 (
        echo [WARNING] Some dependencies could not be automatically installed.
        echo Attempting to launch application with standard library fallbacks...
    ) else (
        echo [OK] All Python dependencies are satisfied!
    )
) else (
    echo [INFO] Installing essential dependencies (Pillow, requests, python-dotenv, cryptography)...
    python -m pip install --quiet Pillow requests python-dotenv cryptography
)
echo.

:: 3. Check for .env file; create from .env.example if missing
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        echo [INFO] Creating initial .env file from template...
        copy "%~dp0.env.example" "%~dp0.env" >nul
        echo [INFO] .env created. You can add your GEMINI_API_KEY in this file if desired.
    )
)

:: 4. Launch the receipt processor desktop app
echo =====================================================================
echo  Starting Receipt Processor GUI...
echo =====================================================================
echo.
cd /d "%~dp0"
python receipt_processor.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application exited with error code %errorlevel%.
    echo Press any key to close this console.
    pause >nul
)
