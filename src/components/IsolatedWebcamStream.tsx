"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface IsolatedWebcamStreamProps {
  cameraSource: string;
  isLarge?: boolean;
  className?: string;
}

// This component is completely isolated and won't re-render due to parent state changes
const IsolatedWebcamStream = React.memo(({ 
  cameraSource, 
  isLarge = false,
  className = ""
}: IsolatedWebcamStreamProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const startCamera = useCallback(async () => {
    if (isLoading) return; // Prevent multiple simultaneous starts
    
    try {
      setIsLoading(true);
      console.log('🎥 ISOLATED: Starting camera...', cameraSource);
      
      let stream: MediaStream;
      
      // Handle different camera sources
      if (cameraSource?.startsWith('webcam:')) {
        const deviceId = cameraSource.split(':')[1] || '0';
        console.log('📹 ISOLATED: Using webcam device:', deviceId);
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 640, min: 320 },
            height: { ideal: 480, min: 240 },
            frameRate: { ideal: 30, min: 15 }
          }
        };
        
        if (deviceId !== '0' && videoDevices[parseInt(deviceId)]) {
          (constraints.video as MediaTrackConstraints).deviceId = { exact: videoDevices[parseInt(deviceId)].deviceId };
        }
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        console.log('🌐 ISOLATED: Non-webcam source, using default camera');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, min: 320 },
            height: { ideal: 480, min: 240 },
            frameRate: { ideal: 30, min: 15 }
          }
        });
      }
      
      console.log('✅ ISOLATED: Camera stream obtained');
      streamRef.current = stream;
      setIsActive(true);
      
      // Set video source after state update
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          console.log('🎬 ISOLATED: Setting video source');
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          videoRef.current.autoplay = true;
          
          videoRef.current.play().catch(console.error);
        }
      }, 100);
      
    } catch (error) {
      console.error("❌ ISOLATED: Camera error:", error);
      setIsActive(false);
    } finally {
      setIsLoading(false);
    }
  }, [cameraSource, isLoading]);

  const stopCamera = useCallback(() => {
    console.log('🛑 ISOLATED: Stopping camera');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  // Auto-start camera when component mounts
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  if (!isActive) {
    return (
      <div className={`relative w-full bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm ${
        isLarge ? 'h-full' : 'aspect-video'
      } ${className}`}>
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center">
          <div className={`mx-auto mb-3 rounded-full bg-white/10 flex items-center justify-center ${
            isLarge ? 'w-16 h-16' : 'w-8 h-8'
          }`}>
            {isLoading ? (
              <div className={`animate-spin rounded-full border-2 border-white/30 border-t-white/70 ${
                isLarge ? 'w-8 h-8' : 'w-4 h-4'
              }`}></div>
            ) : (
              <svg className={`text-white/70 ${
                isLarge ? 'w-8 h-8' : 'w-4 h-4'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <h3 className={`font-semibold text-white/90 mb-3 ${
            isLarge ? 'text-lg' : 'text-sm'
          }`}>
            {isLoading ? 'Starting Camera...' : 'Camera Ready'}
          </h3>
          {!isLoading && (
            <button
              onClick={startCamera}
              className={`px-4 py-2 bg-blue-600/90 text-white rounded-lg hover:bg-blue-700/90 transition-all duration-200 backdrop-blur-sm border border-white/10 font-medium ${
                isLarge ? 'text-sm' : 'text-xs px-3 py-1.5'
              }`}
            >
              Start Camera
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full bg-black rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm ${
      isLarge ? 'h-full' : 'aspect-video'
    } ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        onPlay={() => {
          console.log('📹 ISOLATED: Video playing');
        }}
        onError={(e) => {
          console.error('❌ ISOLATED: Video error:', e);
        }}
      />
      
      <div className="absolute top-2 left-2 z-10">
        <div className="px-2 py-1 rounded-md bg-green-600/90 text-white text-xs font-medium backdrop-blur-sm border border-white/10">
          🎬 Live
        </div>
      </div>

      <div className={`absolute bottom-2 left-2 right-2 flex ${
        isLarge ? 'flex-row gap-2' : 'flex-col gap-1'
      }`}>
        <button
          onClick={stopCamera}
          className={`px-3 py-2 bg-gray-800/90 text-white rounded-lg hover:bg-gray-700/90 transition-all duration-200 backdrop-blur-sm border border-white/10 font-medium ${
            isLarge ? 'text-sm' : 'text-xs px-2 py-1'
          }`}
        >
          Stop Camera
        </button>
      </div>
    </div>
  );
});

IsolatedWebcamStream.displayName = 'IsolatedWebcamStream';

export default IsolatedWebcamStream;