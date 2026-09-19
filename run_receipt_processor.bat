@echo off
setlocal enabledelayedexpansion
title Farm & Small Business Receipt Processor Launcher
color 0b

echo =====================================================================
echo  FARM ^& SMALL BUSINESS RECEIPT PROCESSOR
echo  High-Speed AI Receipt OCR, QuickBooks Integration ^& License Manager
echo =====================================================================
echo.

:: 1. Navigate directly to the directory containing this batch script
cd /d "%~dp0"
echo [INFO] Working directory: %cd%
echo.

:: 2. Search for Python / Py launcher
set "PY_CMD="

:: Check Windows Python Launcher 'py'
py -3 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py -3"
    goto :PYTHON_FOUND
)
py --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py"
    goto :PYTHON_FOUND
)

:: Check standard 'python'
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python"
    goto :PYTHON_FOUND
)

:: Check python3
python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python3"
    goto :PYTHON_FOUND
)

:: Check common Windows AppData installation paths
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    goto :PYTHON_FOUND
)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    goto :PYTHON_FOUND
)
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto :PYTHON_FOUND
)
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    goto :PYTHON_FOUND
)
if exist "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" (
    set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python39\python.exe"
    goto :PYTHON_FOUND
)

:: Check Program Files
if exist "C:\Program Files\Python313\python.exe" (
    set "PY_CMD=C:\Program Files\Python313\python.exe"
    goto :PYTHON_FOUND
)
if exist "C:\Program Files\Python312\python.exe" (
    set "PY_CMD=C:\Program Files\Python312\python.exe"
    goto :PYTHON_FOUND
)
if exist "C:\Program Files\Python311\python.exe" (
    set "PY_CMD=C:\Program Files\Python311\python.exe"
    goto :PYTHON_FOUND
)
if exist "C:\Program Files\Python310\python.exe" (
    set "PY_CMD=C:\Program Files\Python310\python.exe"
    goto :PYTHON_FOUND
)

:: Check root drive
if exist "C:\Python313\python.exe" (
    set "PY_CMD=C:\Python313\python.exe"
    goto :PYTHON_FOUND
)
if exist "C:\Python312\python.exe" (
    set "PY_CMD=C:\Python312\python.exe"
    goto :PYTHON_FOUND
)
if exist "C:\Python311\python.exe" (
    set "PY_CMD=C:\Python311\python.exe"
    goto :PYTHON_FOUND
)
if exist "C:\Python310\python.exe" (
    set "PY_CMD=C:\Python310\python.exe"
    goto :PYTHON_FOUND
)

:: If not found:
echo [ERROR] Python was not found in your system PATH or standard folders!
echo.
echo Please install Python (version 3.10, 3.11, or 3.12) from:
echo   https://www.python.org/downloads/
echo.
echo *** CRITICAL ***:
echo During installation, be sure to CHECK the box:
echo   [X] "Add python.exe to PATH"
echo.
pause
exit /b 1

:PYTHON_FOUND
echo [OK] Python detected: %PY_CMD%
"%PY_CMD%" --version 2>nul || %PY_CMD% --version
echo.

:: 3. Verify that receipt_processor.py exists in the current folder
if not exist "%~dp0receipt_processor.py" (
    echo [ERROR] Could not find 'receipt_processor.py' in this folder:
    echo   %~dp0
    echo.
    echo Please make sure you extracted all files from the downloaded ZIP folder
    echo and that 'receipt_processor.py' sits alongside this .bat file.
    echo.
    pause
    exit /b 1
)

:: 4. Check for Tkinter GUI support
"%PY_CMD%" -c "import tkinter" >nul 2>&1 || %PY_CMD% -c "import tkinter" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Tkinter GUI module not found in this Python installation.
    echo On Windows, re-run Python setup and choose 'Modify' -> ensure 'tcl/tk and IDLE' is checked.
    echo.
)

:: 5. Install / verify dependencies
if exist "%~dp0requirements.txt" (
    echo [INFO] Verifying and installing required packages from requirements.txt...
    "%PY_CMD%" -m pip install -r "%~dp0requirements.txt" --disable-pip-version-check 2>nul || %PY_CMD% -m pip install -r "%~dp0requirements.txt" --disable-pip-version-check
    if %errorlevel% neq 0 (
        echo [WARNING] Some dependencies failed to install. Continuing anyway...
    )
) else (
    echo [INFO] Installing essential dependencies (Pillow, requests, python-dotenv, cryptography)...
    "%PY_CMD%" -m pip install Pillow requests python-dotenv cryptography --disable-pip-version-check 2>nul || %PY_CMD% -m pip install Pillow requests python-dotenv cryptography --disable-pip-version-check
)
echo.

:: 6. Check for .env template
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        copy "%~dp0.env.example" "%~dp0.env" >nul
        echo [INFO] Created default .env file from template.
    )
)

:: 7. Launch application
echo =====================================================================
echo  Starting Receipt Processor GUI...
echo =====================================================================
echo.

"%PY_CMD%" "%~dp0receipt_processor.py" 2>nul || %PY_CMD% "%~dp0receipt_processor.py"
set "APP_EXIT=%errorlevel%"

echo.
echo =====================================================================
if %APP_EXIT% equ 0 (
    echo  Receipt Processor closed normally.
) else (
    echo  [NOTICE] Receipt Processor closed with code %APP_EXIT%.
    echo  If an error occurred, check 'crash_log.txt' in this directory.
)
echo =====================================================================
echo.
echo Press any key to exit this window...
pause >nul

