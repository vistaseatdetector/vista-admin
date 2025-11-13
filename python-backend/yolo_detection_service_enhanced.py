#!/usr/bin/env python3
"""
Enhanced YOLOv11 Detection Service with ByteTrack and Zone-Based Counting
========================================================================

A FastAPI service for real-time people detection with tracking and
zone-based entry/exit counting. Provides endpoints for processing
single frames and retrieving occupancy/zone status.

Usage:
    python python-backend/yolo_detection_service_enhanced.py

Endpoints:
    GET  /health           - Service health check
    POST /detect           - Detect people in a single image
    POST /zones/update     - Update door zones for counting
    GET  /zones            - List configured zones
    GET  /occupancy        - Current occupancy stats

Dependencies:
    pip install fastapi uvicorn ultralytics opencv-python pillow numpy
"""

import asyncio
import math
import os
import base64
import io
import json
import logging
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from collections import defaultdict

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import httpx
from PIL import Image
import re
import uvicorn

# Setup logging (configurable via env)
_log_level_str = os.environ.get("LOG_LEVEL", "INFO").upper()
_log_level = getattr(logging, _log_level_str, logging.INFO)
logging.basicConfig(level=_log_level)
logger = logging.getLogger(__name__)

# Load environment variables from .env files if present so you don't have to export
try:
    # Load default .env in cwd
    load_dotenv()
    # Also try project-root .env.local (repo root is two levels up from this file)
    _repo_root = Path(__file__).resolve().parents[1]
    _env_local = _repo_root / ".env.local"
    if _env_local.exists():
        load_dotenv(_env_local, override=False)
except Exception as _e:
    logger.debug(f"dotenv load skipped/failed: {_e}")

# Optional fallback slot for your OpenAI API key.
# Recommended: provide the key via environment `OPENAI_API_KEY` (loaded from .env/.env.local).
# You may also set `OPENAI_API_KEY_FALLBACK` in the environment; otherwise this remains empty.
OPENAI_API_KEY_FALLBACK: str = os.environ.get("OPENAI_API_KEY_FALLBACK", "")

LLM_MODEL_DEFAULT: str = os.environ.get("LLM_MODEL", "gpt-4o-mini")
# Inference image size (shorter side). Smaller == faster, at some accuracy cost.
IMGSZ_DEFAULT: int = int(os.environ.get("DETECTION_IMGSZ", "640"))
# Auto-run LLM when any suspicious/threat detected (can disable via env)
LLM_AUTO_ON_THREAT: bool = os.environ.get("LLM_AUTO_ON_THREAT", "1").lower() not in {"0", "false", "no"}
# LLM cooldown in seconds (avoid spamming screenshots)
LLM_COOLDOWN_SECONDS: int = int(os.environ.get("LLM_COOLDOWN_SECONDS", "10"))
LLM_PER_TRACK_COOLDOWN_SECONDS: int = int(os.environ.get("LLM_PER_TRACK_COOLDOWN_SECONDS", str(LLM_COOLDOWN_SECONDS)))
# If true, mute 'threat' classification and report everything as 'suspicious' (no red boxes)
SUSPICIOUS_ONLY: bool = os.environ.get("SUSPICIOUS_ONLY", "0").lower() in {"1", "true", "yes"}
# Association tuning for mapping suspicious boxes → person tracks
THREAT_ASSOC_IOU_MIN: float = float(os.environ.get("THREAT_ASSOC_IOU_MIN", "0.10"))
THREAT_ASSOC_MAX_DIST_FRAC: float = float(os.environ.get("THREAT_ASSOC_MAX_DIST_FRAC", "0.08"))

def get_openai_api_key() -> Optional[str]:
    """Return an OpenAI API key from env, fallback constant, or .env.local.

    Order of preference:
    1) Environment variable `OPENAI_API_KEY` (already populated if .env loaded)
    2) `OPENAI_API_KEY_FALLBACK` constant in this file
    3) Direct read from repo `.env.local` if not already loaded
    """
    key = os.environ.get("OPENAI_API_KEY")
    if key and key.strip():
        return key.strip()
    if OPENAI_API_KEY_FALLBACK and OPENAI_API_KEY_FALLBACK.strip():
        return OPENAI_API_KEY_FALLBACK.strip()
    # Last resort, try to read .env.local without mutating process env
    try:
        from dotenv import dotenv_values
        repo_env_local = Path(__file__).resolve().parents[1] / ".env.local"
        if repo_env_local.exists():
            vals = dotenv_values(repo_env_local)
            key2 = vals.get("OPENAI_API_KEY")
            if key2 and key2.strip():
                return key2.strip()
    except Exception:
        pass
    return None

try:
    from ultralytics import YOLO
except ImportError:
    logger.error("ultralytics not installed. Run: pip install ultralytics")
    sys.exit(1)

# Optional: BYTETracker import (not required for model.track to work)
try:
    from ultralytics.trackers import BYTETracker  # type: ignore
except Exception:
    BYTETracker = None  # type: ignore
    logger.warning("BYTETracker module not available; proceeding with built-in tracking via model.track.")

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

# Zone and tracking configuration
ZONE_HISTORY_FRAMES = 30  # Remember zone entries for 30 frames
MINIMUM_ZONE_TIME = 5  # Minimum frames in zone before counting

# Global model instances
model: Optional[YOLO] = None
# Optional secondary model for threats/suspicious behavior
suspicious_model: Optional[YOLO] = None
suspicious_enabled: bool = True
suspicious_model_path: Optional[str] = None
streaming_tasks: Dict[str, Dict[str, Any]] = {}
cleanup_task: Optional[asyncio.Task] = None
# LLM cooldown tracker per stream
llm_last_trigger: Dict[str, float] = {}
# LLM cooldown tracker per stream and track id
llm_last_trigger_by_track: Dict[str, Dict[int, float]] = {}

@dataclass
class Zone:
    """Represents a door zone for counting entries/exits."""
    id: str
    name: str
    x1: float
    y1: float
    x2: float
    y2: float
    camera_id: str
    
    def contains_point(self, x: float, y: float) -> bool:
        """Check if a point is inside this zone."""
        return (min(self.x1, self.x2) <= x <= max(self.x1, self.x2) and 
                min(self.y1, self.y2) <= y <= max(self.y1, self.y2))
    
    def center_in_zone(self, x1: float, y1: float, x2: float, y2: float) -> bool:
        """Check if the center of a bounding box is in this zone."""
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2
        return self.contains_point(center_x, center_y)
    
    def person_in_zone_with_tolerance(self, x1: float, y1: float, x2: float, y2: float, tolerance: float = 0.2) -> bool:
        """Check if at least (1-tolerance) of a person's bounding box overlaps with this zone.
        
        Args:
            x1, y1, x2, y2: Person's bounding box coordinates
            tolerance: Fraction of person that can be outside the zone (default 0.2 = 20%)
        
        Returns:
            True if at least 80% of the person is within the zone
        """
        # Calculate intersection area between person bbox and zone
        zone_x1, zone_y1 = min(self.x1, self.x2), min(self.y1, self.y2)
        zone_x2, zone_y2 = max(self.x1, self.x2), max(self.y1, self.y2)
        
        # Find intersection rectangle
        intersect_x1 = max(x1, zone_x1)
        intersect_y1 = max(y1, zone_y1)
        intersect_x2 = min(x2, zone_x2)
        intersect_y2 = min(y2, zone_y2)
        
        # Check if there's any intersection
        if intersect_x1 >= intersect_x2 or intersect_y1 >= intersect_y2:
            return False
        
        # Calculate areas
        person_area = (x2 - x1) * (y2 - y1)
        intersection_area = (intersect_x2 - intersect_x1) * (intersect_y2 - intersect_y1)
        
        # Check if at least (1-tolerance) of the person is in the zone
        overlap_ratio = intersection_area / person_area if person_area > 0 else 0
        required_overlap = 1.0 - tolerance
        
        return overlap_ratio >= required_overlap

@dataclass
class TrackedPerson:
    """Represents a tracked person with zone entry history."""
    track_id: int
    zone_history: List[str]  # List of zone IDs this person has been in
    frame_count: int
    last_seen: int
    first_zone_entry: Optional[str] = None
    zone_entry_frame: int = 0
    has_been_counted: bool = False
    max_overlap_ratio: float = 0.0  # Track the maximum overlap ratio seen

