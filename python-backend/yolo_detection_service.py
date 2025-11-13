#!/usr/bin/env python3
"""
YOLOv11 Detection Service
========================

A FastAPI service for real-time people detection using YOLOv11.
Provides endpoints for processing single frames and streaming detection.

Usage:
    python python-backend/yolo_detection_service.py

Endpoints:
    POST /detect - Detect people in a single image
    POST /stream/start - Start streaming detection for a camera source
    GET /stream/status - Get current streaming status
    POST /stream/stop - Stop streaming detection

Dependencies:
    pip install fastapi uvicorn ultralytics opencv-python pillow numpy
"""

import asyncio
import base64
import io
import json
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image
import uvicorn

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from ultralytics import YOLO
except ImportError:
    logger.error("ultralytics not installed. Run: pip install ultralytics")
    sys.exit(1)

# Model weights to try in order of preference
MODEL_WEIGHTS = [
    "yolo11n.pt",    # YOLOv11 nano - fastest
    "yolo11s.pt",    # YOLOv11 small
    "yolov8n.pt",     # Fallback to YOLOv8 nano
]

PERSON_CLASS_ID = 0  # 'person' is class 0 in COCO dataset

# Stream configuration
STREAM_TIMEOUT_SECONDS = 300  # 5 minutes without heartbeat
HEARTBEAT_CHECK_INTERVAL = 60  # Check for stale streams every minute

# Global model instance
model: Optional[YOLO] = None
streaming_tasks: Dict[str, Dict[str, Any]] = {}
cleanup_task: Optional[asyncio.Task] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup the YOLO model."""
    global cleanup_task
    
    # Startup
    try:
        load_yolo_model()
        # Start cleanup task for stale streams
        cleanup_task = asyncio.create_task(cleanup_stale_streams())
        logger.info("🚀 YOLOv11 Detection Service started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize YOLO model: {e}")
        raise
    
    yield
    
    # Shutdown
    if cleanup_task:
        cleanup_task.cancel()
    
    # Stop all active streams
    for stream_id in list(streaming_tasks.keys()):
        try:
            streaming_tasks[stream_id]["is_active"] = False
            if streaming_tasks[stream_id].get("task"):
                streaming_tasks[stream_id]["task"].cancel()
        except Exception as e:
            logger.error(f"Error stopping stream {stream_id}: {e}")
    
    streaming_tasks.clear()
    logger.info("🧹 YOLOv11 Detection Service shutting down")

# FastAPI app
app = FastAPI(title="YOLOv11 Detection Service", version="1.0.0", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class DetectionRequest(BaseModel):
    image_data: str = Field(..., description="Base64 encoded image data")
    confidence: float = Field(0.25, description="Confidence threshold", ge=0.0, le=1.0)

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    label: str

class DetectionResponse(BaseModel):
    people_count: int
    detections: List[BoundingBox]
    processing_time: float
    image_width: int
    image_height: int

class StreamRequest(BaseModel):
    source: str = Field(..., description="Camera source (0, 1, rtsp://...)")
    confidence: float = Field(0.25, description="Confidence threshold", ge=0.0, le=1.0)
    stream_id: str = Field(..., description="Unique stream identifier")

class StreamStatus(BaseModel):
    stream_id: str
    is_active: bool
    source: str
    people_count: int
    detections: List[BoundingBox]
    processing_time: float
    frame_width: int
    frame_height: int
    last_detection_time: Optional[float]
    last_heartbeat: Optional[float]
    error: Optional[str]

def load_yolo_model() -> YOLO:
    """Load YOLOv11 model, trying multiple weight files."""
    global model
    
    if model is not None:
        return model
    
    # Try to find model weights in current directory and parent directories
    search_paths = [
        Path("."),
        Path("python-backend"),
        Path(".."),
        Path("../python-backend"),
    ]
    
    for weights in MODEL_WEIGHTS:
        for search_path in search_paths:
            model_path = search_path / weights
            if model_path.exists():
                try:
                    logger.info(f"Loading model from {model_path}")
                    model = YOLO(str(model_path))
                    logger.info(f"✅ Successfully loaded {model_path}")
                    return model
                except Exception as e:
                    logger.warning(f"❌ Failed to load {model_path}: {e}")
                    continue
        
        # Try downloading the model
        try:
            logger.info(f"Attempting to download {weights}")
            model = YOLO(weights)
            logger.info(f"✅ Successfully downloaded and loaded {weights}")
            return model
        except Exception as e:
            logger.warning(f"❌ Failed to download {weights}: {e}")
            continue
    
    raise RuntimeError("Could not load any YOLO model")

def decode_base64_image(image_data: str) -> np.ndarray:
    """Decode base64 image data to OpenCV format."""
    try:
        # Remove data URL prefix if present
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        # Decode base64
        image_bytes = base64.b64decode(image_data)
        
        # Convert to PIL Image
        pil_image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if necessary
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # Convert to OpenCV format (BGR)
        cv2_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        
        return cv2_image
    except Exception as e:
        raise ValueError(f"Failed to decode image: {e}")

def process_detections(results, confidence_threshold: float) -> Tuple[List[BoundingBox], int]:
    """Process YOLO detection results and return bounding boxes for people."""
    detections = []
    people_count = 0
    
    if not results or len(results) == 0:
        return detections, people_count
    
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
            
        for i in range(len(boxes)):
            # Get detection data
            x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
            confidence = float(boxes.conf[i].cpu().numpy())
            class_id = int(boxes.cls[i].cpu().numpy())
            
            # Only process person detections above confidence threshold
            if class_id == PERSON_CLASS_ID and confidence >= confidence_threshold:
                people_count += 1
                
                bbox = BoundingBox(
                    x1=float(x1),
                    y1=float(y1),
                    x2=float(x2),
                    y2=float(y2),
                    confidence=confidence,
                    label=f"Person ({confidence:.2f})"
                )
                detections.append(bbox)
    
    return detections, people_count

async def cleanup_stale_streams():
    """Background task to cleanup streams that haven't received heartbeats."""
    while True:
        try:
            current_time = time.time()
            stale_streams = []
            
            for stream_id, stream_data in streaming_tasks.items():
                last_heartbeat = stream_data.get("last_heartbeat", 0)
                if current_time - last_heartbeat > STREAM_TIMEOUT_SECONDS:
                    stale_streams.append(stream_id)
            
            for stream_id in stale_streams:
                logger.info(f"Cleaning up stale stream: {stream_id}")
                try:
                    stream_data = streaming_tasks[stream_id]
                    stream_data["is_active"] = False
                    if stream_data.get("task"):
                        stream_data["task"].cancel()
                    del streaming_tasks[stream_id]
                except Exception as e:
                    logger.error(f"Error cleaning up stream {stream_id}: {e}")
            
            await asyncio.sleep(HEARTBEAT_CHECK_INTERVAL)
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in cleanup task: {e}")
            await asyncio.sleep(HEARTBEAT_CHECK_INTERVAL)

