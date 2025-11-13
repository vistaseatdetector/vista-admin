"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import { useCameraContext } from "@/contexts/CameraContext";
import { useDetectionContext } from "@/contexts/DetectionContext";

// Detection overlay component
interface DetectionOverlayProps {
  detections: BoundingBox[];
  peopleCount: number;
  processingTime: number;
  isDetecting: boolean;
  isLarge: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  threats?: BoundingBox[];
  hasThreat?: boolean;
  llmIsFalsePositive?: boolean;
}

function DetectionOverlay({ 
  detections, 
  peopleCount, 
  processingTime, 
  isDetecting, 
  isLarge,
  videoRef,
  threats,
  hasThreat,
  llmIsFalsePositive
}: DetectionOverlayProps) {
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastOverlaySizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Draw detection boxes
  const drawDetections = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video display size only when it changes
    const rect = video.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (lastOverlaySizeRef.current.w !== w || lastOverlaySizeRef.current.h !== h) {
      canvas.width = w;
      canvas.height = h;
      lastOverlaySizeRef.current = { w, h };
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // No early return; we might still draw threats

    // Calculate scale factors
    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;

    // Draw detection boxes (people) in green
    (detections || []).forEach((detection) => {
      const { x1, y1, x2, y2, confidence, label } = detection;

      // Scale coordinates to canvas size
      const scaledX1 = x1 * scaleX;
      const scaledY1 = y1 * scaleY;
      const scaledX2 = x2 * scaleX;
      const scaledY2 = y2 * scaleY;

      // Green boxes for people
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(scaledX1, scaledY1, scaledX2 - scaledX1, scaledY2 - scaledY1);

      // Label background
      ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      const displayLabel = label || `Person ${Math.round(confidence * 100)}%`;
      ctx.font = '12px Arial';
      const textMetrics = ctx.measureText(displayLabel);
      ctx.fillRect(scaledX1, scaledY1 - 20, textMetrics.width + 8, 20);

      // Label text
      ctx.fillStyle = '#000000';
      ctx.fillText(displayLabel, scaledX1 + 4, scaledY1 - 6);
    });

    // Draw alerts: threats (red) vs suspicious (amber); gray if LLM marked false positive
    if (threats && threats.length > 0) {
      const threatSet = new Set(['weapon', 'gun', 'knife', 'firearm', 'handgun', 'pistol', 'revolver', 'rifle', 'shotgun', 'machete', 'blade', 'sword']);
      threats.forEach((detection) => {
        const { x1, y1, x2, y2, confidence, label } = detection;
        const scaledX1 = x1 * scaleX;
        const scaledY1 = y1 * scaleY;
        const scaledX2 = x2 * scaleX;
        const scaledY2 = y2 * scaleY;

        const lower = (label || '').toLowerCase();
        const suspiciousOnly = (process.env.NEXT_PUBLIC_SUSPICIOUS_ONLY || '').toLowerCase() === '1' || (process.env.NEXT_PUBLIC_SUSPICIOUS_ONLY || '').toLowerCase() === 'true';
        const isThreat = !suspiciousOnly && ((detection.category === 'threat') || threatSet.has(lower) || Array.from(threatSet).some(w => lower.includes(w)));
        const isFPBox = !!(detection as any).llm_false_positive;
        const isFP = !!llmIsFalsePositive || isFPBox;
        const stroke = isFP ? '#9ca3af' : (isThreat ? '#ff3333' : '#ffb020');
        const fill = isFP ? 'rgba(156,163,175,0.85)' : (isThreat ? 'rgba(255, 51, 51, 0.85)' : 'rgba(255, 176, 32, 0.85)');
        const prefix = isFP ? 'LIKELY FALSE POSITIVE' : (isThreat ? 'THREAT' : 'SUSPICIOUS');

        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(scaledX1, scaledY1, scaledX2 - scaledX1, scaledY2 - scaledY1);

        ctx.fillStyle = fill;
        const displayLabel = `${prefix}: ${label || ''} ${Math.round((confidence || 0) * 100)}%`;
        ctx.font = '12px Arial';
        const textMetrics = ctx.measureText(displayLabel);
        ctx.fillRect(scaledX1, scaledY1 - 20, textMetrics.width + 8, 20);
        ctx.fillStyle = '#000000';
        ctx.fillText(displayLabel, scaledX1 + 4, scaledY1 - 6);
      });
    }
  }, [detections, threats, videoRef]);

  // Redraw when detections change
  useEffect(() => {
    drawDetections();
  }, [drawDetections]);

  return (
    <>
      {/* Detection canvas overlay */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10 }}
      />
      
      {/* Detection info overlay */}
      <div className="absolute top-2 left-2 z-20">
        <div className="bg-black/70 rounded px-2 py-1 text-xs text-white">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isDetecting ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span>People: {peopleCount}</span>
            {isLarge && (
              <span>• {processingTime.toFixed(0)}ms</span>
            )}
          </div>
        </div>
      </div>
      {/* Alert badge: prefer THREAT, else SUSPICIOUS */}
      {(hasThreat || (threats && threats.length > 0)) && (
        (() => {
          const threatSet = new Set(['weapon', 'gun', 'knife', 'firearm', 'handgun', 'pistol', 'revolver', 'rifle', 'shotgun', 'machete', 'blade', 'sword']);
          const anyThreat = hasThreat || !!(threats && threats.some(t => !((t as any).llm_false_positive) && ((t.category === 'threat') || threatSet.has((t.label || '').toLowerCase()) || Array.from(threatSet).some(w => (t.label || '').toLowerCase().includes(w)))));
          const label = anyThreat ? 'THREAT DETECTED' : 'SUSPICIOUS ACTIVITY';
          const bg = anyThreat ? 'bg-red-600/90 border-red-400/60' : 'bg-amber-500/90 border-amber-300/60';
          return (
            <div className="absolute top-2 right-2 z-20">
              <div className={`${bg} border rounded px-2 py-1 text-xs text-white font-semibold shadow`}>
                {label}
              </div>
            </div>
          );
        })()
      )}
    </>
  );
}

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  label: string;
  category?: string; // 'threat' | 'suspicious'
}

