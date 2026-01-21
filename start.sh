#!/bin/bash
# Voice MCP Server startup script

cd "$(dirname "$0")"

# Default port
PORT=${PORT:-3001}

# Check if PIN is set
if [ -z "$MCP_PIN" ]; then
  echo "WARNING: MCP_PIN not set, using default 'changeme'"
  echo "Set a secure PIN: export MCP_PIN=your-secret-pin"
fi

# Build if needed
if [ ! -d "dist" ] || [ "src/index.ts" -nt "dist/index.js" ]; then
  echo "Building..."
  npm run build
fi

# Run
echo "Starting Voice MCP Server on port $PORT..."
exec node dist/index.js
