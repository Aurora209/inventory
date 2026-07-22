#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WSL_DATA_DIR="${INVENTORY_DATA_DIR:-$HOME/.local/share/inventory}"
WSL_LOG_DIR="${LOG_DIR:-$HOME/.local/state/inventory-logs}"

mkdir -p "$WSL_DATA_DIR" "$WSL_LOG_DIR"

if [ ! -f "$WSL_DATA_DIR/inventory.db" ] && [ -f "$PROJECT_DIR/data/inventory.db" ]; then
  cp "$PROJECT_DIR/data/inventory.db" "$WSL_DATA_DIR/inventory.db"
fi

export INVENTORY_DATA_DIR="$WSL_DATA_DIR"
export LOG_DIR="$WSL_LOG_DIR"
export FLASK_RUN_HOST="${FLASK_RUN_HOST:-127.0.0.1}"
export FLASK_RUN_PORT="${FLASK_RUN_PORT:-5001}"

cd "$PROJECT_DIR"
exec python3 run.py
