#!/usr/bin/env bash
echo "====================================================================="
echo " FARM & SMALL BUSINESS RECEIPT PROCESSOR"
echo " High-Speed AI Receipt OCR, QuickBooks Integration & License Manager"
echo "====================================================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "[ERROR] Python 3 is not installed or not in PATH!"
    echo "Please install Python 3 (https://www.python.org/) and try again."
    exit 1
fi

echo "[OK] Using Python: $($PYTHON_CMD --version)"

if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    echo "[INFO] Installing / verifying dependencies..."
    $PYTHON_CMD -m pip install -r "$SCRIPT_DIR/requirements.txt" --quiet || true
fi

if [ ! -f "$SCRIPT_DIR/.env" ] && [ -f "$SCRIPT_DIR/.env.example" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
fi

echo "[INFO] Launching Receipt Processor GUI..."
$PYTHON_CMD "$SCRIPT_DIR/receipt_processor.py"
