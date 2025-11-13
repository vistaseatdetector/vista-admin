#!/bin/bash

echo "🎯 Starting Vista Admin with AI Detection"
echo "========================================="

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BACKEND_DIR="$SCRIPT_DIR/python-backend"

# Function to cleanup background processes
cleanup() {
    echo "🧹 Cleaning up processes..."
    kill $DETECTION_PID 2>/dev/null
    kill $NEXTJS_PID 2>/dev/null
    wait $DETECTION_PID 2>/dev/null
    wait $NEXTJS_PID 2>/dev/null
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if detection service file exists
if [ ! -f "$PYTHON_BACKEND_DIR/yolo_detection_service.py" ]; then
    echo "❌ Detection service not found at $PYTHON_BACKEND_DIR/yolo_detection_service.py"
    exit 1
fi

echo "🚀 Starting YOLOv11 Detection Service..."
cd "$PYTHON_BACKEND_DIR"
python3 yolo_detection_service.py &
DETECTION_PID=$!
cd "$SCRIPT_DIR"

# Wait a moment for detection service to start
sleep 3

# Test if detection service is running
if ! curl -s http://127.0.0.1:8001/health >/dev/null 2>&1; then
    echo "❌ Detection service failed to start"
    kill $DETECTION_PID 2>/dev/null
    exit 1
fi

echo "🌐 Starting Next.js Development Server..."
npm run dev &
NEXTJS_PID=$!

echo ""
echo "🎉 Vista Admin is starting up!"
echo ""
echo "📡 Detection Service: http://127.0.0.1:8001"
echo "🌐 Admin Interface: http://localhost:3000 (or next available port)"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for both processes
wait $DETECTION_PID
wait $NEXTJS_PID