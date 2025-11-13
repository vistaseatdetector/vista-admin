"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface WebcamStreamProps {
  isLarge?: boolean;
  cameraSource?: string;
  onError?: (error: Error) => void;
  onStatusChange?: (isActive: boolean) => void;
}

export default function WebcamStream({ 
  isLarge = false, 
  cameraSource = "webcam:0",
  onError,
  onStatusChange 
}: WebcamStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  // Stabilize callbacks to avoid effect churn
  const onStatusChangeRef = useRef<typeof onStatusChange | null>(onStatusChange || null);
  const onErrorRef = useRef<typeof onError | null>(onError || null);
  useEffect(() => { onStatusChangeRef.current = onStatusChange || null; }, [onStatusChange]);
  useEffect(() => { onErrorRef.current = onError || null; }, [onError]);

  const startCamera = useCallback(async () => {
    try {
      // If already playing the same stream, do not restart
      if (streamRef.current && videoRef.current && videoRef.current.srcObject === streamRef.current) {
        console.log('✅ BASIC: Using existing stream to prevent blinking');
        setIsActive(true);
        try { onStatusChangeRef.current?.(true); } catch {}
        return;
      }
      
      console.log('🎥 STARTING CAMERA...');
      console.log('📡 Camera source:', cameraSource);
      
      let stream: MediaStream;
      
      // Handle different camera sources
      if (cameraSource?.startsWith('webcam:')) {
        const deviceId = cameraSource.split(':')[1] || '0';
        console.log('📹 Using webcam device:', deviceId);
        
        // Get available devices first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('📱 Available video devices:', videoDevices.length);
        
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 640, min: 320 },
            height: { ideal: 480, min: 240 },
            frameRate: { ideal: 30, min: 15 }
          }
        };
        
        // If specific device index requested, try to use it
        if (deviceId !== '0' && videoDevices[parseInt(deviceId)]) {
          (constraints.video as MediaTrackConstraints).deviceId = { exact: videoDevices[parseInt(deviceId)].deviceId };
        }
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        // For other sources (RTSP, HTTP streams), just use default webcam for now
        // TODO: Implement actual RTSP/HTTP stream handling
        console.log('🌐 Non-webcam source detected, using default camera');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, min: 320 },
            height: { ideal: 480, min: 240 },
            frameRate: { ideal: 30, min: 15 }
          }
        });
      }
      
      console.log('✅ CAMERA STREAM OBTAINED');
      console.log('📊 Active tracks:', stream.getVideoTracks().length);
      
      // Store the stream immediately
      streamRef.current = stream;
      
      // Set active first to render the video element
      setIsActive(true);
      
      // Notify parent of status change
      try { onStatusChangeRef.current?.(true); } catch {}
      
      console.log('🔄 ACTIVATING COMPONENT TO RENDER VIDEO ELEMENT...');
      
    } catch (error) {
      console.error("❌ CAMERA ERROR:", error);
      try { onErrorRef.current?.(error instanceof Error ? error : new Error(String(error))); } catch {}
      setIsActive(false);
      try { onStatusChangeRef.current?.(false); } catch {}
    }
  }, [cameraSource]);

  const stopCamera = useCallback(() => {
    console.log('🛑 STOPPING CAMERA...');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    try { onStatusChangeRef.current?.(false); } catch {}
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Effect to set video source when component becomes active and video ref is ready
  useEffect(() => {
    if (isActive && videoRef.current && streamRef.current) {
      console.log('🎬 SETTING VIDEO SOURCE AFTER RENDER...');
      console.log('🔍 Video element ready:', !!videoRef.current);
      console.log('🔍 Stream ready:', !!streamRef.current);
      console.log('🔍 Stream active tracks:', streamRef.current.getVideoTracks().length);
      console.log('🔍 Video track enabled:', streamRef.current.getVideoTracks()[0]?.enabled);
      console.log('🔍 Video track readyState:', streamRef.current.getVideoTracks()[0]?.readyState);
      
      // Set the source
      videoRef.current.srcObject = streamRef.current;
      
      // Force video attributes
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.autoplay = true;
      
      console.log('⚙️ VIDEO ATTRIBUTES SET');
      console.log('🔍 Video srcObject set:', !!videoRef.current.srcObject);
      
      // Force play
      const playVideo = async () => {
        if (videoRef.current) {
          try {
            console.log('▶️ FORCING VIDEO PLAY...');
            console.log('📺 Video readyState:', videoRef.current.readyState);
            console.log('📺 Video networkState:', videoRef.current.networkState);
            console.log('📺 Video videoWidth:', videoRef.current.videoWidth);
            console.log('📺 Video videoHeight:', videoRef.current.videoHeight);
            
            await videoRef.current.play();
            console.log('🎬 VIDEO IS NOW PLAYING!');
            
            // Check if video actually has dimensions after play
            setTimeout(() => {
              if (videoRef.current) {
                console.log('📏 POST-PLAY Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
                console.log('📏 POST-PLAY Video element size:', videoRef.current.offsetWidth, 'x', videoRef.current.offsetHeight);
              }
            }, 1000);
            
          } catch (playError) {
            console.error('❌ PLAY ERROR:', playError);
            // Try again with a delay
            setTimeout(() => {
              if (videoRef.current) {
                console.log('🔁 RETRYING VIDEO PLAY...');
                videoRef.current.play().catch(console.error);
              }
            }, 500);
          }
        }
      };
      
      // Small delay to ensure video element is fully ready
      setTimeout(playVideo, 100);
    }
  }, [isActive]);

  if (!isActive) {
    return (
      <div className={`relative w-full bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm ${
        isLarge ? 'h-full' : 'aspect-video'
      }`}>
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

  return (
    <div className={`relative w-full bg-black rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm ${
      isLarge ? 'h-full' : 'aspect-video'
    }`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
        onPlay={() => {
          console.log('📹 VIDEO PLAYING EVENT');
          console.log('📏 Video dimensions on play:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
          setIsActive(true);
        }}
        onLoadedData={() => {
          console.log('📊 VIDEO DATA LOADED');
          console.log('📏 Video dimensions on load:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
        }}
        onCanPlay={() => {
          console.log('✅ VIDEO CAN PLAY');
          console.log('📏 Video dimensions can play:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
        }}
        onError={(e) => {
          console.error('❌ VIDEO ERROR:', e);
          console.error('❌ Video error details:', (e.target as HTMLVideoElement)?.error);
        }}
        onLoadedMetadata={() => {
          console.log('📋 VIDEO METADATA LOADED');
          console.log('📐 Video dimensions metadata:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
          
          // Force a size check
          if (videoRef.current) {
            console.log('🔍 Video element properties:');
            console.log('  - videoWidth:', videoRef.current.videoWidth);
            console.log('  - videoHeight:', videoRef.current.videoHeight);
            console.log('  - readyState:', videoRef.current.readyState);
            console.log('  - networkState:', videoRef.current.networkState);
            console.log('  - srcObject:', !!videoRef.current.srcObject);
            console.log('  - currentTime:', videoRef.current.currentTime);
            console.log('  - duration:', videoRef.current.duration);
          }
        }}
        onWaiting={() => console.log('⏳ VIDEO WAITING')}
        onStalled={() => console.log('🚫 VIDEO STALLED')}
        onSuspend={() => console.log('⏸️ VIDEO SUSPENDED')}
        onProgress={() => console.log('📈 VIDEO PROGRESS')}
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
}
