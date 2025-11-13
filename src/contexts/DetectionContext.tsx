"use client";

import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  label: string;
  category?: string; // 'threat' | 'suspicious'
  llm_false_positive?: boolean; // when true, render gray instead of alert colors
}

export interface DetectionResult {
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
  // Threat/suspicious detection
  threats?: BoundingBox[];
  has_threat?: boolean;
  // Optional LLM validation fields from backend
  llm_is_false_positive?: boolean;
  llm_confidence?: number;
  llm_reason?: string;
  llm_model?: string;
}

interface DetectionState {
  result: DetectionResult | null;
  isDetecting: boolean;
  lastUpdate: number;
}

interface DetectionContextType {
  // Get detection results for a camera source
  getDetectionState: (cameraSource: string) => DetectionState;
  
  // Update detection results for a camera source
  updateDetectionResults: (cameraSource: string, result: DetectionResult) => void;
  
  // Set detection status for a camera source
  setDetectionStatus: (cameraSource: string, isDetecting: boolean) => void;
  
  // Subscribe to detection updates for a camera source
  subscribeToDetections: (cameraSource: string, callback: (state: DetectionState) => void) => () => void;
  
  // Check if any camera is currently detecting
  isAnyDetecting: () => boolean;
  
  // Get all active detection sources
  getActiveSources: () => string[];
}

const DetectionContext = createContext<DetectionContextType | null>(null);

export function useDetectionContext() {
  const context = useContext(DetectionContext);
  if (!context) {
    throw new Error('useDetectionContext must be used within a DetectionProvider');
  }
  return context;
}

