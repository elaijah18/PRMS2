@echo on
cls
title ESPERANZA KIOSK - STARTUP

REM Get the current directory
cd /d "%~dp0"

echo.
echo ================================================================================
echo                    ESPERANZA KIOSK - STARTING UP
echo ================================================================================
echo.
echo This will start:
echo   - Backend server (Django on :8000)
echo   - Frontend server (HTTP on :8080)
echo   - Chrome browser (Kiosk fullscreen mode)
echo.
echo ================================================================================
echo.

echo [1/3] Starting Backend Server (hidden)...
echo        Django development server on http://localhost:8000
start "Esperanza Backend" /B cmd /c "cd backend && python -u run_backend.py > nul 2>&1"

timeout /t 6 /nobreak

echo.
echo [2/3] Starting Frontend Server (hidden)...
echo        HTTP server on http://localhost:8080
start "Esperanza Frontend" /B cmd /c "cd esperanzav9 && python -u run_frontend_server.py > nul 2>&1"

timeout /t 4 /nobreak

echo.
echo [3/3] Launching Browser...
echo        Opening http://localhost:8080 in fullscreen kiosk mode
echo.

REM Launch Chrome with kiosk flags
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --kiosk ^
    --no-first-run ^
    --disable-infobars ^
    --disable-extensions ^
    http://localhost:8080

echo.
echo ================================================================================
echo                         ✓ KIOSK STARTED
echo ================================================================================
echo.
echo Status:
echo   ✓ Backend server running on port 8000
echo   ✓ Frontend server running on port 8080
echo   ✓ Chrome opened in fullscreen kiosk mode
echo.
echo URLs:
echo   Backend API:    http://localhost:8000/api/
echo   Frontend App:   http://localhost:8080
echo.
echo To stop the kiosk:
echo   1. Close the browser window (Alt+F4)
echo   2. Close the backend window (Ctrl+C or close the window)
echo   3. Close the frontend window (Ctrl+C or close the window)
echo.
echo Or double-click: stop_kiosk.bat
echo.
echo ================================================================================
pause
