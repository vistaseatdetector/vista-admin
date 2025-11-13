"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface StreamViewerProps {
  stream: {
    id: string;
    name: string;
    url: string | null;
    kind: string;
  };
  isLarge?: boolean;
}

export default function StreamViewer({ stream, isLarge = true }: StreamViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(async () => {
    if (!stream || !videoRef.current) {
      console.error('StreamViewer: Missing stream or video ref', { stream, videoRef: videoRef.current });
      return;
    }
    
    console.log('StreamViewer: Starting stream', stream);
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (stream.url?.startsWith('webcam:') || stream.kind === 'webcam') {
        // Handle webcam streams
        console.log('StreamViewer: Detected webcam stream', stream.url);
        const cameraId = stream.url?.replace('webcam:', '') || '0';
        const constraints = {
          video: { 
            deviceId: cameraId === '0' ? undefined : { exact: cameraId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        
        console.log('StreamViewer: Requesting camera with constraints', constraints);
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('StreamViewer: Got media stream', mediaStream);
        
        videoRef.current.srcObject = mediaStream;
        streamRef.current = mediaStream;
        setHasPermission(true);
        
      } else if (stream.url && (stream.url.startsWith('rtsp://') || stream.url.startsWith('http'))) {
        // Handle RTSP/HTTP streams
        console.log('StreamViewer: Detected RTSP/HTTP stream', stream.url);
        // Note: Direct RTSP playback in browsers requires a media server or WebRTC proxy
        // For now, we'll show a placeholder since browsers can't directly play RTSP
        setError(`${stream.kind.toUpperCase()} streams require a media server proxy for browser playback`);
        setHasPermission(false);
        
      } else {
        console.error('StreamViewer: Unsupported stream', stream);
        setError('Unsupported stream type or no URL configured');
        setHasPermission(false);
      }
    } catch (err) {
      console.error('StreamViewer: Stream error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to access camera stream');
      }
      setHasPermission(false);
    } finally {
      setIsLoading(false);
    }
  }, [stream]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setHasPermission(null);
    setError(null);
  }, []);

  useEffect(() => {
    // Reset state when stream changes
    if (stream) {
      console.log('StreamViewer: Stream prop changed', stream);
      setHasPermission(null);
      setError(null);
      setIsLoading(false);
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  if (hasPermission === null && !isLoading) {
    return (
      <div className="relative w-full h-full bg-slate-800 rounded-lg flex flex-col items-center justify-center">
        <div className={`mx-auto mb-2 rounded-full bg-white/10 flex items-center justify-center ${
          isLarge ? 'w-20 h-20' : 'w-8 h-8'
        }`}>
          <svg className={`text-white/60 ${
            isLarge ? 'w-10 h-10' : 'w-4 h-4'
          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className={`font-semibold text-white/80 mb-2 ${
          isLarge ? 'text-lg' : 'text-sm'
        }`}>{stream.name}</h3>
        <p className={`text-white/60 text-center mb-4 ${
          isLarge ? 'text-sm' : 'text-xs'
        }`}>
          {stream.kind.toUpperCase()} Stream Ready
        </p>
        <div className={`text-white/40 text-center mb-4 font-mono ${
          isLarge ? 'text-xs' : 'text-xs'
        }`}>
          URL: {stream.url || 'No URL'}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            console.log('StreamViewer: Button clicked!', stream);
            startStream();
          }}
          disabled={isLoading}
          className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 ${
            isLarge ? 'text-sm' : 'text-xs px-3 py-1.5'
          }`}
        >
          {isLoading ? 'Starting...' : 'Start Stream'}
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative w-full h-full bg-slate-800 rounded-lg flex flex-col items-center justify-center">
        <div className={`mx-auto mb-2 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse ${
          isLarge ? 'w-20 h-20' : 'w-8 h-8'
        }`}>
          <svg className={`text-blue-400 ${
            isLarge ? 'w-10 h-10' : 'w-4 h-4'
          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <h3 className={`font-semibold text-white/80 mb-2 ${
          isLarge ? 'text-lg' : 'text-sm'
        }`}>Starting {stream.name}</h3>
        <p className={`text-white/60 text-center ${
          isLarge ? 'text-sm' : 'text-xs'
        }`}>
          Connecting to {stream.kind.toUpperCase()} stream...
        </p>
      </div>
    );
  }

  if (hasPermission === false || error) {
    return (
      <div className="relative w-full h-full bg-slate-800 rounded-lg flex flex-col items-center justify-center">
        <div className={`mx-auto mb-2 rounded-full bg-red-500/20 flex items-center justify-center ${
          isLarge ? 'w-20 h-20' : 'w-8 h-8'
        }`}>
          <svg className={`text-red-400 ${
            isLarge ? 'w-10 h-10' : 'w-4 h-4'
          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className={`font-semibold text-white/80 mb-2 ${
          isLarge ? 'text-lg' : 'text-sm'
        }`}>Stream Error</h3>
        <p className={`text-white/60 text-center mb-4 ${
          isLarge ? 'text-sm' : 'text-xs'
        }`}>
          {error || 'Failed to access stream'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={startStream}
            className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${
              isLarge ? 'text-sm' : 'text-xs px-3 py-1.5'
            }`}
          >
            Try Again
          </button>
          <button
            onClick={stopStream}
            className={`px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors ${
              isLarge ? 'text-sm' : 'text-xs px-3 py-1.5'
            }`}
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-800 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        onLoadStart={() => setIsLoading(true)}
        onLoadedData={() => setIsLoading(false)}
        onError={(e) => {
          console.error('Video error:', e);
          setError('Video playback failed');
          setHasPermission(false);
        }}
      />
      
      {/* Stream Info Overlay */}
      <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
        {stream.name} • {stream.kind.toUpperCase()}
      </div>
      
      {/* Controls */}
      <div className={`absolute bottom-2 left-2 right-2 flex gap-2 ${
        isLarge ? 'flex-row' : 'flex-col'
      }`}>
        <button
          onClick={stopStream}
          className={`px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors ${
            isLarge ? 'text-sm' : 'text-xs px-2 py-1'
          }`}
        >
          Stop Stream
        </button>
      </div>
    </div>
  );
}