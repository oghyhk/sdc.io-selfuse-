#!/bin/bash
# Restart SDC.IO game server (HTTP :8765, WebSocket :8766)
# Usage: ./restart-server.sh

set -e

cd /opt/sdc.io-selfuse-

# Kill any existing server processes
pkill -f "python.*server.py" 2>/dev/null || true
sleep 1

# Force-kill anything still holding port 8765 or 8766
for PORT in 8765 8766; do
    PIDS=$(lsof -ti:$PORT 2>/dev/null) || true
    if [ -n "$PIDS" ]; then
        echo "Force-killing PIDs on port $PORT: $PIDS"
        kill -9 $PIDS 2>/dev/null || true
    fi
done
sleep 1

# Verify both ports are free
for PORT in 8765 8766; do
    if lsof -i:$PORT >/dev/null 2>&1; then
        echo "ERROR: Port $PORT still in use after kill"
        lsof -i:$PORT
        exit 1
    fi
done

# Start server in background with logging
nohup python3 server.py > /opt/sdc.io-selfuse-/server.log 2>&1 &
SERVER_PID=$!

sleep 2

# Verify it started
if ! lsof -i:8765 >/dev/null 2>&1; then
    echo "ERROR: Server failed to start. Check server.log"
    tail -20 /opt/sdc.io-selfuse-/server.log
    exit 1
fi

echo "SDC.IO server started successfully (PID: $SERVER_PID)"
echo "Ports listening:"
lsof -i:8765 -i:8766
echo ""
echo "Last 5 lines of server.log:"
tail -5 /opt/sdc.io-selfuse-/server.log
