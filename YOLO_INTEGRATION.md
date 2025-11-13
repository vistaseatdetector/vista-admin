# YOLOv11 Detection Integration

This document describes the YOLOv11 people detection system integrated into Vista Admin.

## Overview

The YOLOv11 integration provides real-time people detection for camera feeds, enabling automatic occupancy counting and visitor analytics. The system consists of:

1. **Python Detection Service** - FastAPI service running YOLOv11 models
2. **Next.js API Routes** - Interface between frontend and detection service
3. **Enhanced Camera Components** - React components with detection overlays
4. **Real-time Processing** - Live detection on camera streams

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser       │    │   Next.js API   │    │  Python Service │
│                 │    │                 │    │                 │
│ Camera Stream   │◄──►│ /api/detection  │◄──►│ YOLOv11 Models  │
│ + Overlays      │    │                 │    │ FastAPI Server  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Features

### 🤖 AI Detection
- **YOLOv11 Models**: Nano and Small models for different performance needs
- **People Detection**: Focuses specifically on person class (COCO class 0)
- **Confidence Thresholds**: Configurable detection sensitivity
- **Real-time Processing**: Live detection on video streams

### 📹 Camera Support
- **Webcam Detection**: USB cameras with device enumeration
- **RTSP Streams**: Network cameras (with conversion to web-compatible format)
- **HTTP Streams**: Direct HTTP video feeds
- **Multi-camera**: Support for multiple simultaneous camera feeds

### 🎯 Detection Features
- **Bounding Boxes**: Visual overlays showing detected people
- **People Counting**: Real-time count of detected individuals
- **Detection Intervals**: Configurable processing frequency
- **Performance Monitoring**: Processing time and FPS tracking

### 📊 Integration
- **Occupancy Tracking**: Automatic updates to occupancy database
- **Historical Data**: Detection results stored for analytics
- **Real-time Updates**: Live counts displayed in dashboard
- **Error Handling**: Robust error recovery and logging

## Installation

### 1. Install Python Dependencies

```bash
cd python-backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Download YOLOv11 Models

The system will automatically download models on first run, or you can manually place them:

```bash
# Models should be in python-backend/ directory
python-backend/yolo11n.pt  # Nano model (fastest)
python-backend/yolo11s.pt  # Small model (more accurate)
```

## Running the System

### Option 1: Automated Startup (Recommended)

```bash
./start-with-detection.sh
```

This script will:
- Start the YOLOv11 detection service on port 8001
- Start the Next.js development server on port 3000
- Handle cleanup when stopped

### Option 2: Manual Startup

**Terminal 1 - Detection Service:**
```bash
cd python-backend
source venv/bin/activate
python yolo_detection_service.py --host 0.0.0.0 --port 8001
```

**Terminal 2 - Next.js App:**
```bash
npm run dev
```

## API Reference

### Detection Service Endpoints

#### POST `/detect`
Single image detection.

**Request:**
```json
{
  "image_data": "base64_encoded_image",
  "confidence": 0.25
}
```

**Response:**
```json
{
  "people_count": 2,
  "detections": [
    {
      "x1": 100, "y1": 150,
      "x2": 200, "y2": 300,
      "confidence": 0.85,
      "label": "Person (0.85)"
    }
  ],
  "processing_time": 0.123,
  "image_width": 1280,
  "image_height": 720
}
```

#### POST `/stream/start`
Start streaming detection.

**Request:**
```json
{
  "source": "0",  // Camera source
  "confidence": 0.25,
  "stream_id": "camera_1"
}
```

#### GET `/stream/status/{stream_id}`
Get stream status and current people count.

#### POST `/stream/stop/{stream_id}`
Stop streaming detection.

#### GET `/streams`
List all active streams.

#### GET `/health`
Service health check.

### Next.js API Routes

#### POST `/api/detection`
Proxy to detection service with action-based routing.

**Actions:**
- `detect` - Single image detection
- `stream_start` - Start stream detection
- `stream_stop` - Stop stream detection
- `stream_status` - Get stream status

## Configuration

### Environment Variables

Create `.env.local`:

```bash
# Detection service URL
DETECTION_SERVICE_URL=http://127.0.0.1:8001

# Optional: Model preferences
YOLO_MODEL_PATH=python-backend/yolo11n.pt
```

### Detection Settings

Configure in the WebcamStreamWithDetection component:

```tsx
<WebcamStreamWithDetection
  enableDetection={true}
  detectionInterval={3000}  // 3 seconds
  cameraSource="webcam:0"
  onDetection={(result) => {
    console.log(`Detected ${result.people_count} people`);
  }}
