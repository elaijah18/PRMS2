@echo off

if /I not "%~1"=="HIDDEN" (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/c """"%~f0"""" HIDDEN' -WindowStyle Hidden"
    exit /b
)

shift
cls
title ESPERANZA KIOSK - STARTUP

set "BACKEND_PORT=8000"
set "FRONTEND_PORT=8080"

REM Get the current directory
cd /d "%~dp0"

if not exist "logs" mkdir "logs"

echo.
echo ================================================================================
echo                    ESPERANZA KIOSK - STARTING UP
echo ================================================================================
echo.
echo This will start:
echo   - Backend server (Django on :%BACKEND_PORT%)
echo   - Frontend server (HTTP on :%FRONTEND_PORT%)
echo   - Chrome browser (Kiosk fullscreen mode)
echo.
echo ================================================================================
echo.

echo [1/3] Starting Backend Server (hidden)...
echo        Django development server on http://localhost:%BACKEND_PORT%
start "Esperanza Backend" /B cmd /c "cd backend && python -u run_backend.py > ..\logs\backend.log 2>&1"

timeout /t 6 /nobreak

echo.
echo [2/3] Starting Frontend Server (hidden)...
echo        HTTP server on http://localhost:%FRONTEND_PORT%
start "Esperanza Frontend" /B cmd /c "cd esperanzav9 && python -u run_frontend_server.py > ..\logs\frontend.log 2>&1"

timeout /t 4 /nobreak

echo.
echo [3/3] Launching Browser...
echo        Opening http://localhost:%FRONTEND_PORT% in fullscreen kiosk mode
echo.

REM Launch Chrome with kiosk flags
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --kiosk ^
    --no-first-run ^
    --disable-infobars ^
    --disable-extensions ^
    http://localhost:%FRONTEND_PORT%

echo.
echo ================================================================================
echo                         ✓ KIOSK STARTED
echo ================================================================================
echo.
echo Status:
echo   ✓ Backend server running on port %BACKEND_PORT%
echo   ✓ Frontend server running on port %FRONTEND_PORT%
echo   ✓ Chrome opened in fullscreen kiosk mode
echo.
echo URLs:
echo   Backend API:    http://localhost:%BACKEND_PORT%/api/
echo   Frontend App:   http://localhost:%FRONTEND_PORT%
echo   Backend Log:    PRMS2\logs\backend.log
echo   Frontend Log:   PRMS2\logs\frontend.log
echo.
echo To stop the kiosk:
echo   1. Close the browser window (Alt+F4)
echo   2. Close the backend window (Ctrl+C or close the window)
echo   3. Close the frontend window (Ctrl+C or close the window)
echo.
echo Or double-click: stop_kiosk.bat
echo.
echo ================================================================================
exit /b 0