@app.post("/detect", response_model=DetectionResponse)
async def detect_people(request: DetectionRequest):
    """Detect people in a single image."""
    start_time = time.time()
    
    try:
        # Decode image
        image = decode_base64_image(request.image_data)
        height, width = image.shape[:2]
        
        # Debug: Log image dimensions
        logger.info(f"Processing image: {width}x{height} pixels")
        
        # Run inference with optimized parameters
        results = model(image, verbose=False)
        
        # Process detections
        detections, people_count = process_detections(results, request.confidence)
        
        processing_time = time.time() - start_time
        
        return DetectionResponse(
            people_count=people_count,
            detections=detections,
            processing_time=processing_time,
            image_width=width,
            image_height=height
        )
        
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")

@app.post("/stream/start")
async def start_stream(request: StreamRequest, background_tasks: BackgroundTasks):
    """Start streaming detection for a camera source."""
    if request.stream_id in streaming_tasks:
        # Update heartbeat for existing stream
        streaming_tasks[request.stream_id]["last_heartbeat"] = time.time()
        return {"message": f"Stream {request.stream_id} heartbeat updated", "stream_id": request.stream_id}
    
    # Initialize stream data
    current_time = time.time()
    streaming_tasks[request.stream_id] = {
        "source": request.source,
        "confidence": request.confidence,
        "is_active": True,
        "people_count": 0,
        "last_detection_time": None,
        "last_heartbeat": current_time,
        "error": None,
        "task": None
    }
    
    # Start background task
    task = asyncio.create_task(stream_detection_task(request.stream_id))
    streaming_tasks[request.stream_id]["task"] = task
    
    logger.info(f"Started new stream {request.stream_id} from source {request.source}")
    return {"message": f"Stream {request.stream_id} started", "stream_id": request.stream_id}