interface DetectionResult {
  people_count: number;
  detections: BoundingBox[];
  processing_time: number;
  image_width: number;
  image_height: number;
  timestamp: number;
  // Zone-based counting fields
  entry_count?: number;
  exit_count?: number;
  current_occupancy?: number;
  active_tracks?: number;
  zones_count?: number;
  // Threat/suspicious fields
  threats?: BoundingBox[];
  has_threat?: boolean;
  // Optional LLM validation fields
  llm_is_false_positive?: boolean;
  llm_confidence?: number;
  llm_reason?: string;
  llm_model?: string;
}

interface SharedCameraProps {
  cameraSource: string;
  isLarge?: boolean;
  enableDetection?: boolean;
  detectionFrameRate?: number; // FPS for detection (default 3 FPS)
  onError?: (error: Error) => void;
  onStatusChange?: (isActive: boolean) => void;
  onDetection?: (result: DetectionResult) => void;
  // Optional: expose the underlying <video> element via external ref
  videoElementRef?: RefObject<HTMLVideoElement | null>;
}

/**
 * Shared Camera Component - Uses CameraContext to prevent stream conflicts
 * This component persists camera streams across navigation and supports universal detection
 */
export default function SharedCamera({ 
  cameraSource,
  isLarge = false,
  enableDetection = false,
  detectionFrameRate = 1, // default to 1 FPS to reduce blinking
  onError,
  onStatusChange,
  onDetection,
  videoElementRef
}: SharedCameraProps) {
  console.log('🎬 SHARED-CAMERA: Component created with source:', cameraSource, 'isLarge:', isLarge, 'detection:', enableDetection);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache last capture canvas size to avoid realloc per frame
  const lastCaptureSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep callback props stable to avoid re-creating effects
  const onStatusChangeRef = useRef<typeof onStatusChange | null>(onStatusChange || null);
  const onErrorRef = useRef<typeof onError | null>(onError || null);
  useEffect(() => { onStatusChangeRef.current = onStatusChange || null; }, [onStatusChange]);
  useEffect(() => { onErrorRef.current = onError || null; }, [onError]);
  
  // Always call the hook, but handle if context is not available
  const cameraContext = useCameraContext();
  const detectionContext = useDetectionContext();
  console.log('🎬 SHARED-CAMERA: Camera context available:', !!cameraContext);
  console.log('🎯 SHARED-CAMERA: Detection context available:', !!detectionContext);
  
  const { getSharedStream, releaseSharedStream, isStreamActive } = cameraContext || {};
  
  const mountedRef = useRef(true);
  const currentStreamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    if (!mountedRef.current || !getSharedStream) {
      console.log('🚫 SHARED-CAMERA: Cannot start - component unmounted or context unavailable');
      return;
    }
    
    try {
      console.log('🎥 SHARED-CAMERA: Starting camera for', cameraSource);
      
      // Check for browser camera permissions first
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available in this browser');
      }
      
      // Try to enumerate devices first to check permissions
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('📷 SHARED-CAMERA: Found video devices:', videoDevices.length);
      } catch (enumError) {
        console.warn('📷 SHARED-CAMERA: Could not enumerate devices:', enumError);
      }
      
      setError(null);
      
      const stream = await getSharedStream(cameraSource);
      
      if (!mountedRef.current) {
        console.log('🚫 SHARED-CAMERA: Component unmounted, not setting video');
        return;
      }

      // Wait for video element to be available in the DOM
      let attempts = 0;
      const maxAttempts = 20;
      while (!videoRef.current && attempts < maxAttempts) {
        console.log(`⏳ SHARED-CAMERA: Waiting for video element (attempt ${attempts + 1}/${maxAttempts}) for`, cameraSource);
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }

      if (!videoRef.current) {
        console.log('❌ SHARED-CAMERA: Video element not available after waiting for', cameraSource);
        setError('Video element not available');
        return;
      }

      console.log('✅ SHARED-CAMERA: Video element found after', attempts, 'attempts for', cameraSource);
      
      currentStreamRef.current = stream;
      
      if (videoRef.current) {
        console.log('📺 SHARED-CAMERA: Video element found, configuring for', cameraSource);
        console.log('📺 SHARED-CAMERA: Stream details:', stream, 'Active tracks:', stream.getVideoTracks().length);
        
        // Only set srcObject if it's different
        if (videoRef.current.srcObject !== stream) {
          console.log('📺 SHARED-CAMERA: Setting new srcObject for', cameraSource);
          videoRef.current.srcObject = stream;
        } else {
          console.log('📺 SHARED-CAMERA: Stream already assigned to video element for', cameraSource);
        }
        
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        
        console.log('📺 SHARED-CAMERA: Attempting to play video for', cameraSource);
        
        try {
          const playPromise = videoRef.current.play();
          console.log('📺 SHARED-CAMERA: Play promise created for', cameraSource);
          await playPromise;
          console.log('✅ SHARED-CAMERA: Video playing successfully for', cameraSource);
          setIsActive(true);
          try { onStatusChangeRef.current?.(true); } catch {}
        } catch (playError) {
          console.error('❌ SHARED-CAMERA: Play error for', cameraSource, ':', playError);
          setError('Failed to play video: ' + (playError instanceof Error ? playError.message : 'Unknown error'));
        }
      } else {
        console.log('❌ SHARED-CAMERA: No video element found for', cameraSource);
      }
      
    } catch (err) {
      console.error('❌ SHARED-CAMERA: Camera error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown camera error';
      setError(errorMessage);
      setIsActive(false);
      try { onErrorRef.current?.(err instanceof Error ? err : new Error(errorMessage)); } catch {}
      try { onStatusChangeRef.current?.(false); } catch {}
    }
    }, [cameraSource, getSharedStream]);

  const stopCamera = useCallback(() => {
    console.log('🛑 SHARED-CAMERA: Stopping camera for', cameraSource);
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (currentStreamRef.current && releaseSharedStream) {
      releaseSharedStream(cameraSource);
      currentStreamRef.current = null;
    }
    
    setIsActive(false);
    try { onStatusChangeRef.current?.(false); } catch {}
  }, [cameraSource, releaseSharedStream]);

  // Start camera on mount or source change
  useEffect(() => {
    console.log('🎬 SHARED-CAMERA: useEffect triggered for source:', cameraSource, 'context available:', !!getSharedStream);
    if (cameraSource) {
      console.log('🎬 SHARED-CAMERA: Calling startCamera for:', cameraSource);
      startCamera();
    } else {
      console.log('🎬 SHARED-CAMERA: No camera source provided');
    }
    // Intentionally no cleanup here to avoid clearing srcObject on source switches.
    // Stream lifecycle is handled by the unmount-only effect below with a grace period.
  }, [cameraSource, startCamera, getSharedStream]);

  // Only release stream when component actually unmounts
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (currentStreamRef.current && releaseSharedStream) {
        releaseSharedStream(cameraSource);
      }
    };
  }, [cameraSource, releaseSharedStream]);

  // Detection functionality
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.readyState !== 4) return null;
    if (lastCaptureSizeRef.current.w !== video.videoWidth || lastCaptureSizeRef.current.h !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      lastCaptureSizeRef.current = { w: video.videoWidth, h: video.videoHeight };
    }
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, []);

  // Non-blocking capture using toBlob / ImageCapture when available
  const captureFrameAsync = useCallback(async (): Promise<string | null> => {
    const video = videoRef.current;
    if (!video) return null;
    try {
      // Prefer ImageCapture if supported
      const stream = (video.srcObject as MediaStream) || currentStreamRef.current || null;
      const track = stream ? stream.getVideoTracks()[0] : null;
      // @ts-ignore - runtime feature detect
      const IC: any = (typeof window !== 'undefined') ? (window as any).ImageCapture : undefined;
      if (IC && track) {
        try {
          const ic = new IC(track);
          const bitmap: ImageBitmap = await ic.grabFrame();
          const w = bitmap.width, h = bitmap.height;
          // Use OffscreenCanvas when available for async blob
          // @ts-ignore
          const Off = (typeof window !== 'undefined') ? (window as any).OffscreenCanvas : undefined;
          if (Off) {
            const off = new Off(w, h);
            const ctx2 = off.getContext('2d');
            if (ctx2) {
              // @ts-ignore drawImage on OffscreenCanvasRenderingContext2D
              ctx2.drawImage(bitmap as any, 0, 0);
              // @ts-ignore convertToBlob on OffscreenCanvas
              const blob: Blob = await off.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
              try { (bitmap as any).close?.(); } catch {}
              const dataUrl = await new Promise<string>((resolve) => {
                const fr = new FileReader();
                fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : '');
                fr.readAsDataURL(blob);
              });
              return dataUrl.split(',')[1] || null;
            }
          }
          // Fallback: draw to visible canvasRef
          if (canvasRef.current) {
            const c = canvasRef.current;
            if (lastCaptureSizeRef.current.w !== w || lastCaptureSizeRef.current.h !== h) {
              c.width = w; c.height = h; lastCaptureSizeRef.current = { w, h };
            }
            const ctx2 = c.getContext('2d');
            if (ctx2) {
              // @ts-ignore
              ctx2.drawImage(bitmap as any, 0, 0);
              try { (bitmap as any).close?.(); } catch {}
              const dataUrl = await new Promise<string>((resolve) => {
                c.toBlob((blob) => {
                  if (!blob) return resolve('');
                  const fr = new FileReader();
                  fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : '');
                  fr.readAsDataURL(blob);
                }, 'image/jpeg', 0.85);
              });
              return dataUrl.split(',')[1] || null;
            }
          }
        } catch {}
      }
    } catch {}
    // Final fallback: synchronous canvas path
    const data = captureFrame();
    return data;
  }, [captureFrame]);

  const runDetection = useCallback(async () => {
    if (!enableDetection || !isActive || !detectionContext) {
      return;
    }

    // Prevent overlapping detections for this source
    try {
      const state = detectionContext.getDetectionState(cameraSource);
      if (state?.isDetecting) {
        return;
      }
    } catch {}

    console.log('🔍 SHARED-CAMERA: Running detection for', cameraSource);
    detectionContext.setDetectionStatus(cameraSource, true);

    try {
      // Prefer non-blocking capture
      const frameData = await captureFrameAsync();
      if (!frameData) {
        console.log('🔍 SHARED-CAMERA: No frame data available for detection');
        return;
      }

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Load optional thresholds from localStorage
      let extra: any = {};
      let peopleConf = 0.25;
      let peopleIou: number | null = null;
      try {
        const raw = localStorage.getItem('threatSettings');
        if (raw) {
          const s = JSON.parse(raw);
          if (typeof s.people_conf === 'number') peopleConf = s.people_conf;
          if (typeof s.people_iou === 'number') peopleIou = s.people_iou;
          if (typeof s.suspicious_conf === 'number') extra.suspicious_conf = s.suspicious_conf;
          if (typeof s.threat_conf === 'number') extra.threat_conf = s.threat_conf;
          if (typeof s.suspicious_iou === 'number') extra.suspicious_iou = s.suspicious_iou;
          if (typeof s.threat_iou === 'number') extra.threat_iou = s.threat_iou;
          // Force LLM off in the continuous detection loop to avoid multiple screenshots
          // (ThreatAnalysis card will run the single LLM validation.)
          extra.llm_enabled = false;
        }
        // Provide a stable stream id so backend can persist ByteTrack state per camera
        extra.stream_id = cameraSource || 'webcam:0';
      } catch {}

      const response = await fetch('/api/detection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: "detect",
          image_data: frameData,
          confidence: peopleConf,
          ...extra
        }),
        signal: abortControllerRef.current.signal
      });

      if (response.ok) {
        const result = await response.json();
        // Optional client-side NMS for people detections using configured IoU
        try {
          if (Array.isArray(result.detections) && typeof peopleIou === 'number' && peopleIou >= 0 && peopleIou <= 1) {
            const iou = (a: any, b: any) => {
              const x1 = Math.max(a.x1, b.x1);
              const y1 = Math.max(a.y1, b.y1);
              const x2 = Math.min(a.x2, b.x2);
              const y2 = Math.min(a.y2, b.y2);
              const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
              const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
              const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
              const union = areaA + areaB - inter;
              return union > 0 ? inter / union : 0;
            };
            const sorted = [...result.detections].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
            const kept: any[] = [];
            for (const d of sorted) {
              let keep = true;
              for (const k of kept) {
                if (iou(d, k) >= peopleIou) { keep = false; break; }
              }
              if (keep) kept.push(d);
            }
            result.detections = kept;
            if (typeof result.people_count === 'number') {
              result.people_count = kept.length;
            }
          }
        } catch {}
        console.log('✅ SHARED-CAMERA: Detection successful for', cameraSource, '- People:', result.people_count, 'Occupancy:', result.current_occupancy, 'Entries:', result.entry_count, 'Exits:', result.exit_count);
        
        const detectionResult: DetectionResult = {
          ...result,
          timestamp: Date.now()
        };
        
        // Update global detection context
        detectionContext.updateDetectionResults(cameraSource, detectionResult);
        
        // Call local callback
        onDetection?.(detectionResult);
        
      } else {
        console.warn('⚠️ SHARED-CAMERA: Detection API returned:', response.status);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('❌ SHARED-CAMERA: Detection error:', err);
      }
    } finally {
      detectionContext.setDetectionStatus(cameraSource, false);
    }
  }, [enableDetection, isActive, cameraSource, captureFrameAsync, detectionContext, onDetection]);

  // Detection interval management
  useEffect(() => {
    if (enableDetection && isActive && detectionFrameRate > 0) {
      console.log('🎯 SHARED-CAMERA: Starting detection interval for', cameraSource, 'at', detectionFrameRate, 'FPS');
      
      const interval = 1000 / detectionFrameRate; // Convert FPS to milliseconds
      detectionIntervalRef.current = setInterval(() => {
        const now = Date.now();
        if (now - lastDetectionTimeRef.current >= interval) {
          lastDetectionTimeRef.current = now;
          runDetection();
        }
      }, interval);

      return () => {
        if (detectionIntervalRef.current) {
          console.log('🛑 SHARED-CAMERA: Stopping detection interval for', cameraSource);
          clearInterval(detectionIntervalRef.current);
          detectionIntervalRef.current = null;
        }
        
        // Cancel any pending detection request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }
  }, [enableDetection, isActive, detectionFrameRate, runDetection, cameraSource]);

  // Subscribe to detection updates from other cameras with the same source
  const [sharedDetections, setSharedDetections] = useState<DetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  // Red strobe persistence (10s after LLM confirms a threat)
  const [strobeUntil, setStrobeUntil] = useState<number | null>(null);
  const [strobeTick, setStrobeTick] = useState<number>(0);

  useEffect(() => {
    if (!detectionContext) return;

    console.log('🔔 SHARED-CAMERA: Subscribing to detection updates for', cameraSource);
    
    const unsubscribe = detectionContext.subscribeToDetections(cameraSource, (state) => {
      console.log('📢 SHARED-CAMERA: Received detection update for', cameraSource, '- People:', state.result?.people_count);
      setSharedDetections(state.result);
      setIsDetecting(state.isDetecting);
      try {
        if (state.result && state.result.llm_is_false_positive === false) {
          // Start (or extend) strobe window for 10 seconds from now
          console.log('🚨 SHARED-CAMERA: LLM confirmed threat → starting 10s strobe');
          setStrobeUntil(Date.now() + 10_000);
        }
      } catch {}
    });

    // Get initial state
    const initialState = detectionContext.getDetectionState(cameraSource);
    setSharedDetections(initialState.result);
    setIsDetecting(initialState.isDetecting);

    return unsubscribe;
  }, [detectionContext, cameraSource]);

  // Drive a heartbeat re-render while strobe is active, then stop
  useEffect(() => {
    if (strobeUntil && Date.now() < strobeUntil) {
      const id = setInterval(() => setStrobeTick(Date.now()), 250);
      return () => clearInterval(id);
    }
  }, [strobeUntil]);

  if (error) {
    return (
      <div className={`relative w-full bg-gradient-to-br from-red-900/50 to-red-800/50 rounded-lg overflow-hidden border border-red-500/30 backdrop-blur-sm ${
        isLarge ? 'h-full' : 'aspect-video'
      }`}>
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center">
          <div className={`mx-auto mb-3 rounded-full bg-red-500/20 flex items-center justify-center ${
            isLarge ? 'w-16 h-16' : 'w-8 h-8'
          }`}>
            <svg className={`text-red-400 ${
              isLarge ? 'w-8 h-8' : 'w-4 h-4'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className={`font-semibold text-red-300 mb-2 ${
            isLarge ? 'text-lg' : 'text-sm'
          }`}>Camera Error</h3>
          <p className={`text-red-200/80 text-center mb-4 ${
            isLarge ? 'text-sm' : 'text-xs'
          }`}>
            {error}
          </p>
          <button
            onClick={startCamera}
            className={`px-4 py-2 bg-red-600/90 text-white rounded-lg hover:bg-red-700/90 transition-all duration-200 backdrop-blur-sm border border-red-500/30 font-medium ${
              isLarge ? 'text-sm' : 'text-xs px-3 py-1.5'
            }`}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full bg-black rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm ${
      isLarge ? 'h-full' : 'aspect-video'
    }`}>
      {/* Red strobe shows only after LLM confirms a threat, and persists for 10s */}
      {(strobeUntil && Date.now() < strobeUntil) && (
        <div className="absolute inset-0 pointer-events-none strobe-red-alert" style={{ zIndex: 2 }} />
      )}
      {/* Always render video element for ref */}
      <video
        ref={(el) => {
          // Assign internal ref
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          videoRef.current = el;
          // Assign external ref if provided
          if (videoElementRef) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            videoElementRef.current = el;
          }
        }}
        autoPlay
        playsInline
        muted
        data-camera-source={cameraSource}
        className={`absolute inset-0 w-full h-full object-contain ${isActive ? 'opacity-100' : 'opacity-0'}`}
        style={{
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
        onLoadedMetadata={() => {
          console.log('📊 SHARED-CAMERA: Video metadata loaded for', cameraSource);
        }}
        onPlay={() => {
          console.log('▶️ SHARED-CAMERA: Video playing for', cameraSource);
        }}
        onError={(e) => {
          console.error('❌ SHARED-CAMERA: Video element error:', e);
          setError('Video playback error');
        }}
      />
      
      {/* Hidden canvas for frame capture */}
      <canvas
        ref={canvasRef}
        className="hidden"
      />
      
      {/* Detection overlay */}
      {isActive && sharedDetections && (
        <DetectionOverlay
          detections={sharedDetections.detections}
          peopleCount={sharedDetections.people_count}
          processingTime={sharedDetections.processing_time}
          isDetecting={isDetecting}
          isLarge={isLarge}
          videoRef={videoRef}
          threats={sharedDetections.threats}
          hasThreat={sharedDetections.llm_is_false_positive ? false : sharedDetections.has_threat}
          llmIsFalsePositive={sharedDetections.llm_is_false_positive}
        />
      )}
      
      {/* Loading overlay */}
      {!isActive && !error && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
          <div className={`mx-auto mb-3 rounded-full bg-white/10 flex items-center justify-center ${
            isLarge ? 'w-16 h-16' : 'w-8 h-8'
          }`}>
            <svg className={`text-white/70 ${
              isLarge ? 'w-8 h-8' : 'w-4 h-4'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2z" />
            </svg>
          </div>
          <p className={`text-white/60 text-center ${
            isLarge ? 'text-lg' : 'text-sm'
          }`}>
            {isLarge ? 'Initializing camera...' : 'Loading...'}
          </p>
          {isStreamActive && isStreamActive(cameraSource) && (
            <p className="text-green-400/60 text-xs mt-1">Stream available</p>
          )}
        </div>
      )}
      
      <div className="absolute top-2 left-2 z-10">
        <div className="px-2 py-1 rounded-md bg-green-600/90 text-white text-xs font-medium backdrop-blur-sm border border-white/10">
          🎬 Live
        </div>
      </div>

      <div className={`absolute bottom-2 left-2 right-2 flex gap-2 ${
        isLarge ? 'flex-row' : 'flex-col'
      }`}>
 {/* NEW (no nested <button> anymore) */}
<div
  role="button"
  tabIndex={0}
  onClick={(e) => { e.stopPropagation(); stopCamera(); }}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      stopCamera();
    }
  }}
  className={`px-3 py-2 bg-gray-800/90 text-white rounded-lg hover:bg-gray-700/90 transition-all duration-200 backdrop-blur-sm border border-white/10 font-medium cursor-pointer ${
    isLarge ? 'text-sm' : 'text-xs px-2 py-1'
  }`}
>
  Stop Camera
</div>

      </div>
    </div>
  );
}
