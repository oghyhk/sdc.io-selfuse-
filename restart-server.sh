#!/bin/bash
# Restart SDC.IO game server on port 8765
# Usage: ./restart-server.sh

set -e

cd /opt/sdc.io-selfuse-

# Kill any existing server processes on port 8765
pkill -f "python.*server.py" 2>/dev/null || true
sleep 1

# Verify port is free
if lsof -i:8765 >/dev/null 2>&1; then
    echo "ERROR: Port 8765 still in use after pkill"
    lsof -i:8765
    exit 1
fi

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
echo "Port 8765 is now listening:"
lsof -i:8765
echo ""
echo "Last 5 lines of server.log:"
tail -5 /opt/sdc.io-selfuse-/server.log
