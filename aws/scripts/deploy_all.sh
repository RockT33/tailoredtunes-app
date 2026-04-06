#!/usr/bin/env bash
# Deploy backend then frontend in sequence
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "▶ Deploying backend..."
"$SCRIPT_DIR/deploy_backend.sh"
echo ""
echo "▶ Deploying frontend..."
"$SCRIPT_DIR/deploy_frontend.sh"
echo ""
echo "✓ Full deployment complete"
