# Vista Admin - Technical Configuration & Service Connections

## 🖥️ **Service Configuration Overview**

### **Port Allocation**
```
┌─────────────────────┬──────┬─────────────────────────────────────┐
│ Service             │ Port │ Purpose                             │
├─────────────────────┼──────┼─────────────────────────────────────┤
│ Next.js Dev Server  │ 3000 │ Frontend UI & API routes           │
│ Python YOLO Service │ 8001 │ Detection & zone counting           │
│ Supabase Local      │ 54321│ Database (when using local)         │
│ Supabase Remote     │ 443  │ Production database                 │
└─────────────────────┴──────┴─────────────────────────────────────┘
```

### **Environment Configuration**

#### **Frontend (.env.local)**
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://wfiwrvvrzfepcwjfrare.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...

# Detection Service
DETECTION_SERVICE_URL=http://127.0.0.1:8001

# Development Flags
DEV_MODE=true
SKIP_AUTH=true
```

#### **Python Service Configuration**
```python
# yolo_detection_service_enhanced.py
HOST = "127.0.0.1"
PORT = 8001
MODEL_PATH = "yolo11n.pt"
CONFIDENCE_THRESHOLD = 0.5
TRACKER_CONFIG = "bytetrack.yaml"

# Dependencies
REQUIRED_PACKAGES = [
    "ultralytics>=8.3.0",    # YOLO model
    "fastapi>=0.104.0",      # Web framework
    "uvicorn>=0.24.0",       # ASGI server
    "lap>=0.5.12",           # ByteTrack dependency
    "cython-bbox>=0.1.3",   # Bounding box utilities
    "opencv-python>=4.8.0",  # Image processing
    "torch>=2.0.0",          # Neural network backend
    "numpy>=1.24.0"          # Numerical computing
]
```

## 🔌 **API Endpoint Mapping**

### **Frontend API Routes (`src/app/api/detection/route.ts`)**
```typescript
POST /api/detection
├── action: "detect"
│   ├─► Python: POST /detect
│   └─► Returns: DetectionResponse
├── action: "zones_update" 
│   ├─► Python: POST /zones/update
│   └─► Returns: Success/Error
├── action: "stream_start"
│   ├─► Python: POST /stream/start
│   └─► Returns: StreamResponse
└── action: "stream_heartbeat"
    ├─► Python: POST /stream/heartbeat
    └─► Returns: HeartbeatResponse
```

### **Python Service Endpoints**
```python
# Health & Status
GET  /health           → {"status": "healthy", "model_loaded": true}
GET  /occupancy        → {"current_occupancy": 3, "total_entries": 15}

# Zone Management  
POST /zones/update     → Update zone definitions
                        Body: {"camera_id": "webcam:0", "zones": [...]}

# Detection Processing
POST /detect           → Process single frame
                        Body: {"image_data": "base64...", "confidence": 0.5}

# Stream Management
POST /stream/start     → Start continuous detection
POST /stream/heartbeat → Keep stream alive
POST /stream/stop      → Stop detection stream
```

## 📁 **File Dependency Map**

### **Frontend Dependencies**
```
src/app/app/org/[slug]/page.tsx (Dashboard)
├── contexts/DetectionContext.tsx
├── components/WebcamStream.tsx (SharedCamera)
├── lib/supabase/client.ts
└── app/api/detection/route.ts

src/app/app/org/[slug]/doors/page.tsx (Zone Drawing)
├── contexts/DetectionContext.tsx
├── components/WebcamStream.tsx
└── app/api/detection/route.ts

src/app/api/detection/route.ts (API Proxy)
├── lib/supabase/server.ts
└── Python Service (HTTP calls)

src/contexts/DetectionContext.tsx (State Management)
└── React Context API

src/components/WebcamStream.tsx (Camera)
├── contexts/CameraContext.tsx
├── contexts/DetectionContext.tsx
└── HTML5 MediaDevices API
```

### **Backend Dependencies**
```
yolo_detection_service_enhanced.py (Main Service)
├── ultralytics (YOLO model)
├── fastapi (Web framework)
├── uvicorn (ASGI server)
├── cv2 (OpenCV)
├── numpy (Arrays)
├── base64 (Image encoding)
└── asyncio (Async operations)

