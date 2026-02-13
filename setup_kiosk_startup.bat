@echo off
REM ==============================================================================
REM ESPERANZA KIOSK - AUTOMATED STARTUP SETUP
REM This script automatically creates the Windows startup shortcut
REM ==============================================================================

setlocal enabledelayedexpansion

echo.
echo ================================================================================
echo ESPERANZA KIOSK AUTOMATIC SETUP
echo ================================================================================
echo.
echo This script will create a startup shortcut to auto-launch the kiosk.
echo.

REM Get current directory
set "CURRENT_DIR=%~dp0"
set "VBS_FILE=%CURRENT_DIR%start_hidden.vbs"

REM Check if start_hidden.vbs exists
if not exist "%VBS_FILE%" (
    echo [ERROR] start_hidden.vbs not found in: %CURRENT_DIR%
    echo.
    pause
    goto :eof
)

echo [INFO] Found start_hidden.vbs at:
echo        %VBS_FILE%
echo.

REM Get username
for /f "tokens=1 delims=\" %%A in ('whoami') do set "USERNAME=%%A"

REM Find startup folder
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if not exist "%STARTUP_FOLDER%" (
    echo [ERROR] Could not find Windows Startup folder
    echo [INFO] Trying alternative path...
    set "STARTUP_FOLDER=%SystemDrive%\Users\%USERNAME%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
)

echo [INFO] Startup folder: %STARTUP_FOLDER%
echo.

REM Create shortcut using PowerShell (more reliable)
echo [INFO] Creating shortcut...

powershell -Command ^
    $WshShell = New-Object -ComObject WScript.Shell; ^
    $Shortcut = $WshShell.CreateShortcut('%STARTUP_FOLDER%\Esperanza Kiosk.lnk'); ^
    $Shortcut.TargetPath = '%VBS_FILE%'; ^
    $Shortcut.WorkingDirectory = '%CURRENT_DIR%'; ^
    $Shortcut.WindowStyle = 1; ^
    $Shortcut.Description = 'Auto-launch Esperanza Kiosk on startup'; ^
    $Shortcut.Save()

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Shortcut created!
    echo.
    echo Location: %STARTUP_FOLDER%\Esperanza Kiosk.lnk
    echo.
    echo Next steps:
    echo 1. Restart Windows
    echo 2. After boot, the kiosk will automatically launch
    echo.
    echo You can verify the shortcut exists by opening:
    echo   - Win + R, type: shell:startup
    echo   - Look for "Esperanza Kiosk" shortcut
    echo.
) else (
    echo.
    echo [ERROR] Failed to create shortcut
    echo.
    echo Please create it manually:
    echo 1. Press Win + R
    echo 2. Type: shell:startup
    echo 3. Right-click in the folder
    echo 4. Create shortcut to: %VBS_FILE%
    echo.
)

echo Press any key to exit...
pause >nul