class ZoneTracker:
    """Manages zone-based counting with ByteTrack integration."""
    
    def __init__(self):
        self.zones: Dict[str, Zone] = {}
        self.tracked_people: Dict[int, TrackedPerson] = {}
        self.entry_count = 0
        self.exit_count = 0
        self.current_occupancy = 0  # People currently in building
        self.persistent_occupancy = 0  # Cumulative count that persists
        self.frame_number = 0
        self.occupancy_mode = "persistent"  # "live" or "persistent"
        
    def update_zones(self, zones_data: List[Dict]) -> None:
        """Update the zones configuration."""
        self.zones.clear()
        logger.info(f"🗺️  ZONE UPDATE: Clearing existing zones and configuring {len(zones_data)} new door zones")
        
        for i, zone_data in enumerate(zones_data, 1):
            zone = Zone(
                id=zone_data["id"],
                name=zone_data["name"],
                x1=zone_data["x1"],
                y1=zone_data["y1"],
                x2=zone_data["x2"],
                y2=zone_data["y2"],
                camera_id=zone_data.get("camera_id", "")
            )
            self.zones[zone.id] = zone
            width = abs(zone.x2 - zone.x1)
            height = abs(zone.y2 - zone.y1)
            logger.info(f"   🚪 Zone {i}: '{zone.name}' ({zone.id}) - Area: {width}x{height} pixels at ({zone.x1}, {zone.y1})")
        
        timestamp = datetime.now().strftime("%H:%M:%S")
        logger.info(f"✅ Zone configuration complete at {timestamp}. {len(self.zones)} door zones active for detection.")
    
    def process_detections(self, tracked_detections: List[Tuple]) -> Dict[str, Any]:
        """
        Process tracked detections and count zone entries/exits.
        
        Args:
            tracked_detections: List of (track_id, x1, y1, x2, y2, confidence)
        
        Returns:
            Dict with counts and zone information
        """
        self.frame_number += 1
        current_frame_tracks = set()

        logger.info(f"[DEBUG] Processing {len(tracked_detections)} tracked detections this frame.")
        for track_id, x1, y1, x2, y2, confidence in tracked_detections:
            current_frame_tracks.add(track_id)
            
            # Initialize or update tracked person
            if track_id not in self.tracked_people:
                self.tracked_people[track_id] = TrackedPerson(
                    track_id=track_id,
                    zone_history=[],
                    frame_count=0,
                    last_seen=self.frame_number
                )
            
            person = self.tracked_people[track_id]
            person.last_seen = self.frame_number
            person.frame_count += 1
            
            # Enhanced: Track overlap ratio and count if it increases from >=0.5 to >=0.8
            logger.info(f"🧑 DETECTED PERSON: Track {track_id} at position ({x1:.0f}, {y1:.0f}) to ({x2:.0f}, {y2:.0f}), Confidence: {confidence:.2f}")
            for zone_id, zone in self.zones.items():
                # Calculate overlap ratio
                zone_x1, zone_y1 = min(zone.x1, zone.x2), min(zone.y1, zone.y2)
                zone_x2, zone_y2 = max(zone.x1, zone.x2), max(zone.y1, zone.y2)
                intersect_x1 = max(x1, zone_x1)
                intersect_y1 = max(y1, zone_y1)
                intersect_x2 = min(x2, zone_x2)
                intersect_y2 = min(y2, zone_y2)
                if intersect_x1 >= intersect_x2 or intersect_y1 >= intersect_y2:
                    overlap_ratio = 0.0
                else:
                    person_area = (x2 - x1) * (y2 - y1)
                    intersection_area = (intersect_x2 - intersect_x1) * (intersect_y2 - intersect_y1)
                    overlap_ratio = intersection_area / person_area if person_area > 0 else 0
                logger.info(f"🔎 Overlap ratio for track {track_id} in zone '{zone_id}' ({zone.name}): {overlap_ratio:.3f} | BBox: ({x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f}) | Zone: ({zone_x1},{zone_y1},{zone_x2},{zone_y2})")
                # Track max overlap
                if overlap_ratio > person.max_overlap_ratio:
                    logger.info(f"⬆️ New max overlap for track {track_id} in zone '{zone_id}': {overlap_ratio:.3f} (was {person.max_overlap_ratio:.3f})")
                    person.max_overlap_ratio = overlap_ratio
                # If person is now >=0.8 and was previously >=0.5 but <0.8, count as entry
                if (not person.has_been_counted and
                    person.max_overlap_ratio >= 0.5 and
                    overlap_ratio >= 0.8 and
                    person.frame_count >= MINIMUM_ZONE_TIME):
                    self.entry_count += 1
                    self.current_occupancy += 1
                    self.persistent_occupancy += 1
                    person.has_been_counted = True
                    zone_name = self.zones[zone_id].name if zone_id in self.zones else "Unknown"
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    logger.info(f"🚪 CONFIRMED ENTRY (50%→80%): Track {track_id} entered '{zone_name}' at {timestamp} (overlap: {overlap_ratio:.3f})")
                # Maintain zone history as before
                if overlap_ratio >= 0.8:
                    if not person.zone_history or person.zone_history[-1] != zone_id:
                        person.zone_history.append(zone_id)
                        if person.first_zone_entry is None:
                            person.first_zone_entry = zone_id
                            person.zone_entry_frame = self.frame_number
                            zone_name = self.zones[zone_id].name if zone_id in self.zones else "Unknown"
                            timestamp = datetime.now().strftime("%H:%M:%S")
                            logger.info(f"👤 PERSON DETECTED: Track ID {track_id} first entered '{zone_name}' (Zone: {zone_id}) at {timestamp}")
                            logger.info(f"   🟩 Position: ({x1:.0f}, {y1:.0f}) to ({x2:.0f}, {y2:.0f}), Confidence: {confidence:.2f}")
            
            # Keep zone history manageable
            if len(person.zone_history) > ZONE_HISTORY_FRAMES:
                person.zone_history = person.zone_history[-ZONE_HISTORY_FRAMES:]
        
        # Clean up old tracks (not seen for more than 30 frames)
        tracks_to_remove = []
        for track_id, person in self.tracked_people.items():
            if self.frame_number - person.last_seen > 30:
                tracks_to_remove.append(track_id)
                
                # Count as exit if they were previously counted
                if person.has_been_counted:
                    self.exit_count += 1
                    self.current_occupancy = max(0, self.current_occupancy - 1)
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    entry_zone_name = self.zones[person.first_zone_entry].name if person.first_zone_entry and person.first_zone_entry in self.zones else "Unknown"
                    total_frames_tracked = person.frame_count
                    logger.info(f"🚶 EXIT: Track {track_id} left the building at {timestamp}")
                    logger.info(f"   📊 Exit #{self.exit_count} | Current Occupancy: {self.current_occupancy} | Originally entered via: {entry_zone_name}")
                    logger.info(f"   ⏱️  Total time tracked: {total_frames_tracked} frames | Zone history: {person.zone_history}")
        
        for track_id in tracks_to_remove:
            del self.tracked_people[track_id]
        
        return {
            "entry_count": self.entry_count,
            "exit_count": self.exit_count,
            "current_occupancy": self.persistent_occupancy,  # Use persistent count for UI
            "live_occupancy": self.current_occupancy,  # Keep live count for internal tracking
            "active_tracks": len(current_frame_tracks),
            "zones_count": len(self.zones)
        }

# Global zone tracker
zone_tracker = ZoneTracker()

# Pydantic models
class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    label: str
    track_id: Optional[int] = None
    # Optional helpers for UI coloring and LLM verdict
    category: Optional[str] = None  # e.g., 'threat' or 'suspicious'
    llm_false_positive: Optional[bool] = None

class DetectionRequest(BaseModel):
    image_data: str = Field(..., description="Base64 encoded image")
    confidence: float = Field(default=0.25, ge=0.1, le=1.0)
    # Optional thresholds for suspicious/threat model
    suspicious_conf: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    threat_conf: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    suspicious_iou: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    threat_iou: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    # Control LLM usage from clients (e.g., disable for continuous polling)
    llm_enabled: Optional[bool] = Field(default=None)
    # Stream identifier to scope LLM cooldown
    stream_id: Optional[str] = Field(default=None, description="Stream identifier for cooldown scoping")

class DetectionResponse(BaseModel):
    people_count: int
    detections: List[BoundingBox]
    processing_time: float
    image_width: int
    image_height: int
    entry_count: int = 0
    exit_count: int = 0
    current_occupancy: int = 0
    # Threat/suspicious outputs (optional)
    threats: Optional[List[BoundingBox]] = None
    has_threat: Optional[bool] = None
    # LLM validation (optional)
    llm_is_false_positive: Optional[bool] = None
    llm_confidence: Optional[float] = None
    llm_reason: Optional[str] = None
    llm_model: Optional[str] = None
    # Debug fields for LLM pipeline
    llm_triggered: Optional[bool] = None
    llm_error: Optional[str] = None

class StreamStartRequest(BaseModel):
    source: str = Field(..., description="Camera source (e.g., '0' for webcam)")
    confidence: float = Field(default=0.25, ge=0.1, le=1.0)
    stream_id: str = Field(..., description="Unique stream identifier")

class StreamStatusRequest(BaseModel):
    stream_id: str

class StreamStopRequest(BaseModel):
    stream_id: str

