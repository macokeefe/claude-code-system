#!/usr/bin/env bash
# GolfCapture setup for macOS.
# - verifies Python 3.11+
# - creates a virtualenv and installs dependencies
# - reminds you to grant Bluetooth + Camera permissions to your terminal

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Checking Python version (need 3.11+)..."
PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Install Python 3.11+ (e.g. 'brew install python@3.11')." >&2
  exit 1
fi

PY_VER="$("$PYTHON" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
PY_MAJOR="${PY_VER%%.*}"
PY_MINOR="${PY_VER##*.}"
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 11 ]; }; then
  echo "ERROR: Python $PY_VER detected; GolfCapture requires 3.11+." >&2
  exit 1
fi
echo "    Python $PY_VER OK."

echo "==> Creating virtual environment in ./venv ..."
"$PYTHON" -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate

echo "==> Upgrading pip and installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

mkdir -p "$HOME/GolfCapture/sessions"

cat <<'EOF'

==> Setup complete.

IMPORTANT — macOS permissions (one-time, manual):
  Your terminal app needs Bluetooth and Camera access. macOS will usually
  prompt the first time you run, but if it doesn't, grant them manually:

    System Settings > Privacy & Security > Bluetooth  -> enable your terminal
    System Settings > Privacy & Security > Camera     -> enable your terminal

  (If you run from an IDE, grant the IDE these permissions instead.)

Next steps:
    source venv/bin/activate
    python main.py scan          # verify R10 connectivity (run this first!)
    python main.py record        # record a session (Ctrl+C to stop)
    python main.py analyze       # process the most recent session

EOF
