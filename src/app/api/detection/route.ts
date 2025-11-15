import { NextRequest, NextResponse } from "next/server";

// YOLO Detection Service URL
// Prefer server var DETECTION_SERVICE_URL; fall back to public var for convenience; then localhost.
const DETECTION_SERVICE_URL =
  process.env.DETECTION_SERVICE_URL ||
  process.env.NEXT_PUBLIC_DETECTION_API_URL ||
  "http://127.0.0.1:8001";
const DETECTION_HEALTH_CHECK = (process.env.DETECTION_HEALTH_CHECK || "true").toLowerCase() !== "false";
let lastHealthOkAt = 0;
const HEALTH_CACHE_MS = 15000; // cache OK health for 15s to avoid per-request overhead
const DETECTION_HEALTH_TIMEOUT_MS = (() => {
  const v = parseInt(process.env.DETECTION_HEALTH_TIMEOUT_MS || "5000", 10);
  return Number.isFinite(v) && v > 0 ? v : 5000;
})();

// Helper function to check if detection service is available
async function checkServiceHealth(): Promise<boolean> {
  try {
    const now = Date.now();
    if (lastHealthOkAt && (now - lastHealthOkAt) < HEALTH_CACHE_MS) {
      return true;
    }
    const response = await fetch(`${DETECTION_SERVICE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(DETECTION_HEALTH_TIMEOUT_MS)
    });
    const ok = response.ok;
    if (ok) lastHealthOkAt = Date.now();
    return ok;
  } catch (error) {
    console.warn(
      `Detection service health check failed after ${DETECTION_HEALTH_TIMEOUT_MS}ms:`,
      error
    );
    return false;
  }
}

// Types for detection requests
interface DetectSingleRequest {
  image_data: string;
  confidence?: number;
  suspicious_conf?: number;
  threat_conf?: number;
  suspicious_iou?: number;
  threat_iou?: number;
  llm_enabled?: boolean;
  stream_id?: string;
}

interface StreamStartRequest {
  source: string;
  confidence?: number;
  stream_id: string;
}

interface StreamStopRequest {
  stream_id: string;
}

interface StreamStatusRequest {
  stream_id: string;
}

interface HeartbeatRequest {
  stream_id: string;
}

interface ZoneUpdateRequest {
  zones: Array<{
    id: string;
    name: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    camera_id?: string;
  }>;
  camera_id: string;
}

// Helper function to transform frontend camera source to Python service format
function transformCameraSource(source: string): string {
  // Transform webcam:webcam:X to X for Python service
  if (source?.startsWith('webcam:')) {
    const deviceId = source.split(':')[2] || source.split(':')[1] || '0';
    return deviceId; // Return just the numeric ID
  }
  
  // For RTSP and other sources, return as-is
  return source || '0';
}

// Detection API route handlers
export async function POST(request: NextRequest) {
  try {
    // Validate content type
    const ct = request.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Unsupported Media Type: set Content-Type: application/json" },
        { status: 415 }
      );
    }

    // Parse body safely
    let parsed: any;
    try {
      parsed = await request.json();
    } catch (e: any) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Extract action and remaining data
    const { action, ...data } = parsed || {};
    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'action' in request body" },
        { status: 400 }
      );
    }

    switch (action) {
      case "detect":
        return await handleDetectSingle(data as DetectSingleRequest);
      case "stream_start":
        return await handleStreamStart(data as StreamStartRequest);
      case "stream_stop":
        return await handleStreamStop(data as StreamStopRequest);
      case "stream_status":
        return await handleStreamStatus(data as StreamStatusRequest);
      case "heartbeat":
        return await handleHeartbeat(data as HeartbeatRequest);
      case "zones_update":
        return await handleZonesUpdate(data as ZoneUpdateRequest);
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: detect, stream_start, stream_stop, stream_status, heartbeat, or zones_update" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Detection API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleDetectSingle(data: DetectSingleRequest) {
  try {
    // Optional health check gate (can be disabled with DETECTION_HEALTH_CHECK=false)
    if (DETECTION_HEALTH_CHECK) {
      const isServiceHealthy = await checkServiceHealth();
      if (!isServiceHealthy) {
        console.error("Detection service is not available at", DETECTION_SERVICE_URL);
        return NextResponse.json(
          {
            error: "Detection service unavailable",
            message: `Please start the Python detection service at ${DETECTION_SERVICE_URL}`,
          },
          { status: 503 }
        );
      }
    }

    const response = await fetch(`${DETECTION_SERVICE_URL}/detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_data: data.image_data,
        confidence: data.confidence || 0.25,
        suspicious_conf: typeof data.suspicious_conf === 'number' ? data.suspicious_conf : undefined,
        threat_conf: typeof data.threat_conf === 'number' ? data.threat_conf : undefined,
        suspicious_iou: typeof data.suspicious_iou === 'number' ? data.suspicious_iou : undefined,
        threat_iou: typeof data.threat_iou === 'number' ? data.threat_iou : undefined,
        llm_enabled: typeof data.llm_enabled === 'boolean' ? data.llm_enabled : undefined,
        stream_id: typeof data.stream_id === 'string' ? data.stream_id : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Detection service error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Single detection error:", error);
    return NextResponse.json(
      { error: "Failed to process detection" },
      { status: 500 }
    );
  }
}

async function handleStreamStart(data: StreamStartRequest) {
  try {
    // Check if detection service is available
    const isServiceHealthy = await checkServiceHealth();
    if (!isServiceHealthy) {
      console.error("Detection service is not available at", DETECTION_SERVICE_URL);
      return NextResponse.json(
        { 
          error: "Detection service unavailable", 
          message: "Please ensure the Python detection service is running on port 8001" 
        },
        { status: 503 }
      );
    }

    // Transform frontend camera source to Python service format
    const transformedSource = transformCameraSource(data.source);
    console.log('🔄 Transforming camera source:', data.source, '→', transformedSource);
    
    const response = await fetch(`${DETECTION_SERVICE_URL}/stream/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: transformedSource,
        confidence: data.confidence || 0.25,
        stream_id: data.stream_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stream start error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Stream start error:", error);
    return NextResponse.json(
      { error: "Failed to start detection stream" },
      { status: 500 }
    );
  }
}

async function handleStreamStop(data: StreamStopRequest) {
  try {
    const response = await fetch(`${DETECTION_SERVICE_URL}/stream/stop/${data.stream_id}`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stream stop error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Stream stop error:", error);
    return NextResponse.json(
      { error: "Failed to stop detection stream" },
      { status: 500 }
    );
  }
}

async function handleStreamStatus(data: StreamStatusRequest) {
  try {
    const response = await fetch(`${DETECTION_SERVICE_URL}/stream/status/${data.stream_id}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stream status error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Stream status error:", error);
    return NextResponse.json(
      { error: "Failed to get stream status" },
      { status: 500 }
    );
  }
}

async function handleHeartbeat(data: HeartbeatRequest) {
  try {
    const response = await fetch(`${DETECTION_SERVICE_URL}/stream/heartbeat/${data.stream_id}`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Heartbeat error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Heartbeat error:", error);
    return NextResponse.json(
      { error: "Failed to send heartbeat" },
      { status: 500 }
    );
  }
}

async function handleZonesUpdate(data: ZoneUpdateRequest) {
  try {
    console.log('🎯 Updating zones for camera:', data.camera_id, 'with', data.zones.length, 'zones');
    
    const response = await fetch(`${DETECTION_SERVICE_URL}/zones/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zones: data.zones,
        camera_id: data.camera_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zones update error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Zones updated successfully:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Zones update error:", error);
    return NextResponse.json(
      { error: "Failed to update zones" },
      { status: 500 }
    );
  }
}

// GET endpoint for listing all streams
export async function GET() {
  try {
    const response = await fetch(`${DETECTION_SERVICE_URL}/streams`);

    if (response.status === 404) {
      // Some backends (enhanced) may not implement /streams; return empty list gracefully
      return NextResponse.json([]);
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`List streams error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("List streams error:", error);
    return NextResponse.json(
      { error: "Failed to list streams" },
      { status: 500 }
    );
  }
}
