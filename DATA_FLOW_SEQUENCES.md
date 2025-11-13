# Vista Admin - Detailed Data Flow Sequences

## 🎬 **Sequence 1: Zone Setup Flow**

```
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  User   │    │ Doors Page  │    │Detection API│    │Python Service│    │ ZoneTracker │
└────┬────┘    └──────┬──────┘    └──────┬──────┘    └───────┬──────┘    └──────┬──────┘
     │                │                  │                   │                  │
     │ 1. Draw zone   │                  │                   │                  │
     │───────────────►│                  │                   │                  │
     │                │                  │                   │                  │
     │ 2. Save zones  │                  │                   │                  │
     │───────────────►│                  │                   │                  │
     │                │                  │                   │                  │
     │                │ 3. POST /api/detection               │                  │
     │                │    action: zones_update              │                  │
     │                │──────────────────►│                  │                  │
     │                │                  │                   │                  │
     │                │                  │ 4. POST /zones/update              │
     │                │                  │─────────────────────►│              │
     │                │                  │                   │                  │
     │                │                  │                   │ 5. update_zones()│
     │                │                  │                   │─────────────────►│
     │                │                  │                   │                  │
     │                │                  │ 6. Success response              │
     │                │                  │◄─────────────────────│              │
     │                │                  │                   │                  │
     │                │ 7. Zone saved    │                   │                  │
     │                │◄──────────────────│                   │                  │
     │                │                  │                   │                  │
     │ 8. Confirmation│                  │                   │                  │
     │◄───────────────│                  │                   │                  │
```

## 🎬 **Sequence 2: Real-time Detection Flow**

```
┌─────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────┐
│ Camera  │  │SharedCamera │  │Detection API│  │Python Service│  │ ZoneTracker │  │Database │
└────┬────┘  └──────┬──────┘  └──────┬──────┘  └───────┬──────┘  └──────┬──────┘  └────┬────┘
     │              │                │                 │                │             │
     │ 1. Capture   │                │                 │                │             │
     │   frame      │                │                 │                │             │
     │─────────────►│                │                 │                │             │
     │              │                │                 │                │             │
     │              │ 2. Convert to  │                 │                │             │
     │              │    base64      │                 │                │             │
     │              │                │                 │                │             │
     │              │ 3. POST /api/detection          │                │             │
     │              │    action: detect              │                │             │
     │              │────────────────►│                 │                │             │
     │              │                │                 │                │             │
     │              │                │ 4. POST /detect │                │             │
     │              │                │────────────────►│                │             │
     │              │                │                 │                │             │
     │              │                │                 │ 5. YOLO.track()│             │
     │              │                │                 │   (ByteTrack)  │             │
     │              │                │                 │                │             │
     │              │                │                 │ 6. process_detections()    │
     │              │                │                 │───────────────►│             │
     │              │                │                 │                │             │
     │              │                │                 │                │ 7. Check   │
     │              │                │                 │                │   zone      │
     │              │                │                 │                │   crossings │
     │              │                │                 │                │             │
     │              │                │                 │                │ 8. Update  │
     │              │                │                 │                │   counts   │
     │              │                │                 │                │             │
     │              │                │                 │                │ 9. Write to DB
     │              │                │                 │                │───────────►│
     │              │                │                 │                │             │
     │              │                │                 │ 10. Return occupancy stats│
     │              │                │                 │◄───────────────│             │
     │              │                │                 │                │             │
     │              │                │ 11. Detection response           │             │
     │              │                │◄────────────────│                │             │
     │              │                │                 │                │             │
     │              │ 12. Update     │                 │                │             │
     │              │    DetectionContext             │                │             │
     │              │                │                 │                │             │
```

## 🎬 **Sequence 3: Dashboard Display Flow**

```
┌─────────┐    ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
│Dashboard│    │DetectionCtx │    │  SharedCamera   │    │   Display   │
└────┬────┘    └──────┬──────┘    └────────┬────────┘    └──────┬──────┘
     │                │                     │                   │
     │ 1. useEffect   │                     │                   │
     │   (subscribe)  │                     │                   │
     │───────────────►│                     │                   │
     │                │                     │                   │
     │                │ 2. detectionResult │                   │
     │                │    updated          │                   │
     │                │                     │                   │
     │ 3. Update UI   │                     │                   │
     │   with new     │                     │                   │
     │   occupancy    │                     │                   │
     │                │                     │                   │
     │                │                     │ 4. Draw bounding │
     │                │                     │    boxes on      │
     │                │                     │    video         │
     │                │                     │─────────────────►│
     │                │                     │                   │
     │ 5. Show:       │                     │                   │
     │   - Entry: 15  │                     │                   │
     │   - Exit: 12   │                     │                   │
     │   - Current: 3 │                     │                   │
     │───────────────────────────────────────────────────────►│
```

## 📊 **Data Structures Breakdown**

### **Zone Definition (Frontend → Backend)**
```typescript
// Frontend format (Doors Page)
interface DoorZone {
  id: string;           // "door_1"
  name: string;         // "Main Entrance"
  x1: number;          // 100
  y1: number;          // 100  
  x2: number;          // 300
  y2: number;          // 400
  camera_id: string;   // "webcam:0"
  door_id: string;     // "main_door"
}

// Backend format (Python Service)
@dataclass
class Zone:
    id: str
    name: str
    x1: float
    y1: float
    x2: float
    y2: float
    camera_id: str
```

### **Detection Result (Backend → Frontend)**
```python
# Python Service Response
{
  "people_count": 2,
  "entry_count": 15,        # Total entries today
  "exit_count": 12,         # Total exits today
  "current_occupancy": 3,   # Current people inside
  "detections": [
    {
      "x1": 100, "y1": 100, "x2": 150, "y2": 200,
      "confidence": 0.85,
      "track_id": 42        # ByteTrack ID
    }
  ],
  "processing_time": 45.2
}
```

### **Tracked Person (Internal Python)**
```python
@dataclass
class TrackedPerson:
    track_id: int                    # ByteTrack assigned ID
    zone_history: List[str]          # ["zone_1", "zone_2"]
    frame_count: int                 # Frames since first seen
    last_seen: int                   # Last frame number
    first_zone_entry: Optional[str]  # First zone entered
    zone_entry_frame: int            # Frame when entered zone
    has_been_counted: bool           # Prevents double counting
```

## 🔄 **Key Integration Points Explained**

### **1. Zone Coordinate System**
```
Frontend Canvas (640x480) → Backend Processing (Any Resolution)
                          ↓
                   Automatic Scaling Applied
```

### **2. ByteTrack Persistence**
```
Frame N:   Person A (ID: 42) at (100, 100)
Frame N+1: Person A (ID: 42) at (105, 105)  ← Same ID maintained
Frame N+2: Person A (ID: 42) at (110, 110)  ← Consistent tracking
```

### **3. Zone Crossing Logic**
```python
# Entry Detection
if track_id in current_zones and track_id not in previous_zones:
    if not person.has_been_counted:
        entry_count += 1
        current_occupancy += 1
        person.has_been_counted = True

# Exit Detection  
if track_id not in current_zones and track_id in previous_zones:
    if person.has_been_counted:
        exit_count += 1
        current_occupancy -= 1
```

### **4. Error Handling Chain**
```
Camera Failure → SharedCamera Error → DetectionContext Default → Dashboard Shows "No Signal"
Zone API Error → Python Service 500 → Frontend Retry → User Notification
Database Error → Python Service Logs → Continue Detection → Background Retry
```

This system ensures robust, accurate people counting with minimal false positives!