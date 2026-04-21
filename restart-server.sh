#!/bin/bash
# Restart SDC.IO game server locally on Windows (run via Git Bash)
# HTTP :8765, WebSocket :8766
# Usage: ./restart-server.sh

SERVER_DIR="C:/Users/oghyh/Coding/Games/sdc.io"
PYTHON="C:/Users/oghyh/Coding/.venv311/Scripts/python.exe"

# Kill processes holding port 8765 or 8766
for PORT in 8765 8766; do
    PID=$(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
    if [ -n "$PID" ]; then
        echo "Killing PID $PID on port $PORT"
        taskkill //F //PID "$PID" 2>/dev/null || true
    fi
done
sleep 1

# Start server in foreground
cd "$SERVER_DIR"
echo "Starting SDC.IO server..."
"$PYTHON" server.py