/>
```

## Component Usage

### Basic Detection-Enabled Stream

```tsx
import WebcamStreamWithDetection from "@/components/WebcamStreamWithDetection";

function CameraView() {
  return (
    <WebcamStreamWithDetection
      isLarge={true}
      enableDetection={true}
      detectionInterval={2000}
      cameraSource="webcam:0"
      onDetection={(result) => {
        // Handle detection results
        updateOccupancy(result.people_count);
      }}
      onError={(error) => {
        console.error('Camera error:', error);
      }}
    />
  );
}
```

### Multiple Cameras with Detection

```tsx
const cameras = [
  { id: 'main', source: 'webcam:0', name: 'Main Entrance' },
  { id: 'side', source: 'webcam:1', name: 'Side Door' },
];

return (
  <div className="grid grid-cols-2 gap-4">
    {cameras.map(camera => (
      <WebcamStreamWithDetection
        key={camera.id}
        cameraSource={camera.source}
        enableDetection={true}
        onDetection={(result) => {
          updateCameraCount(camera.id, result.people_count);
        }}
      />
    ))}
  </div>
);
```

## Performance Optimization

### Model Selection
- **yolo11n.pt**: Fastest, lower accuracy (~30 FPS on modern hardware)
- **yolo11s.pt**: Balanced, better accuracy (~20 FPS on modern hardware)

### Detection Intervals
- **High frequency (1-2s)**: Real-time monitoring, higher CPU usage
- **Medium frequency (3-5s)**: Balanced performance
- **Low frequency (10s+)**: Periodic monitoring, lowest CPU usage

### Hardware Recommendations
- **Minimum**: 4GB RAM, modern CPU
- **Recommended**: 8GB+ RAM, dedicated GPU (CUDA support)
- **Optimal**: 16GB+ RAM, RTX 3060+ or similar

## Troubleshooting

### Common Issues

1. **Detection service fails to start**
   ```bash
   # Check Python dependencies
   pip install ultralytics opencv-python fastapi uvicorn
   
   # Verify model files
   ls python-backend/*.pt
   ```

2. **No detections appearing**
   - Check camera permissions
   - Verify detection service is running (http://localhost:8001/health)
   - Test with manual detection API call

3. **Poor detection accuracy**
   - Adjust confidence threshold (lower = more detections)
   - Ensure good lighting conditions
   - Try different model (yolo11s.pt for better accuracy)

4. **High CPU usage**
   - Increase detection interval
   - Use smaller model (yolo11n.pt)
   - Reduce video resolution

### Debug Mode

Enable detailed logging:

```bash
# Detection service with debug logging
python yolo_detection_service.py --host 0.0.0.0 --port 8001 --reload

# Check service logs
curl http://localhost:8001/health
```

### Performance Monitoring

Monitor detection performance:

```javascript
// In component
onDetection={(result) => {
  console.log({
    peopleCount: result.people_count,
    processingTime: result.processing_time,
    fps: 1 / result.processing_time
  });
}}
```

## Development

### Adding New Detection Features

1. **Extend Detection Service**
   ```python
   # In yolo_detection_service.py
   @app.post("/detect/advanced")
   async def detect_advanced(request: AdvancedDetectionRequest):
       # Custom detection logic
   ```

2. **Update API Routes**
   ```typescript
   // In /api/detection/route.ts
   case "advanced_detect":
     return await handleAdvancedDetection(data);
   ```

3. **Enhance Components**
   ```tsx
   // Add new detection features to WebcamStreamWithDetection
   ```

### Testing

```bash
# Test detection service
curl -X POST http://localhost:8001/detect \
  -H "Content-Type: application/json" \
  -d '{"image_data": "base64_data", "confidence": 0.25}'

# Test API routes
curl -X POST http://localhost:3000/api/detection \
  -H "Content-Type: application/json" \
  -d '{"action": "stream_start", "source": "0", "stream_id": "test"}'
```

## Security Considerations

- Detection service runs on localhost by default
- No authentication on detection endpoints (internal use only)
- Camera access requires user permission
- Detection data not stored permanently by default

## Future Enhancements

- [ ] Object tracking across frames
- [ ] Face recognition integration
- [ ] Zone-based detection (entrances, exits)
- [ ] Historical analytics dashboard
- [ ] Mobile app integration
- [ ] Cloud model hosting
- [ ] Custom model training

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs from detection service
3. Test individual components
4. Check GitHub issues

---

**Note**: This integration requires a modern web browser with camera access permissions and a system capable of running YOLOv11 models efficiently.