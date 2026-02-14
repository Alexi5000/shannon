#!/bin/bash
cd ~/shannon

# Load .env and export
export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)

# Verify critical env vars
echo "=== Environment Check ==="
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:20}..."
echo "TEMPORAL_ADDRESS: $TEMPORAL_ADDRESS"
echo "NODE: $(which node)"
echo

# Start worker
echo "Starting Shannon worker..."
exec npm run temporal:worker
