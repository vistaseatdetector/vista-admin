"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import { useDetectionContext } from "@/contexts/DetectionContext";

interface WebcamStreamWithDetectionProps {
  isLarge?: boolean;
  cameraSource?: string;
  enableDetection?: boolean;
  detectionFrameRate?: number; // FPS for detection (default 5 FPS)
  autoStart?: boolean;
  onError?: (error: Error) => void;
  onStatusChange?: (isActive: boolean) => void;
  onDetection?: (result: DetectionResult) => void;
  // Optional: expose the underlying <video> element via external ref
  videoElementRef?: RefObject<HTMLVideoElement | null>;
}

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  label: string;
  category?: string;
  llm_false_positive?: boolean;
}

interface DetectionResult {
  people_count: number;
  detections: BoundingBox[];
  processing_time: number;
  image_width: number;
  image_height: number;
  threats?: BoundingBox[];
  has_threat?: boolean;
}



export default function WebcamStreamWithDetection({ 
  isLarge = false,
  cameraSource = "webcam:0",
  enableDetection = false,
  detectionFrameRate = 1, // 1 FPS to minimize UI stalls
  autoStart = false,
  onError,
  onStatusChange,
  onDetection,
  videoElementRef,
}: WebcamStreamWithDetectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<BoundingBox[]>([]);
  const [threats, setThreats] = useState<BoundingBox[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);
  
  // Get detection context to share detection results globally
  const detectionContext = useDetectionContext();
  // Track global false-positive verdict for this camera
  const [globalFP, setGlobalFP] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isDetectingRef = useRef(false); // Stable reference to prevent flashing
  const abortControllerRef = useRef<AbortController | null>(null); // Cancel in-flight requests
  const currentStreamId = useRef<string | null>(null); // Track current stream ID
  const requestInProgress = useRef<boolean>(false); // Prevent overlapping requests
  const onStatusChangeRef = useRef<typeof onStatusChange | null>(onStatusChange ?? null);
  const onErrorRef = useRef<typeof onError | null>(onError ?? null);
  useEffect(() => { onStatusChangeRef.current = onStatusChange ?? null; }, [onStatusChange]);
  useEffect(() => { onErrorRef.current = onError ?? null; }, [onError]);
  
  // Debug component lifecycle
  useEffect(() => {
    console.log('🟢 WebcamStreamWithDetection MOUNTED', { cameraSource, enableDetection, detectionFrameRate: detectionFrameRate + ' FPS' });
    return () => {
      console.log('🔴 WebcamStreamWithDetection UNMOUNTING', { cameraSource });
      // Stop detection and cleanup streams on unmount
      if (isDetectingRef.current) {
        stopDetection();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = useCallback(async () => {
    try {
      // Only stop existing stream if we're really changing sources
      if (streamRef.current) {
        console.log('🔄 DETECTION: Camera already active, checking if restart needed');
        // Don't restart if we already have a working stream for the same source
        if (videoRef.current && videoRef.current.srcObject === streamRef.current) {
          console.log('✅ DETECTION: Using existing stream to prevent blinking');
          return;
        }
      }
      
      console.log('🎥 STARTING CAMERA WITH DETECTION...');
      console.log('📡 Camera source:', cameraSource);
      
      let stream: MediaStream;
      
      // Handle different camera sources (similar to WebcamStream)
      if (cameraSource?.startsWith('webcam:')) {
        const deviceId = cameraSource.split(':')[1] || '0';
        console.log('📹 Using webcam device:', deviceId);
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('📱 Available video devices:', videoDevices.length);
        
        const constraints: MediaStreamConstraints = {
          video: { 
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            aspectRatio: { ideal: 16/9 },
            frameRate: { ideal: 30, min: 15 }
          }
        };
        
        if (deviceId !== '0' && videoDevices[parseInt(deviceId)]) {
          (constraints.video as MediaTrackConstraints).deviceId = { exact: videoDevices[parseInt(deviceId)].deviceId };
        }
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        // For other sources, use default webcam
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            aspectRatio: { ideal: 16/9 },
            frameRate: { ideal: 30, min: 15 }
          }
        });
      }
      
      console.log('✅ DETECTION CAMERA STREAM OBTAINED');
      console.log('📊 Active tracks:', stream.getVideoTracks().length);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // Force video attributes
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        
        // Force play
        try {
          await videoRef.current.play();
          console.log('🎬 DETECTION VIDEO PLAYING!');
        } catch (playError) {
          console.error('❌ Detection play error:', playError);
        }
      }
      
      setHasPermission(true);
      try { onStatusChangeRef.current?.(true); } catch {}
      
      // Start detection if enabled
      if (enableDetection) {
        console.log('🔄 Auto-starting stream detection...', { frameRate: detectionFrameRate + ' FPS', cameraSource });
        // Start stream detection inline
        setTimeout(() => {
          if (isDetectingRef.current === false) { // Only start if not already started
            isDetectingRef.current = true;
            setIsDetecting(true);
            
            // Start stream detection on the backend
            const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            fetch('/api/detection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: "stream_start",
                source: cameraSource,
                confidence: 0.25,
                stream_id: streamId
              })
            }).then(response => {
              if (response.ok) {
                console.log('✅ Auto-stream detection started:', streamId);
                // Start polling for results
                pollDetectionResults(streamId);
              } else {
                console.error('❌ Failed to auto-start stream detection');
                isDetectingRef.current = false;
                setIsDetecting(false);
              }
            }).catch(error => {
              console.error('❌ Auto-stream start error:', error);
              isDetectingRef.current = false;
              setIsDetecting(false);
            });
          }
        }, 100); // Small delay to ensure video is ready
      }
      
    } catch (error) {
      console.error("❌ DETECTION CAMERA ERROR:", error);
      setHasPermission(false);
      try { onErrorRef.current?.(error instanceof Error ? error : new Error(String(error))); } catch {}
      try { onStatusChangeRef.current?.(false); } catch {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = useCallback(() => {
    console.log('🛑 STOPPING DETECTION CAMERA...');
    
    // Stop detection first
    if (isDetectingRef.current) {
      isDetectingRef.current = false;
      setIsDetecting(false);
      
      // Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Cancel any in-flight detection requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setHasPermission(null);
    setDetections([]);
    setPeopleCount(0);
    setProcessingTime(0);
    try { onStatusChangeRef.current?.(false); } catch {}
  }, []);

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) {
      console.log('📹 Video or canvas ref not available for capture');
      return null;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) {
      console.log('❌ Canvas context not available');
      return null;
    }

    // Check if video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('📹 Video has no dimensions yet:', video.videoWidth, 'x', video.videoHeight);
      return null;
    }

    // Check if video is playing
    if (video.readyState < 2) {
      console.log('📹 Video not ready for capture, readyState:', video.readyState);
      return null;
    }
    
    try {
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw the current video frame
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      // Convert to base64 JPEG with good quality
      const dataURL = canvas.toDataURL('image/jpeg', 0.8);
      
      // Validate the data URL
      if (!dataURL || dataURL === 'data:,') {
        console.log('❌ Failed to capture valid image data');
        return null;
      }
      
      console.log('📸 Frame captured successfully:', video.videoWidth, 'x', video.videoHeight);
      return dataURL;
    } catch (error) {
      console.error('❌ Error capturing frame:', error);
      return null;
    }
  }, []);

  // Poll for detection results from the stream
  const pollDetectionResults = useCallback((streamId: string) => {
    currentStreamId.current = streamId;
    let pollCount = 0;
    let lastPollTime = 0;
    
    const poll = () => {
      if (!isDetectingRef.current || currentStreamId.current !== streamId) return;
      
      // Prevent overlapping requests which can cause video blinking
      if (requestInProgress.current) {
        setTimeout(poll, 1500); // Wait longer if request in progress
        return;
      }
      
      // More conservative polling to prevent video interference
      const now = Date.now();
      const minInterval = Math.max(1000 / detectionFrameRate, 1000); // At least 1000ms between polls to prevent blinking
      if (now - lastPollTime < minInterval) {
        setTimeout(poll, minInterval - (now - lastPollTime));
        return;
      }
      lastPollTime = now;
      
      pollCount++;
      requestInProgress.current = true;
      
      // Use AbortController to prevent overlapping requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      fetch('/api/detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: "stream_status",
          stream_id: streamId
        }),
        signal: controller.signal
      })
      .then(response => response.json())
      .then(result => {
        clearTimeout(timeoutId);
        if (isDetectingRef.current) {
          // Update state with all available data
          setDetections(result.detections || []);
          setThreats(result.threats || []);
          setPeopleCount(result.people_count || 0);
          setProcessingTime(result.processing_time || 0);
          
          // Store backend frame dimensions for accurate scaling
          if (result.frame_width && result.frame_height) {
            videoRef.current?.setAttribute('data-backend-width', result.frame_width.toString());
            videoRef.current?.setAttribute('data-backend-height', result.frame_height.toString());
          }
          
          onDetection?.(result);
          
          // Update global detection context
          detectionContext.updateDetectionResults(cameraSource, {
            ...result,
            timestamp: Date.now()
          });
          
          // Send heartbeat less frequently to reduce interference
          if (pollCount % 20 === 0) { // Every 20 polls instead of 10
            fetch('/api/detection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: "heartbeat",
                stream_id: streamId
              })
            }).catch(error => {
              console.warn('❌ Heartbeat error:', error);
            });
          }
        }
      })
      .catch(error => {
        clearTimeout(timeoutId);
        if (error.name !== 'AbortError') {
          console.error('❌ Polling error:', error);
        }
      })
      .finally(() => {
        requestInProgress.current = false; // Reset request flag
        // Continue polling with longer intervals to prevent video interference
        if (isDetectingRef.current && currentStreamId.current === streamId) {
          const pollInterval = Math.max(1000 / detectionFrameRate, 1200); // At least 1.2 seconds between polls
          setTimeout(poll, pollInterval);
        }
      });
    };
    
    // Start polling with longer initial delay to let video stabilize
    setTimeout(poll, 2000); // Wait 2 seconds before first poll
  }, [detectionFrameRate, onDetection, cameraSource, detectionContext]);

  // Subscribe to detection context to react to LLM global verdict changes
  useEffect(() => {
    try {
      const unsubscribe = detectionContext.subscribeToDetections(cameraSource, (state) => {
        const fp = state?.result?.llm_is_false_positive === true;
        setGlobalFP(fp);
      });
      // Initialize from current state
      const init = detectionContext.getDetectionState(cameraSource);
      setGlobalFP(init?.result?.llm_is_false_positive === true);
      return unsubscribe;
    } catch {
      // no-op
    }
  }, [cameraSource, detectionContext]);

  const detectPeople = useCallback(async () => {
    // Don't proceed if detection is off
    if (!isDetectingRef.current) {
      console.log('🚫 Detection skipped - detection is off');
      return;
    }

    const frameData = captureFrame();
    if (!frameData) {
      console.log('🔍 No frame data available for detection, skipping...');
      return;
    }

    try {
      console.log('🔍 Attempting real YOLO detection...');
      
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), 10000); // 10 second timeout
      
      // Load optional threat settings from localStorage
      let extra: any = {};
      try {
        const raw = localStorage.getItem('threatSettings');
        if (raw) {
          const s = JSON.parse(raw);
          if (typeof s.suspicious_conf === 'number') extra.suspicious_conf = s.suspicious_conf;
          if (typeof s.threat_conf === 'number') extra.threat_conf = s.threat_conf;
          if (typeof s.suspicious_iou === 'number') extra.suspicious_iou = s.suspicious_iou;
          if (typeof s.threat_iou === 'number') extra.threat_iou = s.threat_iou;
          // Force LLM off in the polling loop; the ThreatAnalysis card will run it once
          extra.llm_enabled = false;
        }
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
          confidence: 0.25,
          ...extra
        }),
        signal: abortControllerRef.current.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Only update state if detection is still active
        if (isDetectingRef.current) {
          const result: DetectionResult = await response.json();
          console.log('✅ YOLO Detection successful - People:', result.people_count);
          setDetections(result.detections);
          setThreats(result.threats || []);
          setPeopleCount(result.people_count);
          setProcessingTime(result.processing_time);
          
          // Call the onDetection callback
          onDetection?.(result);
          
          // Update global detection context
          detectionContext.updateDetectionResults(cameraSource, {
            ...result,
            timestamp: Date.now()
          });
        } else {
          console.log('🚫 Detection result ignored - detection was stopped');
        }
      } else {
        console.warn('⚠️ Detection API returned:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Detection API error details:', errorText);
        
        // Only clear if detection is still active
        if (isDetectingRef.current) {
          console.log('📊 Detection failed, continuing with empty result...');
          setDetections([]);
          setPeopleCount(0);
          setProcessingTime(0);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('⏰ Detection request aborted (timeout or manual cancellation)');
      } else {
        console.error('❌ Detection error:', error);
      }
      
      // Only clear if detection is still active
      if (isDetectingRef.current) {
        console.log('📊 Detection failed, continuing with empty result...');
        setDetections([]);
        setPeopleCount(0);
        setProcessingTime(0);
      }
    }
  }, [captureFrame, onDetection, cameraSource, detectionContext]);

  // Continuous detection loop using requestAnimationFrame
  const detectionLoop = useCallback(() => {
    if (!isDetectingRef.current) {
      return;
    }

    const now = performance.now();
    const timeSinceLastDetection = now - lastDetectionTimeRef.current;
    const detectionIntervalMs = 1000 / detectionFrameRate; // Convert FPS to milliseconds

    // Only run detection at the specified frame rate
    if (timeSinceLastDetection >= detectionIntervalMs) {
      lastDetectionTimeRef.current = now;
      detectPeople();
    }

    // Schedule next frame
    if (isDetectingRef.current) {
      animationFrameRef.current = requestAnimationFrame(detectionLoop);
    }
  }, [detectPeople, detectionFrameRate]);

  const startDetection = useCallback(() => {
    if (isDetectingRef.current) return;
    
    console.log('▶️ Starting continuous stream detection...', { frameRate: detectionFrameRate + ' FPS' });
    isDetectingRef.current = true;
    setIsDetecting(true);
    
    // Start stream detection on the backend
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    fetch('/api/detection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: "stream_start",
        source: cameraSource,
        confidence: 0.25,
        stream_id: streamId
      })
    }).then(response => {
      if (response.ok) {
        console.log('✅ Stream detection started:', streamId);
        // Poll for detection results
        pollDetectionResults(streamId);
      } else {
        console.error('❌ Failed to start stream detection');
        stopDetection();
      }
    }).catch(error => {
      console.error('❌ Stream start error:', error);
      stopDetection();
    });
  }, [detectionFrameRate, cameraSource]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopDetection = useCallback(() => {
    if (!isDetectingRef.current) return;
    
    console.log('🛑 Stopping continuous stream detection...');
    isDetectingRef.current = false;
    setIsDetecting(false);
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Stop stream detection on backend
    if (currentStreamId.current) {
      fetch('/api/detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: "stream_stop",
          stream_id: currentStreamId.current
        })
      }).then(() => {
        console.log('✅ Stream detection stopped');
      }).catch(error => {
        console.error('❌ Stream stop error:', error);
      });
      
      currentStreamId.current = null;
    }
    
    // Clear detections
    setDetections([]);
    setPeopleCount(0);
    setProcessingTime(0);
  }, []);

  const toggleDetection = useCallback(() => {
    console.log('🔄 Toggle detection called:', { 
      isDetecting: isDetectingRef.current, 
      isProcessing, 
      hasAnimationFrame: !!animationFrameRef.current 
    });
    
    if (isProcessing) {
      console.log('⏸️ Toggle blocked - already processing');
      return; // Prevent rapid clicks
    }
    
    setIsProcessing(true);
    
    if (isDetectingRef.current) {
      stopDetection();
    } else {
      startDetection();
    }
    
    // Reset processing state after a shorter delay since we're not using intervals
    setTimeout(() => {
      console.log('✅ Processing state reset');
      setIsProcessing(false);
    }, 500);
  }, [isProcessing, stopDetection, startDetection]);

  useEffect(() => {
    console.log('🔄 Detection state changed:', { isDetecting, ref: isDetectingRef.current });
  }, [isDetecting]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      stopCamera();
    };
  }, [stopCamera]);

  // Auto-start camera if autoStart is enabled
  useEffect(() => {
    if (autoStart && hasPermission === null) {
      console.log('🚀 AUTO-STARTING DETECTION CAMERA...');
      startCamera();
    }
  }, [autoStart, hasPermission, startCamera]);

  const drawDetections = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    // Get backend frame dimensions from stored attributes (more accurate)
    const backendWidth = parseInt(video.getAttribute('data-backend-width') || '1280');
    const backendHeight = parseInt(video.getAttribute('data-backend-height') || '720');
    
    // Get displayed video element dimensions
    const displayWidth = video.offsetWidth;
    const displayHeight = video.offsetHeight;
    
    // Calculate scaling factors based on backend frame size
    const scaleX = displayWidth / backendWidth;
    const scaleY = displayHeight / backendHeight;
    
    // Set canvas to match display size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    // Clear and set up drawing
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '12px Arial';
    
    console.log('🎯 Drawing detections:', {
      backendSize: `${backendWidth}x${backendHeight}`,
      displaySize: `${displayWidth}x${displayHeight}`,
      scale: `${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`,
      detectionsCount: detections.length
    });
    
    detections.forEach((detection) => {
      const x = detection.x1 * scaleX;
      const y = detection.y1 * scaleY;
      const width = (detection.x2 - detection.x1) * scaleX;
      const height = (detection.y2 - detection.y1) * scaleY;
      
      console.log('📦 Box coords:', {
        original: `(${detection.x1}, ${detection.y1}) - (${detection.x2}, ${detection.y2})`,
        scaled: `(${x.toFixed(1)}, ${y.toFixed(1)}) ${width.toFixed(1)}x${height.toFixed(1)}`
      });
      
      // People boxes (green)
      context.strokeStyle = '#00ff00';
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);
      const pplLabel = `${detection.label || 'person'} (${(detection.confidence * 100).toFixed(1)}%)`;
      const pplMetrics = context.measureText(pplLabel);
      context.fillStyle = 'rgba(0,255,0,0.85)';
      context.fillRect(x, y - 18, pplMetrics.width + 8, 16);
      context.fillStyle = '#000000';
      context.fillText(pplLabel, x + 4, y - 5);
    });

    // Threat/suspicious overlays: red (threat), amber (suspicious); gray if LLM marked false positive
    if (threats && threats.length > 0) {
      const threatSet = new Set(['weapon', 'gun', 'knife', 'firearm', 'handgun', 'pistol', 'revolver', 'rifle', 'shotgun', 'machete', 'blade', 'sword']);
      threats.forEach((t) => {
        const x = t.x1 * scaleX;
        const y = t.y1 * scaleY;
        const width = (t.x2 - t.x1) * scaleX;
        const height = (t.y2 - t.y1) * scaleY;
        const lower = (t.label || '').toLowerCase();
        const suspiciousOnly = (process.env.NEXT_PUBLIC_SUSPICIOUS_ONLY || '').toLowerCase() === '1' || (process.env.NEXT_PUBLIC_SUSPICIOUS_ONLY || '').toLowerCase() === 'true';
        const isThreat = !suspiciousOnly && ((t.category === 'threat') || threatSet.has(lower) || Array.from(threatSet).some(w => lower.includes(w)));
        const isFP = globalFP || !!t.llm_false_positive;
        const stroke = isFP ? '#9ca3af' : (isThreat ? '#ff3333' : '#ffb020');
        const fill = isFP ? 'rgba(156,163,175,0.9)' : (isThreat ? 'rgba(255,51,51,0.9)' : 'rgba(255,176,32,0.9)');
        const prefix = isFP ? 'LIKELY FALSE POSITIVE' : (isThreat ? 'THREAT' : 'SUSPICIOUS');
        // Box
        context.strokeStyle = stroke;
        context.lineWidth = 2;
        context.strokeRect(x, y, width, height);
        // Label
        const label = `${prefix}: ${t.label || ''} ${(t.confidence * 100).toFixed(0)}%`;
        const metrics = context.measureText(label);
        context.fillStyle = fill;
        context.fillRect(x, y - 18, metrics.width + 8, 16);
        context.fillStyle = '#000';
        context.fillText(label, x + 4, y - 5);
      });
    }
  }, [detections, threats, globalFP]);

  useEffect(() => {
    drawDetections();
  }, [drawDetections, detections, threats, globalFP]);

  if (hasPermission === null) {
    return (
      <div className="relative w-full aspect-video bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm">
        {/* Fixed container that matches video container dimensions */}
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center">
          <div className={`mx-auto mb-3 rounded-full bg-white/10 flex items-center justify-center ${
            isLarge ? 'w-16 h-16' : 'w-8 h-8'
          }`}>
            <svg className={`text-white/70 ${
              isLarge ? 'w-8 h-8' : 'w-4 h-4'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className={`font-semibold text-white/90 mb-3 ${
            isLarge ? 'text-lg' : 'text-sm'
          }`}>Webcam Ready</h3>
          <button
            onClick={startCamera}
            className={`px-4 py-2 bg-blue-600/90 text-white rounded-lg hover:bg-blue-700/90 transition-all duration-200 backdrop-blur-sm border border-white/10 font-medium ${
              isLarge ? 'text-sm' : 'text-xs px-3 py-1.5'
            }`}
          >
            Start Camera
          </button>
        </div>
      </div>
    );
  }

  if (hasPermission === false) {
    return (
      <div className="relative w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm">
        {/* Fixed container that matches video container dimensions */}
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
          <h3 className={`font-semibold text-white/90 mb-3 ${
            isLarge ? 'text-lg' : 'text-sm'
          }`}>Camera Access Denied</h3>
          <p className={`text-white/60 text-center mb-4 ${
            isLarge ? 'text-sm' : 'text-xs'
          }`}>
            Please allow camera access and try again
          </p>
          <button
            onClick={startCamera}
            className={`px-4 py-2 bg-blue-600/90 text-white rounded-lg hover:bg-blue-700/90 transition-all duration-200 backdrop-blur-sm border border-white/10 font-medium ${
              isLarge ? 'text-sm' : 'text-xs px-3 py-1.5'
            }`}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm">
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
        className="absolute inset-0 w-full h-full object-cover"
        style={{ 
          backgroundColor: 'black',
          // Prevent video from flashing during detection operations
          imageRendering: 'auto',
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)', // Force hardware acceleration
          willChange: 'auto'
        }}
        onLoadedData={() => {
          console.log('🎬 Video loaded and ready to play');
        }}
        onPlaying={() => {
          console.log('▶️ Video playing smoothly');
        }}
        onWaiting={() => {
          console.log('⏸️ Video waiting for data');
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      
      {/* Detection Info */}
      {isDetecting && (
        <div className={`absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs ${
          isLarge ? 'text-sm' : 'text-xs'
        }`}>
          People: {peopleCount} | Time: {processingTime.toFixed(0)}ms
        </div>
      )}
      
      {/* Controls */}
      <div className={`absolute bottom-2 left-2 right-2 flex gap-2 ${
        isLarge ? 'flex-row' : 'flex-col'
      }`}>
        <button
          onClick={toggleDetection}
          disabled={!hasPermission || isProcessing}
          className={`px-3 py-2 rounded-lg font-medium transition-colors duration-200 ${
            isDetecting 
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/25' 
              : 'bg-green-600 hover:bg-green-700 text-white shadow-green-500/25'
          } disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
            isLarge ? 'text-sm' : 'text-xs px-2 py-1'
          } ${isProcessing ? 'opacity-75' : ''}`}
        >
          {isProcessing ? '...' : (isDetecting ? 'Stop Detecting' : 'Start Detecting')}
        </button>
        
        <button
          onClick={stopCamera}
          className={`px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors ${
            isLarge ? 'text-sm' : 'text-xs px-2 py-1'
          }`}
        >
          Stop Camera
        </button>
      </div>
    </div>
  );
}