@app.get("/stream/status/{stream_id}", response_model=StreamStatus)
async def get_stream_status(stream_id: str):
    """Get the status of a streaming detection."""
    if stream_id not in streaming_tasks:
        raise HTTPException(status_code=404, detail=f"Stream {stream_id} not found")
    
    stream_data = streaming_tasks[stream_id]
    
    # Update heartbeat when status is checked
    stream_data["last_heartbeat"] = time.time()
    
    return StreamStatus(
        stream_id=stream_id,
        is_active=stream_data["is_active"],
        source=stream_data["source"],
        people_count=stream_data["people_count"],
        detections=stream_data.get("detections", []),
        processing_time=stream_data.get("processing_time", 0.0),
        frame_width=stream_data.get("frame_width", 1280),
        frame_height=stream_data.get("frame_height", 720),
        last_detection_time=stream_data["last_detection_time"],
        last_heartbeat=stream_data.get("last_heartbeat"),
        error=stream_data["error"]
    )

@app.post("/stream/stop/{stream_id}")
async def stop_stream(stream_id: str):
    """Stop a streaming detection."""
    if stream_id not in streaming_tasks:
        raise HTTPException(status_code=404, detail=f"Stream {stream_id} not found")
    
    stream_data = streaming_tasks[stream_id]
    stream_data["is_active"] = False
    
    # Cancel the task if it exists
    if stream_data["task"]:
        stream_data["task"].cancel()
    
    # Remove from active streams
    del streaming_tasks[stream_id]
    
    return {"message": f"Stream {stream_id} stopped"}

@app.get("/streams", response_model=List[StreamStatus])
async def list_streams():
    """List all active streams."""
    return [
        StreamStatus(
            stream_id=stream_id,
            is_active=data["is_active"],
            source=data["source"],
            people_count=data["people_count"],
            detections=data.get("detections", []),
            processing_time=data.get("processing_time", 0.0),
            frame_width=data.get("frame_width", 1280),
            frame_height=data.get("frame_height", 720),
            last_detection_time=data["last_detection_time"],
            last_heartbeat=data.get("last_heartbeat"),
            error=data["error"]
        )
        for stream_id, data in streaming_tasks.items()
    ]

async def stream_detection_task(stream_id: str):
    """Background task for streaming detection."""
    stream_data = streaming_tasks[stream_id]
    source = stream_data["source"]
    confidence = stream_data["confidence"]
    
    cap = None
    
    try:
        # Open video source
        if source.isdigit():
            cap = cv2.VideoCapture(int(source))
        else:
            cap = cv2.VideoCapture(source)
        
        if not cap.isOpened():
            raise ValueError(f"Could not open video source: {source}")
        
        # Set consistent resolution to match frontend expectations
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        # Log actual resolution after setting
        actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(f"Stream {stream_id}: Set resolution to {actual_width}x{actual_height}")
        
        logger.info(f"Started stream detection for {stream_id} from {source}")
        
        while stream_data["is_active"]:
            ret, frame = cap.read()
            if not ret:
                logger.warning(f"Failed to read frame from {source}")
                await asyncio.sleep(1)
                continue
            
            # Run detection
            start_time = time.time()
            results = model(frame, verbose=False)
            detections, people_count = process_detections(results, confidence)
            processing_time = time.time() - start_time
            
            # Store actual frame dimensions
            height, width = frame.shape[:2]
            stream_data["frame_width"] = width
            stream_data["frame_height"] = height
            
            # Log frame dimensions periodically
            if len(detections) > 0 and int(time.time()) % 5 == 0:
                logger.info(f"Frame size: {width}x{height}, detections: {len(detections)}")
            
            # Update stream data
            stream_data["people_count"] = people_count
            stream_data["detections"] = detections
            stream_data["processing_time"] = processing_time
            stream_data["last_detection_time"] = time.time()
            
            # Log detection results periodically
            if int(time.time()) % 10 == 0:  # Every 10 seconds
                logger.info(f"Stream {stream_id}: {people_count} people detected")
            
            # Small delay to prevent overloading
            await asyncio.sleep(0.1)
    
    except asyncio.CancelledError:
        logger.info(f"Stream {stream_id} task cancelled")
    except Exception as e:
        logger.error(f"Stream {stream_id} error: {e}")
        stream_data["error"] = str(e)
        stream_data["is_active"] = False
    finally:
        if cap:
            cap.release()
        logger.info(f"Stream {stream_id} task ended")

@app.post("/stream/heartbeat/{stream_id}")
async def stream_heartbeat(stream_id: str):
    """Send a heartbeat to keep the stream alive."""
    if stream_id not in streaming_tasks:
        raise HTTPException(status_code=404, detail=f"Stream {stream_id} not found")
    
    streaming_tasks[stream_id]["last_heartbeat"] = time.time()
    return {"message": f"Heartbeat received for stream {stream_id}"}

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "active_streams": len(streaming_tasks),
        "timestamp": time.time()
    }

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="YOLOv11 Detection Service")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8001, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    
    args = parser.parse_args()
    
    uvicorn.run(
        "yolo_detection_service:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )