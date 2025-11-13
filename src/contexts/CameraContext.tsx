"use client";

import { createContext, useContext, useRef, useCallback, useState, useEffect } from 'react';

interface CameraContextType {
  getSharedStream: (cameraSource: string) => Promise<MediaStream>;
  releaseSharedStream: (cameraSource: string) => void;
  isStreamActive: (cameraSource: string) => boolean;
  getAllActiveStreams: () => string[];
}

const CameraContext = createContext<CameraContextType | null>(null);

interface CameraProviderProps {
  children: React.ReactNode;
}

export function CameraProvider({ children }: CameraProviderProps) {
  const activeStreams = useRef<Map<string, MediaStream>>(new Map());
  const streamUsers = useRef<Map<string, number>>(new Map()); // Track how many components use each stream
  const releaseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [, forceUpdate] = useState({});

  // Debug provider creation
  useEffect(() => {
    console.log('📹 CAMERA-PROVIDER: Created and mounted');
    return () => {
      console.log('📹 CAMERA-PROVIDER: Unmounting and cleaning up');
    };
  }, []);

  const getSharedStream = useCallback(async (cameraSource: string): Promise<MediaStream> => {
    // Cancel any pending delayed release for this source
    const pending = releaseTimers.current.get(cameraSource);
    if (pending) {
      clearTimeout(pending);
      releaseTimers.current.delete(cameraSource);
    }
    // Check if we already have this stream
    const existingStream = activeStreams.current.get(cameraSource);
    if (existingStream && existingStream.active) {
      // Increment user count
      const currentUsers = streamUsers.current.get(cameraSource) || 0;
      streamUsers.current.set(cameraSource, currentUsers + 1);
      console.log(`📹 CAMERA-CONTEXT: Reusing stream for ${cameraSource} (${currentUsers + 1} users)`);
      return existingStream;
    }

    // Create new stream
    console.log(`📹 CAMERA-CONTEXT: Creating new stream for ${cameraSource}`);
    
    // Check browser support first
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API not supported in this browser');
    }
    
    let constraints: MediaStreamConstraints;
    
    if (cameraSource?.startsWith('webcam:')) {
      const deviceId = cameraSource.split(':')[1] || '0';
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      constraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 }
        }
      };
      
      if (deviceId !== '0' && videoDevices[parseInt(deviceId)]) {
        (constraints.video as MediaTrackConstraints).deviceId = { 
          exact: videoDevices[parseInt(deviceId)].deviceId 
        };
      }
    } else {
      constraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 }
        }
      };
    }

    console.log(`📷 CAMERA-CONTEXT: Requesting media with constraints:`, constraints);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`✅ CAMERA-CONTEXT: Successfully created stream for ${cameraSource}`, stream);
      
      // Store the stream
      activeStreams.current.set(cameraSource, stream);
      streamUsers.current.set(cameraSource, 1);
      
      // Add cleanup when stream ends
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log(`📹 CAMERA-CONTEXT: Stream ended for ${cameraSource}`);
          activeStreams.current.delete(cameraSource);
          streamUsers.current.delete(cameraSource);
          forceUpdate({});
        });
      });

      console.log(`✅ CAMERA-CONTEXT: Stream setup complete for ${cameraSource}`);
      forceUpdate({});
      return stream;
    } catch (error) {
      console.error(`❌ CAMERA-CONTEXT: Failed to create stream for ${cameraSource}:`, error);
      
      // Provide more specific error messages
      const mediaError = error as DOMException;
      if (mediaError.name === 'NotAllowedError') {
        throw new Error('Camera permission denied. Please allow camera access and try again.');
      } else if (mediaError.name === 'NotFoundError') {
        throw new Error('No camera found. Please connect a camera and try again.');
      } else if (mediaError.name === 'NotReadableError') {
        throw new Error('Camera is already in use by another application.');
      } else if (mediaError.name === 'OverconstrainedError') {
        throw new Error('Camera does not support the requested settings.');
      } else {
        throw new Error(`Camera access failed: ${mediaError.message || 'Unknown error'}`);
      }
    }
  }, []);

  const releaseSharedStream = useCallback((cameraSource: string) => {
    const currentUsers = streamUsers.current.get(cameraSource) || 0;
    
    if (currentUsers <= 1) {
      // Last user: schedule a short grace period before stopping to avoid black flashes during handoff
      if (!releaseTimers.current.has(cameraSource)) {
        const timer = setTimeout(() => {
          // If no new users appeared, stop the stream
          const usersNow = streamUsers.current.get(cameraSource) || 0;
          if (usersNow <= 0) {
            const stream = activeStreams.current.get(cameraSource);
            if (stream) {
              console.log(`🛑 CAMERA-CONTEXT: Releasing stream for ${cameraSource} after grace period`);
              stream.getTracks().forEach(track => track.stop());
              activeStreams.current.delete(cameraSource);
            }
            streamUsers.current.delete(cameraSource);
            forceUpdate({});
          }
          releaseTimers.current.delete(cameraSource);
        }, 500); // 0.5s grace window
        releaseTimers.current.set(cameraSource, timer);
      }
    } else {
      // Still has users, just decrement count
      streamUsers.current.set(cameraSource, currentUsers - 1);
      console.log(`📹 CAMERA-CONTEXT: Decremented users for ${cameraSource} (${currentUsers - 1} remaining)`);
    }
    
    forceUpdate({});
  }, []);

  const isStreamActive = useCallback((cameraSource: string): boolean => {
    const stream = activeStreams.current.get(cameraSource);
    return !!(stream && stream.active);
  }, []);

  const getAllActiveStreams = useCallback((): string[] => {
    return Array.from(activeStreams.current.keys());
  }, []);

  // Cleanup all streams when provider unmounts
  useEffect(() => {
    const streams = activeStreams.current;
    const users = streamUsers.current;
    const timers = releaseTimers.current;
    
    return () => {
      console.log('🛑 CAMERA-CONTEXT: Cleaning up all streams');
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      streams.forEach((stream) => {
        stream.getTracks().forEach(track => track.stop());
      });
      streams.clear();
      users.clear();
    };
  }, []);

  const value: CameraContextType = {
    getSharedStream,
    releaseSharedStream,
    isStreamActive,
    getAllActiveStreams
  };

  console.log('📹 CAMERA-PROVIDER: Rendering with context value:', !!value);

  return (
    <CameraContext.Provider value={value}>
      {children}
    </CameraContext.Provider>
  );
}

export function useCameraContext() {
  const context = useContext(CameraContext);
  if (!context) {
    console.error('❌ CameraContext is null - component not wrapped in CameraProvider');
    console.error('Current component stack:', new Error().stack);
    throw new Error('useCameraContext must be used within a CameraProvider');
  }
  return context;
}
