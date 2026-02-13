@echo off
REM ==============================================================================
REM ESPERANZA KIOSK - STOP/CLEANUP UTILITY
REM Safely stop all kiosk processes
REM ==============================================================================

title Esperanza Kiosk - Cleanup

cls

echo.
echo ================================================================================
echo ESPERANZA KIOSK - CLEANUP UTILITY
echo ================================================================================
echo.
echo This will stop all kiosk processes:
echo  - Chrome browser
echo  - Python servers
echo.
echo Continue? (Y/N)
set /p "CONFIRM="

if /i "%CONFIRM%"!="Y" (
    echo Cancelled.
    exit /b 0
)

echo.
echo Stopping services...

REM Stop Chrome
echo [1/3] Stopping Chrome...
taskkill /F /IM chrome.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo       Chrome stopped
) else (
    echo       Chrome not running
)

REM Stop Python processes
echo [2/3] Stopping Python servers...
taskkill /F /IM python.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo       Python processes stopped
) else (
    echo       No Python processes found
)

echo [3/3] Cleanup complete

echo.
echo All kiosk services stopped.
echo.
echo To restart, double-click: start_kiosk.bat
echo.

pause
