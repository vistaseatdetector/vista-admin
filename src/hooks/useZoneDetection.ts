"use client";

import { useCallback, useRef, useState, useEffect } from 'react';
import { useDetectionContext } from '@/contexts/DetectionContext';
import { createClient } from '@/lib/supabase/client';

interface DoorZone {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Optional frame-space coordinates (used when available)
  frame_x1?: number;
  frame_y1?: number;
  frame_x2?: number;
  frame_y2?: number;
  // Optional metadata
  door_id?: string;
  door_name?: string;
  camera_id?: string;
}

interface ZoneDetectionState {
  previousPeopleInZones: number;
  lastDetectionTime: number;
  // Prefer backend-provided occupancy when available
  previousBackendOccupancy?: number;
  previousBackendEntries?: number;
}

interface UseZoneDetectionProps {
  orgSlug: string;
  cameraSource: string;
  enabled?: boolean;
  detectionCooldown?: number; // Minimum time between occupancy updates (ms)
}

export function useZoneDetection({
  orgSlug,
  cameraSource,
  enabled = true,
  detectionCooldown = 2000 // 2 seconds default
}: UseZoneDetectionProps) {
  const detectionContext = useDetectionContext();
  const supabase = createClient();
  
  const [doorZones, setDoorZones] = useState<DoorZone[]>([]);
  const stateRef = useRef<ZoneDetectionState>({
    previousPeopleInZones: 0,
    lastDetectionTime: 0,
    previousBackendOccupancy: undefined,
    previousBackendEntries: undefined,
  });

  // Load door zones from localStorage
  useEffect(() => {
    const loadDoorZones = () => {
      try {
        const saved = localStorage.getItem('doorZones');
        if (saved) {
          const zones = JSON.parse(saved) as DoorZone[];
          setDoorZones(zones);
          console.log('🚪 ZONE-DETECTION: Loaded door zones:', zones.length);
        }
      } catch (error) {
        console.error('❌ ZONE-DETECTION: Error loading door zones:', error);
      }
    };

    loadDoorZones();

    // Listen for updates
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'doorZones') loadDoorZones();
    };
    const handleCustomUpdate = () => loadDoorZones();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('doorZonesUpdated', handleCustomUpdate as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('doorZonesUpdated', handleCustomUpdate as EventListener);
    };
  }, []);

  // Check if detections intersect with door zones
  const checkZoneIntersections = useCallback((
    detections: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      confidence: number;
      label: string;
    }>,
    frameWidth?: number,
    frameHeight?: number
  ) => {
    console.log('🔍 ZONE-DETECTION: Checking intersections for', cameraSource, '- Zones:', doorZones.length, 'Detections:', detections.length);

    if (!doorZones.length || !detections.length) {
      return 0;
    }

    // Attempt to derive the displayed video rect for this camera to map
    // drawn zone coordinates (display space) -> frame coordinates (detection space)
    let videoW = frameWidth ?? 0;
    let videoH = frameHeight ?? 0;
    let containerW = 0;
    let containerH = 0;
    let offsetX = 0;
    let offsetY = 0;

    try {
      const videoEl = document.querySelector(`video[data-camera-source="${cameraSource}"]`) as HTMLVideoElement | null;
      if (videoEl) {
        const rect = videoEl.getBoundingClientRect();
        containerW = rect.width;
        containerH = rect.height;
        // Prefer actual intrinsic video size if available
        if (!videoW || !videoH) {
          videoW = videoEl.videoWidth;
          videoH = videoEl.videoHeight;
        }
        if (videoW && videoH) {
          const r = Math.min(containerW / videoW, containerH / videoH);
          const contentW = videoW * r;
          const contentH = videoH * r;
          offsetX = (containerW - contentW) / 2;
          offsetY = (containerH - contentH) / 2;
          // Replace container dims with the actual content box for mapping
          containerW = contentW;
          containerH = contentH;
        }
      }
    } catch (e) {
      console.warn('⚠️ ZONE-DETECTION: Unable to compute display->frame mapping:', e);
    }

    const toFrame = (x: number, y: number) => {
      if (!videoW || !videoH || !containerW || !containerH) {
        // Without a measurable display rect, we cannot reliably map
        // display-space zones to frame-space. In that case, the caller
        // should prefer zones that already include frame-space coords.
        return { x, y };
      }
      // Map from display pixel to content-local coordinate (remove letterbox offsets)
      const localX = x - offsetX;
      const localY = y - offsetY;
      const nx = Math.max(0, Math.min(1, localX / containerW));
      const ny = Math.max(0, Math.min(1, localY / containerH));
      return { x: nx * videoW, y: ny * videoH };
    };

    let peopleInZones = 0;

    detections.forEach((detection, detIndex) => {
      // Detection center in FRAME coordinates
      const detectionCenterX = (detection.x1 + detection.x2) / 2;
      const detectionCenterY = (detection.y1 + detection.y2) / 2;

      doorZones.forEach((zone, zoneIndex) => {
        // Prefer precomputed frame-space coordinates if present
        const hasFrame = typeof zone.frame_x1 === 'number' && typeof zone.frame_y1 === 'number'
          && typeof zone.frame_x2 === 'number' && typeof zone.frame_y2 === 'number';

        const p1 = hasFrame
          ? { x: zone.frame_x1 as number, y: zone.frame_y1 as number }
          : toFrame(zone.x1, zone.y1);
        const p2 = hasFrame
          ? { x: zone.frame_x2 as number, y: zone.frame_y2 as number }
          : toFrame(zone.x2, zone.y2);
        const zoneMinX = Math.min(p1.x, p2.x);
        const zoneMaxX = Math.max(p1.x, p2.x);
        const zoneMinY = Math.min(p1.y, p2.y);
        const zoneMaxY = Math.max(p1.y, p2.y);

        const isInZone = (
          detectionCenterX >= zoneMinX &&
          detectionCenterX <= zoneMaxX &&
          detectionCenterY >= zoneMinY &&
          detectionCenterY <= zoneMaxY
        );

        if (isInZone) {
          console.log(`✅ ZONE-DETECTION: Person ${detIndex} is in zone ${zoneIndex} (${zone.door_name})`);
          peopleInZones++;
        }
      });
    });

    console.log(`🏁 ZONE-DETECTION: Total people in zones: ${peopleInZones}`);
    return peopleInZones;
  }, [doorZones, cameraSource]);

  // Update occupancy in database
  const updateOccupancy = useCallback(async (changeInPeople: number) => {
    console.log('💾 ZONE-DETECTION: Updating occupancy:', changeInPeople);
    
    try {
      // Get organization data
      const { data: orgData } = await supabase
        .from('orgs')
        .select('id')
        .eq('slug', orgSlug)
        .single();
      
      if (!orgData) {
        console.error('❌ ZONE-DETECTION: No org data found for slug:', orgSlug);
        return;
      }

      // Get current occupancy
      const { data: currentOcc } = await supabase
        .from('metrics_occ')
        .select('people_count')
        .eq('org_id', orgData.id)
        .order('observed_at', { ascending: false })
        .limit(1)
        .single();

      const currentCount = currentOcc?.people_count || 0;
      const newCount = Math.max(0, currentCount + changeInPeople); // Ensure non-negative

      console.log('📊 ZONE-DETECTION: Occupancy calculation:', {
        currentCount,
        changeInPeople,
        newCount
      });

      // Insert via secure server route (uses service role, bypasses RLS)
      const resp = await fetch(`/api/org/${orgSlug}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people_count: newCount })
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error('❌ ZONE-DETECTION: Database insert error (server route):', { status: resp.status, body: text });
      } else {
        const inserted = await resp.json().catch(() => null);
        console.log('✅ ZONE-DETECTION: Successfully inserted occupancy record (server route):', inserted);
      }

      console.log(`✅ ZONE-DETECTION: Occupancy updated: ${currentCount} → ${newCount} (${changeInPeople > 0 ? '+' : ''}${changeInPeople})`);

    } catch (error) {
      console.error('❌ ZONE-DETECTION: Error updating occupancy:', error);
    }
  }, [supabase, orgSlug]);

  // Handle detection results from the universal detection system
  const handleDetectionResult = useCallback((result: {
    people_count: number;
    detections: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      confidence: number;
      label: string;
    }>;
    processing_time: number;
    image_width: number;
    image_height: number;
    timestamp: number;
  }) => {
    if (!enabled || !doorZones.length) {
      return;
    }

    // Ensure we use the latest zones saved in localStorage
    try {
      const saved = localStorage.getItem('doorZones');
      if (saved) setDoorZones(JSON.parse(saved));
    } catch {}

    const currentTime = Date.now();
    const state = stateRef.current;

    // Only process if enough time has passed since last detection
    if (currentTime - state.lastDetectionTime < detectionCooldown) {
      console.log('⏰ ZONE-DETECTION: Skipping - too soon since last detection');
      return;
    }

    if (!result.detections || !Array.isArray(result.detections)) {
      console.log('❌ ZONE-DETECTION: No valid detections array');
      return;
    }

    // If backend provided zone-based counters, prefer them
    const backendOcc = (result as any).current_occupancy;
    const backendEntries = (result as any).entry_count;

    if (typeof backendOcc === 'number' || typeof backendEntries === 'number') {
      const prevOcc = state.previousBackendOccupancy ?? backendOcc ?? 0;
      const delta = (typeof backendOcc === 'number' ? backendOcc : prevOcc) - prevOcc;
      console.log('🧭 ZONE-DETECTION: Backend occupancy', backendOcc, 'previous', prevOcc, 'delta', delta);
      if (delta !== 0 && currentTime - state.lastDetectionTime >= detectionCooldown) {
        updateOccupancy(delta);
        stateRef.current = {
          ...state,
          previousBackendOccupancy: typeof backendOcc === 'number' ? backendOcc : prevOcc,
          previousBackendEntries: typeof backendEntries === 'number' ? backendEntries : state.previousBackendEntries,
          lastDetectionTime: currentTime,
        };
      }
      return;
    }

    const peopleInZones = checkZoneIntersections(
      result.detections,
      // Prefer explicit frame size fields if present
      (result as any).frame_width ?? result.image_width,
      (result as any).frame_height ?? result.image_height
    );
    console.log('👥 ZONE-DETECTION: People in zones:', peopleInZones, 'Previous:', state.previousPeopleInZones);

    const changeInPeople = peopleInZones - state.previousPeopleInZones;

    if (changeInPeople !== 0) {
      console.log('📈 ZONE-DETECTION: Occupancy change detected:', changeInPeople);
      updateOccupancy(changeInPeople);
      
      // Update state
      stateRef.current = {
        ...state,
        previousPeopleInZones: peopleInZones,
        lastDetectionTime: currentTime
      };
    } else {
      console.log('📊 ZONE-DETECTION: No change in occupancy detected');
    }
  }, [enabled, doorZones, detectionCooldown, checkZoneIntersections, updateOccupancy]);

  // Subscribe to detection updates for this camera source
  useEffect(() => {
    if (!enabled || !detectionContext) {
      return;
    }

    console.log('🔔 ZONE-DETECTION: Subscribing to detection updates for', cameraSource);

    const unsubscribe = detectionContext.subscribeToDetections(cameraSource, (state) => {
      if (state.result) {
        handleDetectionResult(state.result);
      }
    });

    return unsubscribe;
  }, [enabled, detectionContext, cameraSource, handleDetectionResult]);

  return {
    doorZones,
    peopleInZones: stateRef.current.previousPeopleInZones,
    checkZoneIntersections,
    updateOccupancy
  };
}
