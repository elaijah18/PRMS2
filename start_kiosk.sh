#!/bin/bash

# Check if running in hidden mode (simulate behavior)
if [ "$1" != "HIDDEN" ]; then
    nohup bash "$0" HIDDEN > /dev/null 2>&1 &
    exit 0
fi

shift
clear
echo "ESPERANZA KIOSK - STARTUP"

BACKEND_PORT=8000
FRONTEND_PORT=8080

# Get current directory (script location)
cd "$(dirname "$0")"

# Create logs folder if not exists
mkdir -p logs

echo ""
echo "==============================================================================="
echo "                   ESPERANZA KIOSK - STARTING UP"
echo "==============================================================================="
`echo ""
`echo "This will start:"
echo "  - Backend server (Django on :$BACKEND_PORT)"
echo "  - Frontend server (HTTP on :$FRONTEND_PORT)"
echo "  - Chrome browser (Kiosk fullscreen mode)"
echo ""
echo "==============================================================================="
echo ""

echo "[1/3] Starting Backend Server (hidden)..."
echo "       Django development server on http://localhost:$BACKEND_PORT"

(
    cd backend || exit
    python3 -u run_backend.py > ../logs/backend.log 2>&1
) &

sleep 6

echo ""
echo "[2/3] Starting Frontend Server (hidden)..."
echo "       HTTP server on http://localhost:$FRONTEND_PORT"

(
    cd esperanzav9 || exit
    python3 -u run_frontend_server.py > ../logs/frontend.log 2>&1
) &

sleep 4

echo ""
echo "[3/3] Launching Browser..."
echo "       Opening http://localhost:$FRONTEND_PORT in fullscreen kiosk mode"
echo ""

# Try to launch in chromium
chromium-browser \
    --kiosk \
    --no-first-run \
    --disable-infobars \
    --disable-extensions \
    "http://localhost:$FRONTEND_PORT" &

echo ""
echo "==============================================================================="
echo "                        ✓ KIOSK STARTED"
echo "==============================================================================="
echo ""
echo "Status:"
echo "  ✓ Backend server running on port $BACKEND_PORT"
echo "  ✓ Frontend server running on port $FRONTEND_PORT"
echo "  ✓ Chrome opened in fullscreen kiosk mode"
echo ""
echo "URLs:"
echo "  Backend API:    http://localhost:$BACKEND_PORT/api/"
echo "  Frontend App:   http://localhost:$FRONTEND_PORT"
echo "  Backend Log:    PRMS2/logs/backend.log"
echo "  Frontend Log:   PRMS2/logs/frontend.log"
echo ""
echo "To stop the kiosk:"
echo "  1. Close the browser window"
echo "  2. Kill backend/frontend processes (Ctrl+C or kill command)"
echo ""
echo "==============================================================================="

exit 0