requirements.txt (Package Dependencies)
├── ultralytics>=8.3.0
├── fastapi>=0.104.0
├── uvicorn>=0.24.0
├── opencv-python>=4.8.0
├── pillow>=10.0.0
├── torch>=2.0.0
├── torchvision>=0.15.0
├── numpy>=1.24.0
├── lap>=0.5.12 (ByteTrack)
└── cython-bbox>=0.1.3 (ByteTrack)
```

## 🗄️ **Database Schema Integration**

### **Supabase Tables Used**
```sql
-- Camera Stream Configuration
cameras (
  id uuid PRIMARY KEY,
  name text,
  stream_url text,
  organization_id uuid,
  is_active boolean
);

-- Real-time Occupancy Data
vista_occupancy (
  id uuid PRIMARY KEY,
  camera_id text,
  current_occupancy integer,
  entry_count integer,
  exit_count integer,
  updated_at timestamp,
  organization_id uuid
);

-- Historical Metrics
vista_metrics (
  id uuid PRIMARY KEY,
  camera_id text,
  metric_type text, -- 'occupancy', 'entry', 'exit'
  value integer,
  recorded_at timestamp,
  organization_id uuid
);
```

### **Database Connection Flow**
```
Frontend → Supabase Client → Remote Database (Read/Write)
Python Service → Direct HTTP → Remote Database (Write Only)
```

## 🎛️ **Configuration Files Explained**

### **Next.js Configuration (`next.config.ts`)**
```typescript
const nextConfig = {
  // Turbopack configuration
  turbo: {
    rules: {
      // Exclude Python files from processing
      "**/*.py": ["raw"],
      "**/venv/**": ["ignore"],
      "**/__pycache__/**": ["ignore"]
    }
  },
  
  // Image optimization
  images: {
    domains: ['localhost', 'supabase.co'],
    formats: ['image/webp', 'image/avif']
  },
  
  // API rewrites
  async rewrites() {
    return [
      {
        source: '/python/:path*',
        destination: 'http://127.0.0.1:8001/:path*'
      }
    ];
  }
};
```

### **Turbopack Exclusions (`.turboignore`)**
```
# Exclude Python backend from Turbopack processing
python-backend/venv/
python-backend/venv_enhanced/
python-backend/__pycache__/
python-backend/*.pyc
python-backend/*.pyo
python-backend/*.log
python-backend/*.pt
```

### **TypeScript Configuration (`tsconfig.json`)**
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "ES6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{"name": "next"}],
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "python-backend"]
}
```

## 🔧 **Service Startup Sequence**

### **Development Environment**
```bash
# 1. Start Database (if using local)
npx supabase start

# 2. Start Python Detection Service
cd python-backend
python3 yolo_detection_service_enhanced.py &

# 3. Start Next.js Frontend
npm run dev

# 4. Services Ready
Frontend:  http://localhost:3000
API:       http://localhost:3000/api/detection
Python:    http://127.0.0.1:8001
Database:  https://wfiwrvvrzfepcwjfrare.supabase.co
```

### **Service Health Checks**
```bash
# Check Next.js
curl http://localhost:3000/api/detection -X POST \
  -H "Content-Type: application/json" \
  -d '{"action": "health"}'

# Check Python Service
curl http://127.0.0.1:8001/health

# Check Database
curl -H "apikey: YOUR_ANON_KEY" \
  https://wfiwrvvrzfepcwjfrare.supabase.co/rest/v1/cameras
```

## 🛡️ **Security & Authentication**

### **Development Mode**
```typescript
// middleware.ts - Development bypass
if (process.env.DEV_MODE === 'true') {
  console.log('🔧 DEV MODE: Skipping auth for', pathname);
  return NextResponse.next();
}
```

### **Production Security**
```typescript
// Supabase RLS (Row Level Security)
CREATE POLICY "Users can only see their org's data" ON cameras
  FOR ALL USING (organization_id = auth.jwt() ->> 'organization_id');

// API Authentication
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

This comprehensive breakdown shows how every component connects, from the frontend user interface down to the database storage and Python detection processing!