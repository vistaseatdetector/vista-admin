#!/usr/bin/env python3
"""
Standalone YOLOv11 People Detector
==================================

A minimal CLI tool for real-time people detection using YOLOv11.
Detects only the 'person' class and displays bounding boxes with counts.

Usage:
    python tools/people_detect_yolov11.py --source 0 --show
    python tools/people_detect_yolov11.py --source video.mp4 --save output.mp4
    python tools/people_detect_yolov11.py --source rtsp://camera/stream --conf 0.5

Dependencies:
    pip install ultralytics opencv-python numpy

Note: If yolov11n.pt is not available, this script will fall back to yolov8n.pt
      To update for newer YOLO versions, modify the MODEL_WEIGHTS list below.
"""

import argparse
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np

# Handle potential NumPy 2.0 compatibility issues
# If you encounter NumPy 2.0 conflicts locally, install: pip install "numpy<2.0"
try:
    from ultralytics import YOLO
except ImportError:
    print("Error: ultralytics not installed. Run: pip install ultralytics")
    sys.exit(1)

# Model weights to try in order of preference
# TODO: Update this list when newer YOLO versions are released
MODEL_WEIGHTS = [
    "yolov11n.pt",    # YOLOv11 nano - fastest
    "yolov11s.pt",    # YOLOv11 small
    "yolov8n.pt",     # Fallback to YOLOv8 nano
    "yolov8s.pt",     # Fallback to YOLOv8 small
]

# COCO class names - we only care about 'person' (class 0)
COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
    'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
    'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
    'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
    'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
    'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
    'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
    'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
]

PERSON_CLASS_ID = 0  # 'person' is class 0 in COCO dataset


def load_model() -> YOLO:
    """Load YOLOv11 model, falling back to YOLOv8 if needed."""
    model = None
    
    for weights in MODEL_WEIGHTS:
        try:
            print(f"Trying to load {weights}...")
            model = YOLO(weights)
            print(f"✅ Successfully loaded {weights}")
            break
        except Exception as e:
            print(f"❌ Failed to load {weights}: {e}")
            continue
    
    if model is None:
        print("❌ Could not load any YOLO model. Please install a supported model.")
        print("Try: pip install ultralytics && python -c 'from ultralytics import YOLO; YOLO(\"yolov8n.pt\")'")
        sys.exit(1)
    
    return model


def get_video_source(source: str) -> Tuple[cv2.VideoCapture, str]:
    """Initialize video source (webcam, file, or RTSP stream)."""
    if source.isdigit():
        # Webcam
        cap = cv2.VideoCapture(int(source))
        source_type = f"Webcam {source}"
    elif source.startswith(('rtsp://', 'http://', 'https://')):
        # Network stream
        cap = cv2.VideoCapture(source)
        source_type = f"Stream {source}"
    else:
        # Video file
        if not Path(source).exists():
            print(f"❌ Video file not found: {source}")
            sys.exit(1)
        cap = cv2.VideoCapture(source)
        source_type = f"File {source}"
    
    if not cap.isOpened():
        print(f"❌ Could not open video source: {source}")
        sys.exit(1)
    
    print(f"📹 Opened {source_type}")
    return cap, source_type


def setup_video_writer(cap: cv2.VideoCapture, output_path: str) -> Optional[cv2.VideoWriter]:
    """Set up video writer for saving output."""
    if not output_path:
        return None
    
    # Get video properties
    fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Define codec and create VideoWriter
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not writer.isOpened():
        print(f"❌ Could not create video writer: {output_path}")
        return None
    
    print(f"💾 Saving to: {output_path}")
    return writer


def draw_detections(frame: np.ndarray, detections, conf_threshold: float) -> Tuple[np.ndarray, int]:
    """Draw bounding boxes for people detections and return count."""
    people_count = 0
    
    if detections is None or len(detections) == 0:
        return frame, people_count
    
    # Extract detection data
    for detection in detections:
        boxes = detection.boxes
        if boxes is None:
            continue
            
        for i in range(len(boxes)):
            # Get box coordinates and confidence
            x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
            confidence = boxes.conf[i].cpu().numpy()
            class_id = int(boxes.cls[i].cpu().numpy())
            
            # Only process person detections above confidence threshold
            if class_id == PERSON_CLASS_ID and confidence >= conf_threshold:
                people_count += 1
                
                # Draw bounding box
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                
                # Draw label
                label = f"Person {confidence:.2f}"
                label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(frame, (int(x1), int(y1) - label_size[1] - 10), 
                            (int(x1) + label_size[0], int(y1)), (0, 255, 0), -1)
                cv2.putText(frame, label, (int(x1), int(y1) - 5), 
                          cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    
    return frame, people_count


def main():
    parser = argparse.ArgumentParser(description="Standalone YOLOv11 People Detector")
    parser.add_argument("--source", default="0", 
                       help="Video source: webcam index (0), file path, or RTSP URL")
    parser.add_argument("--save", default="", 
                       help="Optional output video path (e.g., output.mp4)")
    parser.add_argument("--show", action="store_true", 
                       help="Display live annotated window")
    parser.add_argument("--conf", type=float, default=0.25, 
                       help="Confidence threshold (0.0-1.0)")
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.show and not args.save:
        print("❌ Must specify either --show or --save (or both)")
        sys.exit(1)
    
    if not (0.0 <= args.conf <= 1.0):
        print("❌ Confidence threshold must be between 0.0 and 1.0")
        sys.exit(1)
    
    print("🚀 Starting YOLOv11 People Detector")
    print(f"📊 Confidence threshold: {args.conf}")
    
    # Load model
    model = load_model()
    
    # Set up video source
    cap, source_type = get_video_source(args.source)
    
    # Set up video writer if saving
    writer = setup_video_writer(cap, args.save) if args.save else None
    
    # Processing loop
    frame_count = 0
    start_time = time.time()
    
    try:
        print("\n🎯 Starting detection (Press 'q' or ESC to quit)")
        print("=" * 50)
        
        while True:
            ret, frame = cap.read()
            if not ret:
                print("📹 End of video stream")
                break
            
            frame_count += 1
            
            # Run inference
            results = model(frame, verbose=False)
            
            # Draw detections and get count
            annotated_frame, people_count = draw_detections(frame, results, args.conf)
            
            # Add frame info
            fps = frame_count / (time.time() - start_time)
            info_text = f"Frame: {frame_count} | People: {people_count} | FPS: {fps:.1f}"
            cv2.putText(annotated_frame, info_text, (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            # Print frame info
            print(f"Frame {frame_count:4d} | People detected: {people_count:2d} | FPS: {fps:5.1f}")
            
            # Save frame if writer is available
            if writer:
                writer.write(annotated_frame)
            
            # Display frame if requested
            if args.show:
                cv2.imshow("YOLOv11 People Detection", annotated_frame)
                
                # Check for quit key
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q') or key == 27:  # 'q' or ESC
                    print("\n👋 Quit requested by user")
                    break
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user (Ctrl+C)")
    
    except Exception as e:
        print(f"\n❌ Error during processing: {e}")
    
    finally:
        # Cleanup
        print("\n🧹 Cleaning up...")
        cap.release()
        if writer:
            writer.release()
        if args.show:
            cv2.destroyAllWindows()
        
        # Final stats
        elapsed = time.time() - start_time
        avg_fps = frame_count / elapsed if elapsed > 0 else 0
        print(f"📊 Final stats: {frame_count} frames in {elapsed:.1f}s (avg {avg_fps:.1f} FPS)")
        print("✅ Done!")


if __name__ == "__main__":
    main()