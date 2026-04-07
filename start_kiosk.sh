#!/usr/bin/env bash

set -uo pipefail

# hidden bootstrap behavior.
if [[ "${1:-}" != "HIDDEN" ]]; then
  nohup "$0" HIDDEN >/dev/null 2>&1 &
  exit 0
fi

BACKEND_PORT=8000
FRONTEND_PORT=8080

# Move to script directory (equivalent to %~dp0)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p logs

echo
echo "================================================================================"
echo "                   ESPERANZA KIOSK - STARTING UP"
echo "================================================================================"
echo
echo "This will start:"
echo "  - Backend server (Django on :${BACKEND_PORT})"
echo "  - Frontend server (HTTP on :${FRONTEND_PORT})"
echo "  - Chromium browser (Fullscreen mode)"
echo
echo "================================================================================"
echo

echo "[1/3] Starting Backend Server (background)..."
echo "       Django development server on http://localhost:${BACKEND_PORT}"
nohup bash -c "cd '$SCRIPT_DIR/backend' && python3 -u run_backend.py" > logs/backend.log 2>&1 &

sleep 6

echo
echo "[2/3] Starting Frontend Server (background)..."
echo "       HTTP server on http://localhost:${FRONTEND_PORT}"
nohup bash -c "cd '$SCRIPT_DIR/esperanzav9' && python3 -u run_frontend_server.py" > logs/frontend.log 2>&1 &

sleep 4

echo
echo "[3/3] Launching Browser..."
echo "       Opening http://localhost:${FRONTEND_PORT} in fullscreen kiosk mode"
echo

URL="http://localhost:${FRONTEND_PORT}"

# Try common Chrome/Chromium launch commands with kiosk flags.
if command -v chromium >/dev/null 2>&1; then
  chromium --kiosk --no-first-run --disable-infobars --disable-extensions "$URL" >/dev/null 2>&1 &
elif command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser --kiosk --no-first-run --disable-infobars --disable-extensions "$URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  echo "Warning: No browser command found. Open this URL manually: $URL"
fi

echo
echo "================================================================================"
echo "                        KIOSK STARTED"
echo "================================================================================"
echo
echo "Status:"
echo "  Backend server running on port ${BACKEND_PORT}"
echo "  Frontend server running on port ${FRONTEND_PORT}"
echo "  Browser launch attempted in kiosk mode"
echo
echo "URLs:"
echo "  Backend API:    http://localhost:${BACKEND_PORT}/api/"
echo "  Frontend App:   http://localhost:${FRONTEND_PORT}"
echo "  Backend Log:    logs/backend.log"
echo "  Frontend Log:   logs/frontend.log"
echo
echo "To stop the kiosk:"
echo "  1. Close the browser"
echo "  2. Stop backend and frontend Python processes"
echo
echo "Or use an equivalent stop script (e.g., stop_kiosk.sh)"
echo
echo "================================================================================"

exit 0