class HeartbeatRequest(BaseModel):
    stream_id: str

class ZoneUpdateRequest(BaseModel):
    zones: List[Dict] = Field(..., description="List of zone configurations")
    camera_id: str = Field(..., description="Camera ID these zones belong to")

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    active_streams: int
    suspicious_loaded: bool
    threat_model_path: Optional[str] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup the YOLO model."""
    global cleanup_task
    
    # Startup
    try:
        load_yolo_model()
        load_suspicious_model()
        # Start cleanup task for stale streams
        cleanup_task = asyncio.create_task(cleanup_stale_streams())
        logger.info("🚀 Enhanced YOLOv11 Detection Service with ByteTrack started successfully")
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
    logger.info("🧹 Enhanced YOLOv11 Detection Service shutting down")

# Initialize FastAPI app
app = FastAPI(
    title="Enhanced YOLOv11 Detection Service",
    description="Real-time people detection with tracking and zone-based counting",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_yolo_model():
    """Load the YOLO model with fallback options."""
    global model
    
    script_dir = Path(__file__).parent
    
    for weight_file in MODEL_WEIGHTS:
        weight_path = script_dir / weight_file
        try:
            logger.info(f"🔄 Attempting to load model: {weight_path}")
            model = YOLO(str(weight_path))
            
            # Test the model with a dummy inference
            dummy_image = np.zeros((640, 640, 3), dtype=np.uint8)
            model(dummy_image, verbose=False)
            
            logger.info(f"✅ Successfully loaded model: {weight_file}")
            
            # Enhanced startup logging
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            logger.info(f"🚀 Enhanced YOLOv11 Detection Service with ByteTrack started successfully at {timestamp}")
            logger.info(f"🎯 Zone-based counting: ✅ Enabled")
            logger.info(f"🏃 Object tracking: ✅ ByteTrack")
            logger.info(f"🌐 API endpoint: http://127.0.0.1:8001")
            logger.info(f"📋 Available endpoints:")
            logger.info(f"   • GET  /health - Service health check")
            logger.info(f"   • POST /detect - Single frame detection")
            logger.info(f"   • POST /zones/update - Configure door zones")
            logger.info(f"   • GET  /occupancy - Current occupancy status")
            logger.info(f"🔍 Ready to detect people entering door zones!")
            return
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to load {weight_file}: {e}")
            continue
    
    # If no local weights work, try downloading YOLOv11n
    try:
        logger.info("📥 Downloading YOLOv11n model...")
        model = YOLO("yolo11n.pt")
        dummy_image = np.zeros((640, 640, 3), dtype=np.uint8)
        model(dummy_image, verbose=False)
        logger.info("✅ Successfully downloaded and loaded YOLOv11n")
        
        # Enhanced startup logging
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"🚀 Enhanced YOLOv11 Detection Service with ByteTrack started successfully at {timestamp}")
        logger.info(f"🎯 Zone-based counting: ✅ Enabled")
        logger.info(f"🏃 Object tracking: ✅ ByteTrack")
        logger.info(f"🌐 API endpoint: http://127.0.0.1:8001")
        logger.info(f"📋 Available endpoints:")
        logger.info(f"   • GET  /health - Service health check")
        logger.info(f"   • POST /detect - Single frame detection")
        logger.info(f"   • POST /zones/update - Configure door zones")
        logger.info(f"   • GET  /occupancy - Current occupancy status")
        logger.info(f"🔍 Ready to detect people entering door zones!")
    except Exception as e:
        logger.error(f"❌ Failed to load any YOLO model: {e}")
        raise RuntimeError("No YOLO model could be loaded")

def _find_existing_path(paths: List[Path]) -> Optional[Path]:
    for p in paths:
        try:
            if p.exists():
                return p
        except Exception:
            continue
    return None

def load_suspicious_model():
    """Load suspicious/threat detection YOLO model if available.

    Uses env var THREAT_MODEL_PATH if provided; otherwise tries common
    training output locations in this repo. Set THREAT_DETECTION_ENABLED=0
    to disable.
    """
    global suspicious_model, suspicious_enabled
    if os.environ.get("THREAT_DETECTION_ENABLED") in {"0", "false", "False"}:
        suspicious_enabled = False
        logger.info("🛑 Threat detection disabled by env")
        return

    # Build candidate paths
    repo_root = Path(__file__).resolve().parents[1]
    env_path = os.environ.get("THREAT_MODEL_PATH")
    candidates: List[Path] = []
    if env_path:
        candidates.append(Path(env_path))
    candidates += [
        repo_root / "suspicious_detection_training_package3" / "suspicious_detection_training" / "suspicious_model" / "weights" / "best.pt",
        repo_root / "suspicious_detection_training_package3" / "suspicious_detection_training" / "suspicious_model" / "weights" / "last.pt",
        repo_root / "suspicious_detection_training_package" / "suspicious_detection_training" / "suspicious_model" / "weights" / "best.pt",
        repo_root / "suspicious_detection_training_package" / "suspicious_detection_training" / "suspicious_model" / "weights" / "last.pt",
        # Canonical locations inside this repo (add your weights here)
        repo_root / "models" / "threats" / "weights" / "best.pt",
        repo_root / "models" / "threats" / "weights" / "last.pt",
        repo_root / "models" / "suspicious" / "weights" / "best.pt",
        repo_root / "models" / "suspicious" / "weights" / "last.pt",
        # simple fallbacks
        repo_root / "models" / "threats.pt",
        repo_root / "models" / "suspicious.pt",
    ]

    weight_path = _find_existing_path(candidates)
    if not weight_path:
        suspicious_enabled = False
        try:
            cand_str = "\n - " + "\n - ".join(str(p) for p in candidates)
        except Exception:
            cand_str = ""
        logger.warning(f"⚠️ Threat model weights not found. Checked these paths:{cand_str}\nSet THREAT_MODEL_PATH to override.")
        return

    try:
        logger.info(f"🧠 Loading threat model: {weight_path}")
        suspicious_model = YOLO(str(weight_path))
        # remember the path for diagnostics
        global suspicious_model_path
        suspicious_model_path = str(weight_path)
        # quick warmup
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        suspicious_model(dummy, verbose=False)
        suspicious_enabled = True
        logger.info("✅ Threat model ready")
    except Exception as e:
        suspicious_enabled = False
        logger.error(f"❌ Failed to load threat model: {e}")
        
def decode_base64_image(image_data: str) -> np.ndarray:
    """Decode base64 image data to OpenCV BGR using cv2.imdecode (fast)."""
    try:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        img_bytes = base64.b64decode(image_data)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("cv2.imdecode returned None")
        return img
    except Exception as e:
        raise ValueError(f"Failed to decode image: {e}")

def process_detections_with_tracking(results, confidence_threshold: float) -> Tuple[List[BoundingBox], List[Tuple]]:
    """Process YOLO detection results with tracking and return bounding boxes for people."""
    detections = []
    tracked_detections = []
    
    if not results or len(results) == 0:
        return detections, tracked_detections
    
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        
        # Extract tracking IDs if available
        track_ids = getattr(boxes, 'id', None)
        if track_ids is not None:
            track_ids = track_ids.cpu().numpy()
        
        for i in range(len(boxes)):
            # Get detection data
            x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
            confidence = float(boxes.conf[i].cpu().numpy())
            class_id = int(boxes.cls[i].cpu().numpy())
            
            # Only process person detections above confidence threshold
            if class_id == PERSON_CLASS_ID and confidence >= confidence_threshold:
                track_id = int(track_ids[i]) if track_ids is not None else None
                
                bbox = BoundingBox(
                    x1=float(x1),
                    y1=float(y1),
                    x2=float(x2),
                    y2=float(y2),
                    confidence=confidence,
                    label=f"Person ({confidence:.2f})",
                    track_id=track_id
                )
                detections.append(bbox)
                
                # For zone tracking (only if we have a track ID)
                if track_id is not None:
                    tracked_detections.append((track_id, float(x1), float(y1), float(x2), float(y2), confidence))
    
    return detections, tracked_detections

def _iou(ax1: float, ay1: float, ax2: float, ay2: float,
         bx1: float, by1: float, bx2: float, by2: float) -> float:
    """Compute IoU between two boxes in xyxy format."""
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    a_area = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    b_area = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom = a_area + b_area - inter
    return inter / denom if denom > 0 else 0.0

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

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy" if model is not None else "unhealthy",
        model_loaded=model is not None,
        active_streams=len(streaming_tasks),
        suspicious_loaded=bool(suspicious_model is not None and suspicious_enabled),
        threat_model_path=suspicious_model_path
    )

@app.post("/zones/update")
async def update_zones(request: ZoneUpdateRequest):
    """Update door zones for counting."""
    try:
        zone_tracker.update_zones(request.zones)
        return {
            "status": "success",
            "message": f"Updated {len(request.zones)} zones for camera {request.camera_id}",
            "zones_count": len(request.zones)
        }
    except Exception as e:
        logger.error(f"Error updating zones: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update zones: {e}")

@app.get("/zones/{camera_id}")
async def get_zones(camera_id: str):
    """Get current zones for a specific camera."""
    try:
        zones_list = []
        for zone_id, zone in zone_tracker.zones.items():
            zones_list.append({
                "id": zone_id,
                "name": zone.name,
                "x1": zone.x1,
                "y1": zone.y1,
                "x2": zone.x2,
                "y2": zone.y2
            })
        
        return {
            "camera_id": camera_id,
            "zones": zones_list,
            "zones_count": len(zones_list)
        }
    except Exception as e:
        logger.error(f"Error getting zones: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get zones: {e}")

@app.get("/zones")
async def get_all_zones():
    """Get all current zones."""
    try:
        zones_list = []
        for zone_id, zone in zone_tracker.zones.items():
            zones_list.append({
                "id": zone_id,
                "name": zone.name,
                "x1": zone.x1,
                "y1": zone.y1,
                "x2": zone.x2,
                "y2": zone.y2
            })
        
        return {
            "zones": zones_list,
            "zones_count": len(zones_list)
        }
    except Exception as e:
        logger.error(f"Error getting zones: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get zones: {e}")

@app.post("/detect", response_model=DetectionResponse)
async def detect_people(request: DetectionRequest):
    """Detect people in a single image with tracking and zone-based counting."""
    start_time = time.time()
    
    try:
        # Decode image
        image = decode_base64_image(request.image_data)
        height, width = image.shape[:2]
        
        # Run inference with tracking enabled (smaller imgsz for speed)
        results = model.track(image, verbose=False, tracker="bytetrack.yaml", persist=True, imgsz=IMGSZ_DEFAULT)

        # Process detections with tracking
        detections, tracked_detections = process_detections_with_tracking(results, request.confidence)
        logger.info(f"[DETECT DEBUG] Model returned {len(detections)} detections, {len(tracked_detections)} with track IDs.")
        
        # Debug: Log image dimensions and detection summary
        if len(detections) > 0:
            timestamp = datetime.now().strftime("%H:%M:%S")
            logger.info(f"🔍 FRAME ANALYSIS at {timestamp}: {width}x{height} pixels | {len(detections)} people detected | {len(tracked_detections)} with track IDs")
            
            # Log each person detected with tracking info
            for i, (track_id, x1, y1, x2, y2, confidence) in enumerate(tracked_detections, 1):
                center_x, center_y = (x1 + x2) / 2, (y1 + y2) / 2
                logger.debug(f"   👤 Person {i}: Track ID {track_id} at center ({center_x:.0f}, {center_y:.0f}), confidence: {confidence:.2f}")
        else:
            logger.debug(f"📷 Processing {width}x{height} frame - No people detected")
        
        # Process zone-based counting
        zone_stats = zone_tracker.process_detections(tracked_detections)
        
        processing_time = (time.time() - start_time) * 1000

        # Optional threats detection
        threats_list: Optional[List[BoundingBox]] = None
        has_threat: Optional[bool] = None
        llm_fp: Optional[bool] = None
        llm_conf: Optional[float] = None
        llm_reason: Optional[str] = None
        llm_model_used: Optional[str] = None
        llm_triggered_flag: Optional[bool] = None
        llm_error_msg: Optional[str] = None
        try:
            if suspicious_enabled and suspicious_model is not None:
                # Use a very low internal conf to gather candidates (LLM decision should not rely on confidence)
                run_conf = 0.01
                run_iou = 0.5
                if request.threat_iou is not None and request.suspicious_iou is not None:
                    run_iou = max(0.0, min(float(min(request.threat_iou, request.suspicious_iou)), 1.0))
                elif request.threat_iou is not None:
                    run_iou = max(0.0, min(float(request.threat_iou), 1.0))
                elif request.suspicious_iou is not None:
                    run_iou = max(0.0, min(float(request.suspicious_iou), 1.0))

                # Run suspicious/threat model at reduced imgsz for performance
                s_results = suspicious_model(image, verbose=False, conf=run_conf, iou=run_iou, imgsz=IMGSZ_DEFAULT)
                s_boxes_all: List[BoundingBox] = []  # all detections (no confidence filtering)
                s_boxes_ui: List[BoundingBox] = []   # UI-filtered detections
                # Try to get class names
                try:
                    names_map = getattr(suspicious_model.model, 'names', getattr(suspicious_model, 'names', {})) or {}
                except Exception:
                    names_map = {}
                # Separate thresholds per class family (UI only)
                threat_labels = set() if SUSPICIOUS_ONLY else {"weapon", "gun", "knife", "firearm"}
                s_conf_thr = float(request.suspicious_conf) if request.suspicious_conf is not None else 0.25
                t_conf_thr = float(request.threat_conf) if request.threat_conf is not None else 0.35
                for s_res in s_results:
                    s_boxes = s_res.boxes
                    if s_boxes is None:
                        continue
                    for i in range(len(s_boxes)):
                        sx1, sy1, sx2, sy2 = s_boxes.xyxy[i].cpu().numpy()
                        sconf = float(s_boxes.conf[i].cpu().numpy())
                        scls = int(s_boxes.cls[i].cpu().numpy())
                        s_label = str(names_map.get(scls, f"cls_{scls}"))
                        lower = s_label.lower()
                        # Always collect for LLM decision (no confidence gating)
                        s_boxes_all.append(BoundingBox(
                            x1=float(sx1), y1=float(sy1), x2=float(sx2), y2=float(sy2),
                            confidence=sconf, label=s_label,
                            category=("threat" if lower in threat_labels else "suspicious")
                        ))
                        # UI overlay can still apply thresholds
                        if (lower in threat_labels and sconf >= t_conf_thr) or (lower not in threat_labels and sconf >= s_conf_thr):
                            s_boxes_ui.append(BoundingBox(
                                x1=float(sx1), y1=float(sy1), x2=float(sx2), y2=float(sy2),
                                confidence=sconf, label=s_label,
                                category=("threat" if lower in threat_labels else "suspicious")
                            ))
                # Associate suspicious boxes to nearest tracked person (assign track_id)
                try:
                    persons = []
                    for td in tracked_detections:
                        try:
                            pid, px1, py1, px2, py2, pconf = td
                            if pid is None:
                                continue
                            persons.append((int(pid), float(px1), float(py1), float(px2), float(py2)))
                        except Exception:
                            continue
                    if persons:
                        def assign_track(b: BoundingBox) -> None:
                            # First, try IoU-based association
                            best_iou = 0.0
                            best_pid: Optional[int] = None
                            # Also track nearest center distance as fallback
                            min_dist = float("inf")
                            nearest_pid: Optional[int] = None
                            bx = (b.x1 + b.x2) / 2.0
                            by = (b.y1 + b.y2) / 2.0
                            for (pid, px1, py1, px2, py2) in persons:
                                iou_val = _iou(b.x1, b.y1, b.x2, b.y2, px1, py1, px2, py2)
                                if iou_val > best_iou:
                                    best_iou = iou_val
                                    best_pid = pid
                                pcx = (px1 + px2) / 2.0
                                pcy = (py1 + py2) / 2.0
                                d = math.hypot(bx - pcx, by - pcy)
                                if d < min_dist:
                                    min_dist = d
                                    nearest_pid = pid
                            if best_pid is not None and best_iou >= THREAT_ASSOC_IOU_MIN:
                                b.track_id = int(best_pid)
                            else:
                                # Fallback: nearest center within fraction of image diagonal
                                diag = math.hypot(float(width), float(height))
                                if nearest_pid is not None and min_dist <= THREAT_ASSOC_MAX_DIST_FRAC * diag:
                                    b.track_id = int(nearest_pid)
                        for bb in s_boxes_all:
                            assign_track(bb)
                        for bb in s_boxes_ui:
                            assign_track(bb)
                except Exception as _e:
                    logger.debug(f"Track assignment for suspicious boxes failed: {_e}")

                if s_boxes_ui:
                    threats_list = s_boxes_ui
                    has_threat = any((b.label or '').lower() in threat_labels for b in s_boxes_ui)
                    # LLM validation (best box by confidence)
                    try:
                        api_key = get_openai_api_key()
                        # Run immediately when threats/suspicious are detected.
                        # If LLM_AUTO_ON_THREAT=1 (default), ignore client gating unless explicitly set to False.
                        # If LLM_AUTO_ON_THREAT=1 (default), always run when threats detected,
                        # regardless of client-provided llm_enabled flag.
                        # If LLM_AUTO_ON_THREAT=0, only run when llm_enabled is True.
                        should_run_llm = bool(api_key) and (LLM_AUTO_ON_THREAT or (request.llm_enabled is True))
                        # Enforce per-track cooldown first (prefer one screenshot per detection/track)
                        stream_key = request.stream_id or "default"
                        now_ts = time.time()
                        # Pick candidate box for LLM: prefer boxes with an assigned track_id, choose largest area
                        def _area(b: BoundingBox) -> float:
                            return max(0.0, (b.x2 - b.x1)) * max(0.0, (b.y2 - b.y1))
                        boxes_pref = [b for b in s_boxes_all if getattr(b, 'track_id', None) is not None] or s_boxes_all
                        best_cand = max(boxes_pref, key=_area)
                        best_track_id = getattr(best_cand, 'track_id', None)
                        if should_run_llm and best_track_id is not None:
                            track_dict = llm_last_trigger_by_track.setdefault(stream_key, {})
                            t_last = track_dict.get(int(best_track_id), 0.0)
                            if (now_ts - t_last) < LLM_PER_TRACK_COOLDOWN_SECONDS:
                                should_run_llm = False
                                remaining_t = int(max(0, LLM_PER_TRACK_COOLDOWN_SECONDS - (now_ts - t_last)))
                                llm_error_msg = f"per-track cooldown active: {remaining_t}s remaining"
                                # Provide summary context
                                try:
                                    boxes_for_summary = sorted(s_boxes_ui or s_boxes_all, key=lambda b: getattr(b, 'confidence', 0.0), reverse=True)
                                    top = boxes_for_summary[:3]
                                    if top:
                                        parts = []
                                        for b in top:
                                            label = (b.label or 'object')
                                            conf = getattr(b, 'confidence', None)
                                            if conf is not None:
                                                parts.append(f"{label} ({conf:.2f})")
                                            else:
                                                parts.append(str(label))
                                        llm_reason = "Cooldown (track): detected " + ", ".join(parts)
                                except Exception:
                                    pass
                        # Enforce cooldown per stream
                        last_ts = llm_last_trigger.get(stream_key, 0.0)
                        if (now_ts - last_ts) < LLM_COOLDOWN_SECONDS:
                            should_run_llm = False
                            remaining = int(max(0, LLM_COOLDOWN_SECONDS - (now_ts - last_ts)))
                            llm_error_msg = f"cooldown active: {remaining}s remaining"
                            # Provide a human-readable summary of what the model saw so the UI can show context
                            try:
                                boxes_for_summary = sorted(s_boxes_ui or s_boxes_all, key=lambda b: getattr(b, 'confidence', 0.0), reverse=True)
                                top = boxes_for_summary[:3]
                                if top:
                                    parts = []
                                    for b in top:
                                        label = (b.label or 'object')
                                        conf = getattr(b, 'confidence', None)
                                        if conf is not None:
                                            parts.append(f"{label} ({conf:.2f})")
                                        else:
                                            parts.append(str(label))
                                    llm_reason = "Cooldown: detected " + ", ".join(parts)
                            except Exception:
                                # best-effort summary
                                pass
                        if should_run_llm and s_boxes_all:
                            # Set cooldown timestamp when we attempt to call LLM
                            llm_last_trigger[stream_key] = now_ts
                            if best_track_id is not None:
                                track_dict = llm_last_trigger_by_track.setdefault(stream_key, {})
                                track_dict[int(best_track_id)] = now_ts
                            llm_triggered_flag = True
                            logger.info("🧠 LLM auto-trigger: suspicious/threat detected; preparing screenshots...")
                            # Use selected candidate (prefer with track id)
                            best = best_cand
                            # Crop region
                            x1, y1, x2, y2 = map(int, [best.x1, best.y1, best.x2, best.y2])
                            x1 = max(0, x1); y1 = max(0, y1)
                            x2 = min(image.shape[1]-1, x2); y2 = min(image.shape[0]-1, y2)
                            crop = image[y1:y2, x1:x2].copy() if y2>y1 and x2>x1 else image

                            # Save snapshots to disk (full frame and crop)
                            try:
                                snap_root = Path(__file__).resolve().parent / "snapshots"
                                full_dir = snap_root / "full"
                                threat_dir = snap_root / "threats"
                                full_dir.mkdir(parents=True, exist_ok=True)
                                threat_dir.mkdir(parents=True, exist_ok=True)
                                ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                                safe_label = re.sub(r"[^a-zA-Z0-9_-]+", "_", (best.label or "unknown"))
                                stream_suffix = re.sub(r"[^a-zA-Z0-9_-]+", "_", (request.stream_id or "default"))
                                full_path = full_dir / f"{ts}_{stream_suffix}_full_frame.jpg"
                                crop_path = threat_dir / f"{ts}_{stream_suffix}_{safe_label}_crop.jpg"
                                try:
                                    cv2.imwrite(str(full_path), image)
                                except Exception as _e:
                                    logger.warning(f"⚠️ Failed to save full snapshot: {_e}")
                                try:
                                    cv2.imwrite(str(crop_path), crop)
                                except Exception as _e:
                                    logger.warning(f"⚠️ Failed to save crop snapshot: {_e}")
                                logger.info(f"💾 Saved snapshots: full={full_path} crop={crop_path}")
                            except Exception as _e:
                                logger.warning(f"⚠️ Snapshot save failed: {_e}")
                            # Encode both crop and full frame to data URLs
                            _, buf_crop = cv2.imencode('.jpg', crop)
                            b64_crop = base64.b64encode(buf_crop.tobytes()).decode('utf-8')
                            data_url_crop = f"data:image/jpeg;base64,{b64_crop}"
                            _, buf_full = cv2.imencode('.jpg', image)
                            b64_full = base64.b64encode(buf_full.tobytes()).decode('utf-8')
                            data_url_full = f"data:image/jpeg;base64,{b64_full}"
                            # Prepare OpenAI request
                            llm_model_used = os.environ.get('LLM_MODEL', LLM_MODEL_DEFAULT)
                            prompt = (
                                "You are a security assistant. A vision model flagged a potential threat or suspicious object/person.\n"
                                f"Vision label: {best.label}.\n"
                                "Provide a binary decision ONLY. Respond strictly as JSON with: "
                                "false_positive (boolean), reason (string).\n"
                                "Rules for reason: keep it to one short sentence (<= 18 words), "
                                "be specific about what is seen (e.g., 'metallic knife-like object', 'toy gun', 'cell phone'), "
                                "and include minimal context if obvious (e.g., 'in hand', 'on table', 'reflection')."
                            )
                            payload = {
                                "model": llm_model_used,
                                "messages": [
                                    {"role": "system", "content": "You are an expert security analyst helping filter false positives."},
                                    {"role": "user", "content": [
                                        {"type": "text", "text": prompt},
                                        {"type": "image_url", "image_url": {"url": data_url_full}},
                                        {"type": "image_url", "image_url": {"url": data_url_crop}}
                                    ]}
                                ],
                                "temperature": 0.2,
                                "response_format": {"type": "json_object"},
                                "max_tokens": 200,
                            }
                            headers = {
                                "Authorization": f"Bearer {api_key}",
                                "Content-Type": "application/json",
                            }
                            try:
                                async with httpx.AsyncClient(timeout=20) as client:
                                    r = await client.post("https://api.openai.com/v1/chat/completions", json=payload, headers=headers)
                                if r.status_code == 200:
                                    resp = r.json()
                                    content = resp['choices'][0]['message']['content']
                                    # Attempt to parse JSON content
                                    import json as _json
                                    try:
                                        obj = _json.loads(content)
                                        llm_fp = bool(obj.get('false_positive'))
                                        llm_conf = float(obj.get('confidence')) if obj.get('confidence') is not None else None
                                        llm_reason = str(obj.get('reason')) if obj.get('reason') is not None else None
                                        # model already set in llm_model_used
                                        logger.info(f"✅ LLM result: FP={llm_fp} conf={llm_conf} reason={llm_reason}")
                                    except Exception:
                                        logger.warning(f"⚠️ LLM content not JSON: {content}")
                                        llm_error_msg = "LLM returned non-JSON content"
                                        if not llm_reason:
                                            llm_reason = llm_error_msg
                                else:
                                    logger.warning(f"⚠️ LLM API error: {r.status_code} {r.text}")
                                    llm_error_msg = f"HTTP {r.status_code}"
                                    if not llm_reason:
                                        llm_reason = llm_error_msg
                            except Exception as e:
                                llm_error_msg = str(e)
                                logger.warning(f"⚠️ LLM validation failed: {e}")
                    except Exception as e:
                        llm_error_msg = str(e)
                        logger.warning(f"⚠️ LLM wrapper failed: {e}")

                    # If we have an LLM verdict, annotate threat boxes so the UI can gray them out when FP
                    try:
                        if llm_fp is not None and threats_list:
                            for b in threats_list:
                                b.llm_false_positive = bool(llm_fp)
                            # If LLM marked as false positive, clear top-level threat flag
                            if bool(llm_fp):
                                has_threat = False
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"⚠️ Threat detection failed: {e}")
        
        response = DetectionResponse(
            people_count=len(detections),
            detections=detections,
            processing_time=processing_time,
            image_width=width,
            image_height=height,
            entry_count=zone_stats["entry_count"],
            exit_count=zone_stats["exit_count"],
            current_occupancy=zone_stats["current_occupancy"],
            threats=threats_list,
            has_threat=has_threat,
            llm_is_false_positive=llm_fp,
            llm_confidence=llm_conf,
            llm_reason=llm_reason,
            llm_model=llm_model_used,
            llm_triggered=llm_triggered_flag,
            llm_error=llm_error_msg
        )
        
        logger.info(f"✅ Detection complete: {len(detections)} people, {zone_stats['current_occupancy']} occupancy, {processing_time:.1f}ms")
        return response
        
    except Exception as e:
        logger.error(f"❌ Detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")

# Stream endpoints would go here - similar to the original but with tracking support
# For brevity, I'll include just the essential ones

@app.get("/occupancy")
async def get_occupancy():
    """Get current occupancy statistics."""
    return {
        "current_occupancy": zone_tracker.persistent_occupancy,  # Return persistent count
        "live_occupancy": zone_tracker.current_occupancy,  # Also provide live count
        "total_entries": zone_tracker.entry_count,
        "total_exits": zone_tracker.exit_count,
        "zones_count": len(zone_tracker.zones),
        "active_tracks": len(zone_tracker.tracked_people)
    }

@app.post("/occupancy/reset")
async def reset_occupancy():
    """Reset occupancy counters."""
    zone_tracker.entry_count = 0
    zone_tracker.exit_count = 0
    zone_tracker.current_occupancy = 0
    zone_tracker.persistent_occupancy = 0
    zone_tracker.tracked_people.clear()
    logger.info("🔄 Occupancy counters reset")
    return {"status": "success", "message": "Occupancy counters reset"}

@app.post("/occupancy/mode")
async def set_occupancy_mode(mode: str):
    """Set occupancy mode: 'live' or 'persistent'."""
    if mode not in ["live", "persistent"]:
        raise HTTPException(status_code=400, detail="Mode must be 'live' or 'persistent'")
    
    zone_tracker.occupancy_mode = mode
    logger.info(f"🔄 Occupancy mode set to: {mode}")
    return {"status": "success", "mode": mode}

@app.post("/stream/heartbeat")
async def stream_heartbeat(request: HeartbeatRequest):
    """Update heartbeat for an active stream."""
    if request.stream_id not in streaming_tasks:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    streaming_tasks[request.stream_id]["last_heartbeat"] = time.time()
    return {"status": "success", "stream_id": request.stream_id}

if __name__ == "__main__":
    uvicorn.run(
        "yolo_detection_service_enhanced:app",
        host="127.0.0.1",
        port=8001,
        reload=False,
        access_log=True
    )
