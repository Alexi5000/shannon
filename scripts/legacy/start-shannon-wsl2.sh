#!/bin/bash
# Shannon Worker Startup Script for WSL2
# This script ensures all environment variables are properly set

cd ~/shannon

# Load API key from .env file
if [ -f .env ]; then
  export $(cat .env | grep ANTHROPIC_API_KEY | tr -d '\r')
fi

# Verify API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ERROR: ANTHROPIC_API_KEY not set in .env file"
  exit 1
fi

echo "=== Shannon Worker Starting ==="
echo "API Key: ${ANTHROPIC_API_KEY:0:20}..."
echo "Temporal: ${TEMPORAL_ADDRESS:-localhost:7233}"
echo "Node: $(which node)"
echo

# Start worker
exec npm run temporal:worker
