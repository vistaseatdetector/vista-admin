# Vista Admin Zone-Based Counting System - Architecture Overview

## 🏗️ **System Architecture Breakdown**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                Frontend (Next.js)                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Dashboard     │  │   Doors Page    │  │ Detection API   │  │ Shared Camera   │ │
│  │   (Main View)   │  │ (Zone Drawing)  │  │   (Proxy)       │  │   Component     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                     │                     │                     │        │
│           │                     │                     │                     │        │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                        DetectionContext (Global State)                          │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP Requests
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         Python Backend (Port 8001)                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                Enhanced YOLO Detection Service                                   │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │ │
│  │  │   YOLOv11   │  │  ByteTrack  │  │ ZoneTracker │  │     API Endpoints       │ │ │
│  │  │   Model     │  │  Tracking   │  │  (Counting) │  │ /health /zones/update   │ │ │
│  │  │             │  │             │  │             │  │ /detect /occupancy      │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Database Writes
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Supabase Database                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                     │
│  │   vista_metrics │  │ vista_occupancy │  │    cameras      │                     │
│  │     (counts)    │  │   (real-time)   │  │   (streams)     │                     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 🔄 **Data Flow Breakdown**

### **1. Zone Definition Flow**
```
User → Doors Page → Canvas Drawing → Zone Coordinates → localStorage → API Call → Python Service
```

### **2. Detection Flow**
```
Camera → SharedCamera → DetectionContext → API → Python Service → YOLO + ByteTrack → Zone Analysis → Response
```

### **3. Occupancy Update Flow**
```
Zone Crossing → ZoneTracker → Count Update → Database Write → Frontend Update → Dashboard Display
```

---

## 📁 **File-by-File Breakdown**

### **Frontend Components**

#### **1. Main Dashboard (`src/app/app/org/[slug]/page.tsx`)**
```typescript
// Purpose: Display occupancy metrics and camera feeds
// Key Features:
- Shows current occupancy, entries, exits
- Uses DetectionContext for real-time updates
- Displays camera feed with SharedCamera component
```

#### **2. Doors Page (`src/app/app/org/[slug]/doors/page.tsx`)**
```typescript
// Purpose: Zone drawing interface
// Key Features:
- Canvas-based zone drawing
- Zone management (add/edit/delete)
- Sends zone data to backend via API
- Stores zones in localStorage
```

#### **3. SharedCamera Component (`src/components/WebcamStream.tsx`)**
```typescript
// Purpose: Unified camera management
// Key Features:
- Prevents multiple camera conflicts
- Sends frames to detection service
- Receives detection results with occupancy data
- Updates DetectionContext with results
```

#### **4. DetectionContext (`src/contexts/DetectionContext.tsx`)**
```typescript
// Purpose: Global state management
// Data Structure:
interface DetectionResult {
  people_count: number;
  entry_count: number;      // New: zone-based entries
  exit_count: number;       // New: zone-based exits
  current_occupancy: number; // New: calculated occupancy
  detections: Detection[];
  processing_time: number;
}
```

#### **5. Detection API (`src/app/api/detection/route.ts`)**
```typescript
// Purpose: Proxy between frontend and Python service
// Endpoints:
- POST /api/detection (action: "detect") → Detection
- POST /api/detection (action: "zones_update") → Zone Update
- POST /api/detection (action: "stream_start") → Stream Management
```

### **Backend Components**

#### **6. Enhanced YOLO Service (`python-backend/yolo_detection_service_enhanced.py`)**
```python
# Purpose: Core detection service with tracking and zone counting
# Key Classes:

class Zone:
    # Represents a door zone with geometric boundaries
    - contains_point() → Check if point is in zone
    - center_in_zone() → Check if detection center is in zone

class TrackedPerson:
    # Individual person tracking data
    - track_id: Unique ByteTrack ID
    - zone_history: Zones this person has visited
    - has_been_counted: Prevents double counting

class ZoneTracker:
    # Main counting logic
    - update_zones() → Receive zones from frontend
    - process_detections() → Analyze movements and count
    - track_zone_transitions() → Entry/exit detection
```

#### **7. API Endpoints (Python Service)**
```python
# /health → Service status
# /zones/update → Receive zone definitions
# /detect → Process single frame with tracking
# /occupancy → Get current occupancy stats
```

---

## 🔌 **Connection Points**

### **Frontend ↔ Python Service**

#### **A. Zone Configuration**
```javascript
// Doors Page → Python Service
fetch('/api/detection', {
  method: 'POST',
  body: JSON.stringify({
    action: 'zones_update',
    zones: [
      {
        id: 'door_1',
        name: 'Main Entrance',
        x1: 100, y1: 100, x2: 300, y2: 400,
        camera_id: 'webcam:0'
      }
    ]
  })
})
```

#### **B. Frame Detection**
```javascript
// SharedCamera → Python Service
fetch('/api/detection', {
  method: 'POST',
  body: JSON.stringify({
    action: 'detect',
    image_data: base64Image,
    camera_id: 'webcam:0',
    confidence: 0.5
  })
})
```

### **Python Service ↔ Database**

#### **C. Occupancy Updates**
```python
# ZoneTracker → Supabase
supabase.table('vista_occupancy').upsert({
  'camera_id': camera_id,
  'current_occupancy': self.current_occupancy,
  'entry_count': self.entry_count,
  'exit_count': self.exit_count,
  'updated_at': datetime.utcnow()
})
```

---

## 🎯 **Key Integration Points**

### **1. Zone-Based Counting Logic**
```python
def track_zone_transitions(self, person: TrackedPerson, current_zones: List[str]):
    # Check if person entered a new zone
    for zone_id in current_zones:
        if zone_id not in person.zone_history:
            if not person.has_been_counted:
                self.entry_count += 1
                self.current_occupancy += 1
                person.has_been_counted = True
            person.zone_history.append(zone_id)
```

### **2. ByteTrack Integration**
```python
# YOLO detection with tracking
results = model.track(image, tracker="bytetrack.yaml", persist=True)

# Process tracked detections
for detection in results[0].boxes:
    if detection.id is not None:  # Has track ID
        track_id = int(detection.id)
        # Use track ID for consistent counting
```

### **3. Real-time Updates**
```typescript
// Frontend polling for updates
useEffect(() => {
  const interval = setInterval(async () => {
    // Send frame → Get detection results → Update UI
    const result = await detectPeople(frameData);
    setDetectionResult(result);
  }, 1000);
}, []);
```

---

## 🚀 **System Flow Example**

### **Complete User Journey:**

1. **Setup Phase:**
   - User opens doors page
   - Draws zones around door areas
   - Clicks "Save Zones"
   - Zones sent to Python service

2. **Detection Phase:**
   - Camera captures frames
   - SharedCamera sends frames to Python service
   - YOLO detects people
   - ByteTrack assigns consistent IDs
   - ZoneTracker checks zone crossings

3. **Counting Phase:**
   - Person enters zone → Entry count +1
   - Person tracked across frames
   - Person exits zone → No double counting
   - Occupancy calculated: entries - exits

4. **Display Phase:**
   - Results sent back to frontend
   - DetectionContext updated
   - Dashboard shows real-time occupancy
   - Database stores historical data

---

## 🔧 **Configuration Files**

- **`.turboignore`** → Excludes Python files from Next.js
- **`requirements.txt`** → Python dependencies including ByteTrack
- **`package.json`** → Next.js dependencies
- **`.env.local`** → Supabase configuration

This architecture provides accurate, zone-based people counting with persistent tracking, eliminating the double-counting issues of simple frame-by-frame detection!