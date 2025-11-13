"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import CameraManager from "@/lib/camera-manager";

interface OptimizedCameraProps {
  cameraSource: string;
  isLarge?: boolean;
  onError?: (error: Error) => void;
  onStatusChange?: (isActive: boolean) => void;
}

/**
 * Optimized Camera Component - Uses CameraManager to prevent conflicts
 */
export default function OptimizedCamera({ 
  cameraSource,
  isLarge = false,
  onError,
  onStatusChange 
}: OptimizedCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraManager = CameraManager.getInstance();
  const mountedRef = useRef(true);

  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      console.log('🎥 OPTIMIZED-CAMERA: Starting camera for', cameraSource);
      setError(null);
      
      const stream = await cameraManager.getStream(cameraSource);
      
      if (!mountedRef.current) {
        console.log('🚫 OPTIMIZED-CAMERA: Component unmounted, not setting video');
        return;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        
        try {
          await videoRef.current.play();
          console.log('✅ OPTIMIZED-CAMERA: Video playing for', cameraSource);
          setIsActive(true);
          onStatusChange?.(true);
        } catch (playError) {
          console.error('❌ OPTIMIZED-CAMERA: Play error:', playError);
          setError('Failed to play video');
        }
      }
      
    } catch (err) {
      console.error('❌ OPTIMIZED-CAMERA: Camera error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown camera error';
      setError(errorMessage);
      setIsActive(false);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      onStatusChange?.(false);
    }
  }, [cameraSource, cameraManager, onError, onStatusChange]);

  const stopCamera = useCallback(() => {
    console.log('🛑 OPTIMIZED-CAMERA: Stopping camera for', cameraSource);
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsActive(false);
    onStatusChange?.(false);
    
    // Note: We don't release the stream here as other components might be using it
    // The CameraManager handles stream lifecycle
  }, [cameraSource, onStatusChange]);

  // Start camera on mount or source change
  useEffect(() => {
    if (cameraSource) {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [cameraSource, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  if (!isActive) {
    return (
      <div className={`relative w-full bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden border border-white/10 backdrop-blur-sm ${
        isLarge ? 'h-full' : 'aspect-video'
      }`}>
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
          <p className={`text-white/60 text-center ${
            isLarge ? 'text-lg' : 'text-sm'
          }`}>
            {isLarge ? 'Initializing camera...' : 'Loading...'}
          </p>
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
        onLoadedMetadata={() => {
          console.log('📊 OPTIMIZED-CAMERA: Video metadata loaded for', cameraSource);
        }}
        onPlay={() => {
          console.log('▶️ OPTIMIZED-CAMERA: Video playing for', cameraSource);
        }}
        onError={(e) => {
          console.error('❌ OPTIMIZED-CAMERA: Video element error:', e);
          setError('Video playback error');
        }}
      />
      
      <div className="absolute top-2 left-2 z-10">
        <div className="px-2 py-1 rounded-md bg-green-600/90 text-white text-xs font-medium backdrop-blur-sm border border-white/10">
          🎬 Live
        </div>
      </div>

      <div className={`absolute bottom-2 left-2 right-2 flex gap-2 ${
        isLarge ? 'flex-row' : 'flex-col'
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