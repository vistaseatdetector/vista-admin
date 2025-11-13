"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
}

interface WebcamStreamProps {
  isLarge?: boolean;
  onError?: (error: string) => void;
  onStatusChange?: (isActive: boolean) => void;
  onPeopleDetected?: (count: number) => void;
  enableDetection?: boolean;
  orgSlug?: string;
  locationId?: string;
}

export default function WebcamStream({ 
  isLarge = false, 
  onError, 
  onStatusChange,
  onPeopleDetected,
  enableDetection = true,
  orgSlug,
  locationId
}: WebcamStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);

  const drawDetections = useCallback((detections: Detection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size to match video display size
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate scale factors
    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;
    
    // Draw detection boxes
    detections.forEach((detection) => {
      const { x, y, width, height, confidence, class: className } = detection;
      
      // Scale coordinates to canvas size
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;
      
      // Green boxes for people
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      
      // Label background
      ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      const label = `${className} ${Math.round(confidence * 100)}%`;
      ctx.font = '12px Arial';
      const textMetrics = ctx.measureText(label);
      ctx.fillRect(scaledX, scaledY - 20, textMetrics.width + 8, 20);
      
      // Label text
      ctx.fillStyle = '#000000';
      ctx.fillText(label, scaledX + 4, scaledY - 6);
    });
  }, []);

  const runDetection = useCallback(async () => {
    if (!videoRef.current || !enableDetection) return;
    
    try {
      setIsDetecting(true);
      
      // Capture frame from video
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const video = videoRef.current;
      
      if (!ctx || !video) return;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      
      // Convert to blob and send to backend for detection
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        try {
          // Simulate detection for now - in real implementation, send to Python backend
          const mockDetections: Detection[] = [];
          
          // Generate 1-3 random people detections
          const numPeople = Math.floor(Math.random() * 4);
          for (let i = 0; i < numPeople; i++) {
            mockDetections.push({
              x: Math.random() * (canvas.width - 100),
              y: Math.random() * (canvas.height - 150),
              width: 80 + Math.random() * 40,
              height: 120 + Math.random() * 60,
              confidence: 0.7 + Math.random() * 0.3,
              class: 'person'
            });
          }
          
          setDetections(mockDetections);
          setPeopleCount(mockDetections.length);
          onPeopleDetected?.(mockDetections.length);
          
          // Draw detection boxes
          drawDetections(mockDetections);
          
          // Send to database if we have org info
          if (orgSlug && mockDetections.length > 0) {
            try {
              const response = await fetch(`/api/org/${orgSlug}/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  people_count: mockDetections.length,
                  location_id: locationId
                })
              });
              
              if (response.ok) {
                console.log('✅ Sent detection data to database');
              }
            } catch (error) {
              console.warn('Failed to send detection data:', error);
            }
          }
          
        } catch (error) {
          console.error('Detection processing error:', error);
        }
      }, 'image/jpeg', 0.8);
      
    } catch (error) {
      console.error('Detection error:', error);
    } finally {
      setIsDetecting(false);
    }
  }, [enableDetection, orgSlug, locationId, onPeopleDetected, drawDetections]);

  const startWebcam = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    setErrorMessage("");

    try {
      // Request access to webcam
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: false 
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
        onStatusChange?.(true);
        
        // Start detection if enabled
        if (enableDetection) {
          detectionIntervalRef.current = setInterval(runDetection, 3000); // Every 3 seconds
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to access webcam";
      setHasError(true);
      setErrorMessage(errorMsg);
      onError?.(errorMsg);
      onStatusChange?.(false);
      console.error("Webcam access error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [enableDetection, onError, onStatusChange, runDetection]);

  const stopWebcam = () => {
    // Stop detection
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
    setDetections([]);
    setPeopleCount(0);
    onStatusChange?.(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-start webcam when component mounts
  useEffect(() => {
    startWebcam();
  }, [startWebcam]); // Include startWebcam in dependencies

  const handleVideoLoadedData = () => {
    setIsLoading(false);
  };

  return (
    <div className={`bg-black rounded-lg overflow-hidden relative ${isLarge ? 'aspect-video' : 'aspect-video'}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
        muted
        onLoadedData={handleVideoLoadedData}
        style={{ display: isStreaming ? 'block' : 'none' }}
      />
      
      {/* Detection overlay canvas */}
      {isStreaming && enableDetection && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ mixBlendMode: 'screen' }}
        />
      )}
      
      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
            <p className="text-white/60 text-sm">Connecting to webcam...</p>
          </div>
        </div>
      )}
      
      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-red-400 text-sm mb-2">Camera Error</p>
            <p className="text-white/60 text-xs">{errorMessage}</p>
            <button
              onClick={startWebcam}
              className="mt-3 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 rounded text-xs transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      
      {/* Default state */}
      {!isLoading && !hasError && !isStreaming && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-white/60 text-sm mb-2">People Detection Ready</p>
            <button
              onClick={startWebcam}
              className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-200 rounded text-sm transition-colors"
            >
              Start Detection
            </button>
          </div>
        </div>
      )}
      
      {/* Controls and stats overlay */}
      {isStreaming && (
        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              onClick={stopWebcam}
              className="px-2 py-1 bg-red-500/80 hover:bg-red-500 text-white rounded text-xs transition-colors"
            >
              Stop
            </button>
          </div>
          
          {/* Detection stats */}
          {enableDetection && (
            <div className="absolute top-2 left-2">
              <div className="bg-black/70 rounded px-2 py-1 text-xs text-white">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isDetecting ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                  <span>People: {peopleCount}</span>
                </div>
              </div>
            </div>
          )}
          
          {isLarge && (
            <div className="absolute bottom-2 left-2 right-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/80 bg-black/50 px-2 py-1 rounded">
                  Live Detection - AI
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-white/80">Detecting</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}