export function DetectionProvider({ children }: { children: React.ReactNode }) {
  // Store detection states by camera source
  const detectionStatesRef = useRef<Map<string, DetectionState>>(new Map());
  // Cache LLM verdicts per cameraSource and track_id to persist overlay styling across frames
  const trackVerdictsRef = useRef<Map<string, Map<number, { fp: boolean; ts: number }>>>(new Map());
  const VERDICT_TTL_MS = 15000; // keep a verdict for 15s per track
  // Cache last top-level verdict per camera so overlays can remain consistent when boxes lack flags
  const globalVerdictsRef = useRef<Map<string, { fp: boolean; ts: number }>>(new Map());
  
  // Store subscribers by camera source
  const subscribersRef = useRef<Map<string, Set<(state: DetectionState) => void>>>(new Map());
  
  const getDetectionState = useCallback((cameraSource: string): DetectionState => {
    console.log('🔍 DETECTION-CONTEXT: Getting detection state for', cameraSource);
    
    const existingState = detectionStatesRef.current.get(cameraSource);
    if (existingState) {
      return existingState;
    }
    
    // Return default state if none exists
    const defaultState: DetectionState = {
      result: null,
      isDetecting: false,
      lastUpdate: 0
    };
    
    detectionStatesRef.current.set(cameraSource, defaultState);
    console.log('🔍 DETECTION-CONTEXT: Created default detection state for', cameraSource);
    
    return defaultState;
  }, []);
  
  const updateDetectionResults = useCallback((cameraSource: string, result: DetectionResult) => {
    console.log('📊 DETECTION-CONTEXT: Updating detection results for', cameraSource, '- People:', result.people_count);
    // 1) Persist LLM verdicts per track and top-level when present
    try {
      if (result && Array.isArray(result.threats) && result.threats.length > 0) {
        if (!trackVerdictsRef.current.has(cameraSource)) {
          trackVerdictsRef.current.set(cameraSource, new Map());
        }
        const byTrack = trackVerdictsRef.current.get(cameraSource)!;
        const now = Date.now();
        // If a top-level LLM verdict exists, apply it to all current threat boxes for caching
        const topLevelFP = typeof result.llm_is_false_positive === 'boolean' ? result.llm_is_false_positive : undefined;
        if (typeof topLevelFP === 'boolean') {
          globalVerdictsRef.current.set(cameraSource, { fp: topLevelFP, ts: now });
        }
        for (const t of result.threats) {
          const tid = (t as any).track_id;
          const boxFP = (t as any).llm_false_positive;
          const verdict = (typeof boxFP === 'boolean') ? boxFP : (typeof topLevelFP === 'boolean' ? topLevelFP : undefined);
          if (typeof tid === 'number' && typeof verdict === 'boolean') {
            byTrack.set(tid, { fp: verdict, ts: now });
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ DETECTION-CONTEXT: track verdict persist failed:', e);
    }

    // 2) Apply cached verdicts back onto threats when boxes have track_id but no llm flag
    let mergedResult: DetectionResult = { ...result };
    try {
      if (mergedResult && Array.isArray(mergedResult.threats) && mergedResult.threats.length > 0) {
        const byTrack = trackVerdictsRef.current.get(cameraSource);
        if (byTrack) {
          const now = Date.now();
          // Clean up expired entries
          for (const [tid, rec] of Array.from(byTrack.entries())) {
            if (now - rec.ts > VERDICT_TTL_MS) byTrack.delete(tid);
          }
          mergedResult = {
            ...mergedResult,
            threats: mergedResult.threats.map((t) => {
              const tid = (t as any).track_id;
              const hasFlag = typeof (t as any).llm_false_positive === 'boolean';
              if (typeof tid === 'number' && !hasFlag) {
                const rec = byTrack.get(tid);
                if (rec) {
                  return { ...t, llm_false_positive: rec.fp } as any;
                }
              }
              return t;
            }) as any,
          };
        }
      }
    } catch (e) {
      console.warn('⚠️ DETECTION-CONTEXT: apply cached verdicts failed:', e);
    }

    // 3) If no top-level verdict present on this update, but we have a recent cached global verdict, re-apply it
    try {
      if (typeof mergedResult.llm_is_false_positive !== 'boolean') {
        const rec = globalVerdictsRef.current.get(cameraSource);
        if (rec && (Date.now() - rec.ts) <= VERDICT_TTL_MS) {
          mergedResult = { ...mergedResult, llm_is_false_positive: rec.fp };
        }
      }
    } catch (e) {
      console.warn('⚠️ DETECTION-CONTEXT: apply global verdict failed:', e);
    }

    const currentState = getDetectionState(cameraSource);
    const newState: DetectionState = {
      ...currentState,
      result: { ...mergedResult, timestamp: Date.now() },
      lastUpdate: Date.now()
    };
    
    detectionStatesRef.current.set(cameraSource, newState);
    
    // Notify all subscribers for this camera source
    const subscribers = subscribersRef.current.get(cameraSource);
    if (subscribers) {
      console.log('📢 DETECTION-CONTEXT: Notifying', subscribers.size, 'subscribers for', cameraSource);
      subscribers.forEach(callback => {
        try {
          callback(newState);
        } catch (error) {
          console.error('❌ DETECTION-CONTEXT: Error in subscriber callback:', error);
        }
      });
    }
    
    // Detection results updated and subscribers notified
  }, [getDetectionState]);
  
  const setDetectionStatus = useCallback((cameraSource: string, isDetecting: boolean) => {
    console.log('🎯 DETECTION-CONTEXT: Setting detection status for', cameraSource, ':', isDetecting);
    
    const currentState = getDetectionState(cameraSource);
    const newState: DetectionState = {
      ...currentState,
      isDetecting,
      lastUpdate: Date.now()
    };
    
    detectionStatesRef.current.set(cameraSource, newState);
    
    // Notify subscribers
    const subscribers = subscribersRef.current.get(cameraSource);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(newState);
        } catch (error) {
          console.error('❌ DETECTION-CONTEXT: Error in subscriber callback:', error);
        }
      });
    }
    // Detection status updated and subscribers notified
  }, [getDetectionState]);
  
  const subscribeToDetections = useCallback((
    cameraSource: string, 
    callback: (state: DetectionState) => void
  ): (() => void) => {
    console.log('🔔 DETECTION-CONTEXT: Adding subscriber for', cameraSource);
    
    // Initialize subscribers set if it doesn't exist
    if (!subscribersRef.current.has(cameraSource)) {
      subscribersRef.current.set(cameraSource, new Set());
    }
    
    const subscribers = subscribersRef.current.get(cameraSource)!;
    subscribers.add(callback);
    
    console.log('🔔 DETECTION-CONTEXT: Now', subscribers.size, 'subscribers for', cameraSource);
    
    // Return unsubscribe function
    return () => {
      console.log('🔕 DETECTION-CONTEXT: Removing subscriber for', cameraSource);
      subscribers.delete(callback);
      
      if (subscribers.size === 0) {
        subscribersRef.current.delete(cameraSource);
        console.log('🧹 DETECTION-CONTEXT: Cleaned up empty subscribers for', cameraSource);
      }
    };
  }, []);
  
  const isAnyDetecting = useCallback((): boolean => {
    for (const [, state] of detectionStatesRef.current.entries()) {
      if (state.isDetecting) {
        return true;
      }
    }
    return false;
  }, []);
  
  const getActiveSources = useCallback((): string[] => {
    const activeSources: string[] = [];
    for (const [source, state] of detectionStatesRef.current.entries()) {
      if (state.result || state.isDetecting) {
        activeSources.push(source);
      }
    }
    return activeSources;
  }, []);
  
  // Cleanup old detection results periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 30000; // 30 seconds
      
      for (const [source, state] of detectionStatesRef.current.entries()) {
        if (state.result && (now - state.lastUpdate) > maxAge && !state.isDetecting) {
          console.log('🧹 DETECTION-CONTEXT: Cleaning up old detection data for', source);
          const newState: DetectionState = {
            ...state,
            result: null,
            lastUpdate: now
          };
          detectionStatesRef.current.set(source, newState);
          
          // Notify subscribers
          const subscribers = subscribersRef.current.get(source);
          if (subscribers) {
            subscribers.forEach(callback => callback(newState));
          }
        }
      }
      
      // Old detection data cleaned up
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(cleanupInterval);
  }, []);
  
  const contextValue: DetectionContextType = {
    getDetectionState,
    updateDetectionResults,
    setDetectionStatus,
    subscribeToDetections,
    isAnyDetecting,
    getActiveSources
  };
  
  console.log('🎯 DETECTION-CONTEXT: Provider initialized');
  
  return (
    <DetectionContext.Provider value={contextValue}>
      {children}
    </DetectionContext.Provider>
  );
}
