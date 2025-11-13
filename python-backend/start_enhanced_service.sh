#!/usr/bin/env bash
set -euo pipefail

# Enhanced YOLO Detection Service launcher
# Flexible venv discovery and configurable bind host/port.

echo "🚀 Starting Enhanced YOLO Detection Service..."

# Repo-root and backend dir resolution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"

# Locate Python interpreter
# Priority:
#  1) DETECTION_PYTHON (absolute path to python)
#  2) DETECTION_VENV/bin/python
#  3) python-backend/venv/bin/python
#  4) repo .venv/bin/python
#  5) repo venv/bin/python
#  6) system python3

PYTHON_BIN="${DETECTION_PYTHON:-}"
if [ -z "${PYTHON_BIN}" ]; then
  if [ -n "${DETECTION_VENV:-}" ] && [ -x "$DETECTION_VENV/bin/python" ]; then
    PYTHON_BIN="$DETECTION_VENV/bin/python"
  elif [ -x "$BACKEND_DIR/venv/bin/python" ]; then
    PYTHON_BIN="$BACKEND_DIR/venv/bin/python"
  elif [ -x "$REPO_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$REPO_ROOT/.venv/bin/python"
  elif [ -x "$REPO_ROOT/venv/bin/python" ]; then
    PYTHON_BIN="$REPO_ROOT/venv/bin/python"
  else
    PYTHON_BIN="$(command -v python3 || true)"
  fi
fi

if [ -z "${PYTHON_BIN}" ]; then
  echo "❌ Could not locate a Python interpreter. Set DETECTION_PYTHON or create a venv." >&2
  exit 1
fi

echo "🧪 Using Python: $PYTHON_BIN"
PIP_BIN="$PYTHON_BIN -m pip"

# Ensure requirements are installed (best-effort)
echo "📥 Ensuring requirements are installed..."
$PIP_BIN install --upgrade pip >/dev/null
$PIP_BIN install -r "$BACKEND_DIR/requirements.txt"

# Check for service file
if [ ! -f "$BACKEND_DIR/yolo_detection_service_enhanced.py" ]; then
  echo "❌ Enhanced detection service not found at $BACKEND_DIR/yolo_detection_service_enhanced.py" >&2
  exit 1
fi

# Weights info (optional)
if [ ! -f "$BACKEND_DIR/yolo11n.pt" ] && [ ! -f "$BACKEND_DIR/yolo11s.pt" ] && [ ! -f "$BACKEND_DIR/yolov8n.pt" ]; then
  echo "ℹ️  No local YOLO weights found; the service will download yolo11n.pt if needed."
fi

# Host/port (can be overridden via env)
BIND_HOST="${DETECTION_BIND_HOST:-${BIND_HOST:-0.0.0.0}}"
BIND_PORT="${DETECTION_PORT:-${BIND_PORT:-8001}}"
echo "🔗 Binding on http://$BIND_HOST:$BIND_PORT"

# Export variables from repo .env.local so the Python process inherits them (e.g., OPENAI_API_KEY)
ENV_FILE="$REPO_ROOT/.env.local"
if [ -f "$ENV_FILE" ]; then
  echo "🌱 Loading env from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

# Start service
exec $PYTHON_BIN "$BACKEND_DIR/yolo_detection_service_enhanced.py"
