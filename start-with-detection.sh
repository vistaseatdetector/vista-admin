#!/bin/bash

# YOLOv11 Detection Service Startup Script
# This script starts both the Next.js app and the YOLOv11 detection service

echo "🚀 Starting Vista Admin with YOLOv11 Detection..."

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Check if Python backend directory exists
if [ ! -d "python-backend" ]; then
    echo "❌ Error: python-backend directory not found."
    exit 1
fi

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $1 is already in use"
        return 1
    else
        return 0
    fi
}

# Function to cleanup background processes
cleanup() {
    echo "🧹 Cleaning up processes..."
    if [ ! -z "$DETECTION_PID" ]; then
        kill $DETECTION_PID 2>/dev/null || true
    fi
    if [ ! -z "$NEXTJS_PID" ]; then
        kill $NEXTJS_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check ports
echo "📋 Checking ports..."
if ! check_port 3000; then
    echo "Please stop the service using port 3000 and try again."
    exit 1
fi

if ! check_port 8001; then
    echo "Please stop the service using port 8001 and try again."
    exit 1
fi

###############################################################################
# Python backend
###############################################################################
echo "📦 Installing Python dependencies..."
cd python-backend

# Check if virtual environment exists, create if not
if [ ! -d "venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "📦 Installing Python packages..."
pip install -r requirements.txt

# Choose classic vs enhanced service
USE_ENHANCED=${USE_ENHANCED:-0}
SERVICE_FILE="yolo_detection_service.py"
SERVICE_DESC="YOLOv11 Detection Service"
if [ "$1" = "--enhanced" ] || [ "$USE_ENHANCED" = "1" ]; then
  SERVICE_FILE="yolo_detection_service_enhanced.py"
  SERVICE_DESC="Enhanced YOLOv11 Detection Service (ByteTrack + Zones)"
fi

# Start detection service in background
echo "🤖 Starting $SERVICE_DESC on port 8001..."
if [ "$SERVICE_FILE" = "yolo_detection_service.py" ]; then
  python "$SERVICE_FILE" --host 0.0.0.0 --port 8001 &
else
  python "$SERVICE_FILE" &
fi
DETECTION_PID=$!

# Give the detection service time to start
sleep 3

# Check if detection service started successfully
if ! check_port 8001; then
    echo "✅ YOLOv11 Detection Service started successfully"
else
    echo "❌ Failed to start YOLOv11 Detection Service"
    cleanup
    exit 1
fi

# Go back to project root
cd ..

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Start Next.js development server
echo "🌐 Starting Next.js development server on port 3000..."
DETECTION_SERVICE_URL=${DETECTION_SERVICE_URL:-http://127.0.0.1:8001} npm run dev &
NEXTJS_PID=$!

# Give Next.js time to start
sleep 5

echo ""
echo "🎉 Vista Admin with YOLOv11 Detection is now running!"
echo ""
echo "📊 Dashboard: http://localhost:3000"
echo "🤖 Detection API: http://localhost:8001"
echo "📚 Detection Docs: http://localhost:8001/docs"
echo ""
echo "💡 Features enabled:"
echo "   • Real-time people detection using YOLOv11"
echo "   • Camera management with webcam/RTSP/HTTP support"
echo "   • Live detection overlays with bounding boxes"
echo "   • People counting for occupancy tracking"
echo ""
echo "🛑 Press Ctrl+C to stop all services"
echo ""

# Wait for background processes
wait
