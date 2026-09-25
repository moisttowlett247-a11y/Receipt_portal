#!/usr/bin/env bash
# =============================================================================
#  RECEIPT PROCESSOR — HEADLESS VIRTUAL MACHINE WORKER NODE LAUNCHER
# =============================================================================
# Runs 24/7 without GUI, display server, or X11. Perfect for Linux VMs,
# Docker containers, cloud instances, or background services.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WORKER_ID="${1:-vm-node-$HOSTNAME}"
INBOX_DIR="${2:-inbox}"
WORKERS="${3:-6}"

echo "============================================================================="
echo "  STARTING CENTRAL RECEIPT PROCESSOR VM WORKER NODE: $WORKER_ID"
echo "============================================================================="
echo "  Working Directory: $SCRIPT_DIR"
echo "  Inbox Root Path:   $INBOX_DIR"
echo "  Worker Threads:    $WORKERS concurrent"
echo "============================================================================="

# Find Python 3
if command -v python3 &>/dev/null; then
    PY_CMD="python3"
elif command -v python &>/dev/null; then
    PY_CMD="python"
else
    echo "[ERROR] Python 3 is not installed or not in PATH."
    exit 1
fi

# Ensure requirements are installed
if [ -f "requirements.txt" ]; then
    echo "[INFO] Verifying Python dependencies..."
    $PY_CMD -m pip install -q -r requirements.txt || true
fi

echo "[INFO] Booting headless worker node..."
exec $PY_CMD receipt_processor.py --headless --worker-id "$WORKER_ID" --folder "$INBOX_DIR" --workers "$WORKERS"
