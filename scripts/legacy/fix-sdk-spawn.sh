#!/bin/bash
# Wrapper to fix Claude SDK spawn issue in Docker
# This ensures node is in PATH when SDK spawns subprocesses

export PATH="/usr/bin:/usr/local/bin:/bin:$PATH"
export NODE_PATH="/usr/lib/node_modules"

exec node "$@"
