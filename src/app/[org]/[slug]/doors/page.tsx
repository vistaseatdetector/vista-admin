"use client";

import { useState, useRef, useEffect } from 'react';
import React from 'react';
import { useParams } from 'next/navigation';
import { Shield } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import GlassCard from '@/components/ui/GlassCard';
import SharedCamera from '@/components/SharedCamera';
import { useZoneDetection } from '@/hooks/useZoneDetection';

interface DoorZone {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  camera_id?: string;
  stream_id?: string;
  org_id?: string;
  door_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface Door {
  id: string;
  name: string;
  camera_id: string;
  camera_name: string;
  status: 'active' | 'inactive';
  created_at: string;
}

// Isolated Video Container Component - prevents re-renders when parent state changes
const VideoContainer = React.memo(({ 
  featuredStreamId,
  drawMode,
  canvasRef,
  streamContainerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  updateGuestCount
}: {
  featuredStreamId: string;
  drawMode: 'draw' | 'erase' | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  streamContainerRef: React.RefObject<HTMLDivElement | null>;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  updateGuestCount: (count: number) => void;
}) => {
  return (
    <div 
      ref={streamContainerRef}
      className="w-full h-full bg-black/20 rounded-xl relative overflow-hidden"
      style={{ minHeight: '600px' }}
    >
      {/* Shared video component for consistent streams */}
        <SharedCamera
          cameraSource={featuredStreamId}
          enableDetection={true}
          isLarge={true}
          onDetection={(result) => {
            console.log('🎯 DOORS-DETECTION:', result);
            updateGuestCount(result.people_count);
          }}
        />      {/* Drawing Canvas Layer - positioned above video */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        style={{ 
          pointerEvents: drawMode ? 'auto' : 'none',
          cursor: drawMode === 'draw' ? 'crosshair' : drawMode === 'erase' ? 'pointer' : 'default',
          zIndex: 10,
          backgroundColor: 'transparent'
        }}
      />
    </div>
  );
});

VideoContainer.displayName = 'VideoContainer';

export default function DoorsPage() {
  const params = useParams();
  const [doorZones, setDoorZones] = useState<DoorZone[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [selectedDoorId, setSelectedDoorId] = useState<string>('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStartPoint, setDrawStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [drawMode, setDrawMode] = useState<'draw' | 'erase' | null>(null);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [doorName, setDoorName] = useState('');
  
  // Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Simple function to update guest count from detection
  const updateGuestCountFromDetection = async (detectedPeople: number) => {
    console.log('📊 DOORS: Direct guest count update to:', detectedPeople);
    // For now, just log the detection - no API calls
    // This will be handled by the detection context for live updates
  };

  // Database streams
  const [streams, setStreams] = useState<Array<{
    id: string;
    name: string;
    org_id: string;
    kind: string;
    url?: string;
    rtsp_url?: string;
    is_active: boolean;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get the featured stream (same logic as overview page)
  const defaultFeaturedStream = streams.find(s => s.url?.startsWith('webcam:') || s.kind === 'webcam') || streams[0];
  const featuredStreamId = defaultFeaturedStream?.url || defaultFeaturedStream?.rtsp_url || 'webcam:0';
  
  console.log('🚪 DOORS: Featured stream info:', {
    allStreams: streams,
    defaultFeaturedStream,
    featuredStreamId,
    streamsCount: streams.length
  });

  const handleDeleteDoor = async (doorId: string) => {
    const door = doors.find(d => d.id === doorId);
    const name = door?.name || 'this door';
    if (!confirm(`Delete ${name}? This will also remove its local zones.`)) return;
    try {
      const slug = Array.isArray(params.slug) ? (params.slug as string[])[0] : (params.slug as string);
      const resp = await fetch(`/api/org/${slug}/doors`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doorId })
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error('❌ Failed to delete door from server:', { status: resp.status, body: text });
        alert('Failed to delete door');
        return;
      }
    } catch (e) {
      console.error('❌ Error deleting door:', e);
      alert('Error deleting door');
      return;
    }

    // Update doors list
    setDoors(prev => {
      const updated = prev.filter(d => d.id !== doorId);
      localStorage.setItem('doors', JSON.stringify(updated));
      return updated;
    });

    // Remove zones tied to this door
    const allZones = JSON.parse(localStorage.getItem('doorZones') || '[]');
    const filteredZones = allZones.filter((z: any) => z.door_id !== doorId);
    localStorage.setItem('doorZones', JSON.stringify(filteredZones));
    window.dispatchEvent(new Event('doorZonesUpdated'));

    // Clear selection if the deleted door was selected
    if (selectedDoorId === doorId) {
      setSelectedDoorId('');
      setDoorZones([]);
    }
  };

  // Enable zone-based detection/occupancy updates for the featured camera
  const slugParam = Array.isArray(params.slug) ? params.slug[0] : (params.slug as string);
  useZoneDetection({
    orgSlug: slugParam,
    cameraSource: featuredStreamId,
    enabled: !!featuredStreamId,
    detectionCooldown: 2000,
  });

  // Load streams from database
  useEffect(() => {
    const loadStreams = async () => {
      try {
        // Step 1: Get the organization UUID from the slug
        const { data: orgData, error: orgError } = await supabase
          .from('orgs')
          .select('id')
          .eq('slug', params.slug)
          .single();
        
        if (orgError || !orgData) {
          console.error('Error getting organization:', orgError);
          setStreams([]);
          setIsLoading(false);
          return;
        }
        
        // Step 2: Query streams using the organization UUID
        const { data: streamsData, error: streamsError } = await supabase
          .from('streams')
          .select('*')
          .eq('org_id', orgData.id)
          .order('name');

        if (streamsError) {
          console.error('Error loading streams:', streamsError);
          setStreams([]);
        } else {
          console.log('Loaded streams:', streamsData);
          setStreams(streamsData || []);
        }
      } catch (error) {
        console.error('Unexpected error loading streams:', error);
        setStreams([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (params.slug) {
      loadStreams();
    }
  }, [params.slug, supabase]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamContainerRef = useRef<HTMLDivElement>(null);

  // Load door zones from localStorage
  useEffect(() => {
    const savedZones = localStorage.getItem('doorZones');
    if (savedZones) {
      const allZones = JSON.parse(savedZones);
      // If no door is selected, show all zones, otherwise show door-specific zones
      if (selectedDoorId) {
        const doorSpecificZones = allZones.filter((zone: DoorZone) => zone.door_id === selectedDoorId);
        setDoorZones(doorSpecificZones);
      } else {
        setDoorZones(allZones);
      }
    }
    
    // Load doors from localStorage
    const savedDoors = localStorage.getItem('doors');
    if (savedDoors) {
      const doorsData = JSON.parse(savedDoors);
      console.log('Loaded doors from localStorage:', doorsData);
      setDoors(doorsData);
    }
  }, [selectedDoorId]);

  // Load door-specific zones when door selection changes
  useEffect(() => {
    if (selectedDoorId) {
      const allZones = JSON.parse(localStorage.getItem('doorZones') || '[]');
      const doorSpecificZones = allZones.filter((zone: DoorZone) => zone.door_id === selectedDoorId);
      setDoorZones(doorSpecificZones);
    }
  }, [selectedDoorId]);

  // Save door zones to localStorage and backend API
  const saveDoorZones = async () => {
    if (!selectedDoorId) {
      alert('Please select a door first');
      return;
    }
    
    if (!featuredStreamId) {
      alert('No camera stream selected');
      return;
    }
    
    // Prepare door-specific zones
    const doorSpecificZones = doorZones.map(zone => ({
      ...zone,
      door_id: selectedDoorId,
      camera_id: featuredStreamId
    }));
    
    // Persist zones to Supabase for this org+stream
    try {
      const supabaseSaveResp = await fetch(`/api/org/${slugParam}/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: featuredStreamId, zones: doorSpecificZones })
      });
      if (!supabaseSaveResp.ok) {
        const text = await supabaseSaveResp.text();
        console.error('❌ Failed to persist zones to Supabase:', { status: supabaseSaveResp.status, body: text });
      } else {
        console.log('✅ Zones persisted to Supabase');
      }
    } catch (e) {
      console.error('❌ Error saving zones to Supabase:', e);
    }

    // Also send zones to the backend detection service
    try {
      console.log('🎯 Sending zones to backend:', doorSpecificZones);
      
      // Convert display-space zone coordinates to frame-space (video) coordinates
      const container = streamContainerRef.current;
      const videoEl = container?.querySelector(`video[data-camera-source="${featuredStreamId}"]`) as HTMLVideoElement | null;
      let frameW = videoEl?.videoWidth || 0;
      let frameH = videoEl?.videoHeight || 0;
      let contentW = 0;
      let contentH = 0;
      let offsetX = 0;
      let offsetY = 0;
      if (container && frameW && frameH) {
        const rect = container.getBoundingClientRect();
        const r = Math.min(rect.width / frameW, rect.height / frameH);
        contentW = frameW * r;
        contentH = frameH * r;
        offsetX = (rect.width - contentW) / 2;
        offsetY = (rect.height - contentH) / 2;
      }

      const toFrame = (x: number, y: number) => {
        if (!frameW || !frameH || !contentW || !contentH) return { x, y };
        const localX = x - offsetX;
        const localY = y - offsetY;
        const nx = Math.max(0, Math.min(1, localX / contentW));
        const ny = Math.max(0, Math.min(1, localY / contentH));
        return { x: nx * frameW, y: ny * frameH };
      };

      const zonesForBackend = doorSpecificZones.map(zone => {
        const p1 = toFrame(zone.x1, zone.y1);
        const p2 = toFrame(zone.x2, zone.y2);
        return {
          id: zone.id,
          name: zone.name,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
        };
      });

      // Also enrich and save zones locally with frame-space coordinates
      const frameMap = new Map(
        zonesForBackend.map(z => [z.id, { fx1: z.x1, fy1: z.y1, fx2: z.x2, fy2: z.y2 }])
      );
      const doorZonesWithFrame = doorSpecificZones.map(z => ({
        ...z,
        frame_x1: frameMap.get(z.id)?.fx1,
        frame_y1: frameMap.get(z.id)?.fy1,
        frame_x2: frameMap.get(z.id)?.fx2,
        frame_y2: frameMap.get(z.id)?.fy2,
      }));

      const existingZones = JSON.parse(localStorage.getItem('doorZones') || '[]');
      const otherDoorZones = existingZones.filter((zone: DoorZone) => zone.door_id !== selectedDoorId);
      const allZones = [...otherDoorZones, ...doorZonesWithFrame];
      localStorage.setItem('doorZones', JSON.stringify(allZones));
      window.dispatchEvent(new Event('doorZonesUpdated'));

      const response = await fetch('/api/detection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'zones_update',
          camera_id: featuredStreamId,
          zones: zonesForBackend
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Zones updated in backend:', result);
      
      const selectedDoor = doors.find(d => d.id === selectedDoorId);
      alert(`Door zones saved successfully for "${selectedDoor?.name}" and sent to detection service!`);
    } catch (error) {
      console.error('❌ Failed to update zones in backend:', error);
      const selectedDoor = doors.find(d => d.id === selectedDoorId);
      alert(`Door zones saved locally for "${selectedDoor?.name}" but failed to update detection service. Check console for details.`);
    }
  };

  // Load zones from backend detection service
  const loadZonesFromSupabase = async () => {
    try {
      const resp = await fetch(`/api/org/${slugParam}/zones?stream_id=${encodeURIComponent(featuredStreamId)}`);
      if (resp.ok) {
        const data = await resp.json();
        const zones = (data?.zones || []).map((z: any) => ({
          id: z.id || z.name,
          name: z.name || 'Zone',
          x1: z.x1,
          y1: z.y1,
          x2: z.x2,
          y2: z.y2,
          door_id: selectedDoorId,
          camera_id: featuredStreamId
        }));
        // Merge into localStorage under current door
        const existing = JSON.parse(localStorage.getItem('doorZones') || '[]');
        const others = existing.filter((zone: any) => zone.door_id !== selectedDoorId);
        const all = [...others, ...zones];
        localStorage.setItem('doorZones', JSON.stringify(all));
        window.dispatchEvent(new Event('doorZonesUpdated'));
        setDoorZones(zones);
        console.log('📥 Loaded zones from Supabase:', zones.length);
      } else {
        console.warn('⚠️ Failed to load zones from Supabase:', resp.status);
      }
    } catch (e) {
      console.error('❌ Error loading zones from Supabase:', e);
    }
  };

  const loadZonesFromBackend = async () => {
    if (!featuredStreamId) {
      console.log('No stream ID available for loading zones');
      return;
    }

    try {
      console.log('🔍 Loading zones from backend for camera:', featuredStreamId);
      
      const response = await fetch(`http://127.0.0.1:8001/zones/${featuredStreamId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const backendZones = await response.json();
        console.log('📥 Loaded zones from backend:', backendZones);
        
        // Convert backend zones to frontend format if they exist
        if (backendZones.zones && backendZones.zones.length > 0) {
          const convertedZones = backendZones.zones.map((zone: { id?: string; name?: string; x1: number; y1: number; x2: number; y2: number }, index: number) => ({
            id: zone.id || `zone_${index}`,
            name: zone.name || `Zone ${index + 1}`,
            x1: zone.x1,
            y1: zone.y1,
            x2: zone.x2,
            y2: zone.y2,
            door_id: selectedDoorId,
            camera_id: featuredStreamId
          }));
          
          setDoorZones(convertedZones);
          console.log('✅ Zones loaded from backend and applied to UI');
        }
      } else {
        console.log('No zones found in backend for this camera');
      }
    } catch (error) {
      console.error('❌ Failed to load zones from backend:', error);
    }
  };

  // On stream change, try loading saved zones from Supabase
  useEffect(() => {
    if (featuredStreamId) {
      loadZonesFromSupabase();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredStreamId, selectedDoorId]);

  // Add camera handler
  const handleAddCamera = async () => {
    if (!selectedCameraId || !doorName.trim()) {
      alert('Please select a camera and enter a door name');
      return;
    }

    const selectedCamera = streams.find(s => s.id === selectedCameraId);
    if (!selectedCamera) {
      alert('Selected camera not found');
      return;
    }

    console.log('Creating door with camera:', selectedCamera);

    // Convert camera ID to webcam format for WebcamStream
    let cameraSource = selectedCameraId;
    if (selectedCamera.kind === 'webcam' && !selectedCameraId.startsWith('webcam:')) {
      cameraSource = `webcam:${selectedCameraId}`;
    } else if (selectedCamera.url) {
      cameraSource = selectedCamera.url;
    }

    try {
      const slug = Array.isArray(params.slug) ? (params.slug as string[])[0] : (params.slug as string);
      const resp = await fetch(`/api/org/${slug}/doors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: doorName.trim(),
          camera_id: cameraSource,
          camera_name: selectedCamera.name,
          status: 'active'
        })
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error('❌ Failed to save door to server:', { status: resp.status, body: text });
        alert('Failed to save door');
        return;
      }
      const { door } = await resp.json();
      const updatedDoors = [...doors, door as Door];
      setDoors(updatedDoors);
      localStorage.setItem('doors', JSON.stringify(updatedDoors));
      setSelectedDoorId((door as Door).id);
      alert(`Door "${doorName}" added successfully!`);
    } catch (e) {
      console.error('❌ Error creating door:', e);
      alert('Error creating door');
      return;
    }

    // Reset modal
    setShowAddCameraModal(false);
    setSelectedCameraId('');
    setDoorName('');
  };

  // Drawing functions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawMode === 'erase') {
      // Find and remove zone at click position
      const zoneIndex = doorZones.findIndex(zone => {
        return x >= Math.min(zone.x1, zone.x2) && 
               x <= Math.max(zone.x1, zone.x2) &&
               y >= Math.min(zone.y1, zone.y2) && 
               y <= Math.max(zone.y1, zone.y2);
      });
      
      if (zoneIndex !== -1) {
        const newZones = doorZones.filter((_, index) => index !== zoneIndex);
        setDoorZones(newZones);
      }
      return;
    }

    if (drawMode === 'draw') {
      setDrawStartPoint({ x, y });
      setIsDrawing(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || drawMode !== 'draw' || !drawStartPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Clear canvas and redraw existing zones
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw existing zones
    doorZones.forEach((zone) => {
      ctx.strokeStyle = '#10b981';
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.lineWidth = 2;
      const width = zone.x2 - zone.x1;
      const height = zone.y2 - zone.y1;
      ctx.fillRect(zone.x1, zone.y1, width, height);
      ctx.strokeRect(zone.x1, zone.y1, width, height);
    });

    // Draw current rectangle
    ctx.strokeStyle = '#3b82f6';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = 2;
    const width = currentX - drawStartPoint.x;
    const height = currentY - drawStartPoint.y;
    ctx.fillRect(drawStartPoint.x, drawStartPoint.y, width, height);
    ctx.strokeRect(drawStartPoint.x, drawStartPoint.y, width, height);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || drawMode !== 'draw' || !drawStartPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    // Only create zone if rectangle is large enough
    const minSize = 20;
    if (Math.abs(endX - drawStartPoint.x) > minSize && Math.abs(endY - drawStartPoint.y) > minSize) {
      const newZone: DoorZone = {
        id: `zone-${Date.now()}`,
        name: `Door Zone ${doorZones.length + 1}`,
        x1: drawStartPoint.x,
        y1: drawStartPoint.y,
        x2: endX,
        y2: endY,
        camera_id: featuredStreamId,
        stream_id: featuredStreamId,
        org_id: params.slug as string,
      };

      setDoorZones([...doorZones, newZone]);
    }

    setIsDrawing(false);
    setDrawStartPoint(null);
  };

  // Redraw zones on canvas when zones change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doorZones.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw existing zones
    doorZones.forEach((zone) => {
      ctx.strokeStyle = '#10b981';
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.lineWidth = 2;
      const width = zone.x2 - zone.x1;
      const height = zone.y2 - zone.y1;
      ctx.fillRect(zone.x1, zone.y1, width, height);
      ctx.strokeRect(zone.x1, zone.y1, width, height);
      
      // Draw zone label
      ctx.fillStyle = '#10b981';
      ctx.font = '12px sans-serif';
      ctx.fillText(zone.name, zone.x1 + 5, zone.y1 + 15);
    });
  }, [doorZones]);

  // Update canvas size when container size changes
  useEffect(() => {
    const updateCanvasSize = () => {
      const container = streamContainerRef.current;
      const canvas = canvasRef.current;
      
      if (container && canvas) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        // Redraw zones after canvas resize
        const ctx = canvas.getContext('2d');
        if (ctx && doorZones.length > 0) {
          doorZones.forEach((zone) => {
            ctx.strokeStyle = '#10b981';
            ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
            ctx.lineWidth = 2;
            const width = zone.x2 - zone.x1;
            const height = zone.y2 - zone.y1;
            ctx.fillRect(zone.x1, zone.y1, width, height);
            ctx.strokeRect(zone.x1, zone.y1, width, height);
          });
        }
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [featuredStreamId, doorZones]);

  if (isLoading) {
    return (
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60">Loading cameras...</p>
        </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-400" />
              Door Security
            </h1>
            <p className="text-white/60">Manage door zones and security cameras</p>
          </div>
          <button
            onClick={() => setShowAddCameraModal(true)}
            className="px-6 py-3 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 transition-all font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Door
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Sidebar - Doors List */}
        <div className="col-span-3">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Doors
            </h3>
            
            <div className="space-y-3">
              {doors.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className="w-12 h-12 mx-auto mb-3 text-white/30" />
                  <p className="text-white/60 text-sm">No doors added</p>
                  <p className="text-white/40 text-xs mt-1">Click &quot;Add Door&quot; to get started</p>
                </div>
              ) : (
                doors.map((door) => (
                  <div key={door.id} className="relative group">
                    {/* Delete (X) icon on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteDoor(door.id); }}
                      title="Delete door"
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    {/* Door item */}
                    <button
                      onClick={() => {
                        console.log('Door clicked:', door.name, 'Camera ID:', door.camera_id);
                        setSelectedDoorId(door.id);
                      }}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedDoorId === door.id
                          ? 'bg-blue-500/20 border-blue-500/30 text-blue-200'
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          door.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                        }`}></div>
                        <div className="flex-1 pr-6">
                          <div className="font-medium">{door.name}</div>
                          <div className="text-xs text-white/40">{door.camera_name}</div>
                          <div className="text-xs text-white/30 mt-1">
                            {new Date(door.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                ))
              )}
            </div>
            
            {/* Quick Stats */}
            {doors.length > 0 && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="text-xs text-white/40 mb-2">Statistics</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <div className="text-white font-medium">{doors.length}</div>
                    <div className="text-white/60">Total Doors</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <div className="text-white font-medium">{doors.filter(d => d.status === 'active').length}</div>
                    <div className="text-white/60">Active</div>
                  </div>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Main Content - Stream View */}
        <div className="col-span-9">
          <div className="space-y-6">
            <GlassCard className="relative">
              <div className="relative" style={{ minHeight: '600px' }}>
                {featuredStreamId ? (
                  <VideoContainer 
                    featuredStreamId={featuredStreamId}
                    drawMode={drawMode}
                    canvasRef={canvasRef}
                    streamContainerRef={streamContainerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    updateGuestCount={updateGuestCountFromDetection}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-black/10 rounded-xl">
                    <div className="text-center">
                      <Shield className="w-16 h-16 mx-auto mb-4 text-white/30" />
                      <p className="text-white/60 text-lg">Select a door to view</p>
                      <p className="text-white/40 text-sm">Choose a door from the sidebar or add a new door to get started</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Bottom Controls */}
              <div className="mt-3 flex gap-4 justify-center">
                {selectedDoorId && (() => {
                  const selectedDoor = doors.find(d => d.id === selectedDoorId);
                  return (
                    <div className="text-center mb-3">
                      <p className="text-white/60 text-sm">
                        Drawing zones for: <span className="text-blue-300 font-medium">{selectedDoor?.name}</span>
                      </p>
                    </div>
                  );
                })()}
                
                <button
                  onClick={() => {
                    setDrawMode(drawMode === 'draw' ? null : 'draw');
                  }}
                  disabled={!featuredStreamId}
                  className={`px-8 py-3 border rounded-xl font-medium text-sm transition-all ${
                    drawMode === 'draw'
                      ? 'bg-blue-500/20 border-blue-500/30 text-blue-200'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  DRAW
                </button>
                
                <button
                  onClick={() => {
                    setDrawMode(drawMode === 'erase' ? null : 'erase');
                    setIsDrawing(false);
                  }}
                  disabled={!featuredStreamId || doorZones.length === 0}
                  className={`px-8 py-3 border rounded-xl font-medium text-sm transition-all ${
                    drawMode === 'erase'
                      ? 'bg-red-500/20 border-red-500/30 text-red-200'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  ERASE
                </button>
                
                <button
                  onClick={loadZonesFromBackend}
                  disabled={!featuredStreamId || !selectedDoorId}
                  className="px-8 py-3 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-all"
                >
                  LOAD FROM BACKEND
                </button>
                
                <button
                  onClick={saveDoorZones}
                  disabled={doorZones.length === 0 || !selectedDoorId}
                  className="px-8 py-3 bg-green-500/20 border border-green-500/30 text-green-200 rounded-xl hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-all"
                >
                  SAVE ZONES
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
      
      {/* Add Camera Modal */}
      {showAddCameraModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Add Door Camera
              </h3>
              <button
                onClick={() => {
                  setShowAddCameraModal(false);
                  setSelectedCameraId('');
                  setDoorName('');
                }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              {streams.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-16 h-16 mx-auto mb-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2z" />
                  </svg>
                  <p className="text-white/60 text-lg mb-4">No cameras available</p>
                  <p className="text-white/40 text-sm mb-6">This organization doesn&apos;t have any cameras set up yet.</p>
                  <button
                    onClick={async () => {
                      // Create default webcam streams
                      const { data: orgData } = await supabase
                        .from('orgs')
                        .select('id')
                        .eq('slug', params.slug)
                        .single();
                        
                      if (orgData) {
                        const defaultStreams = [
                          { name: 'Webcam 1', kind: 'webcam', url: 'webcam:0' },
                          { name: 'Webcam 2', kind: 'webcam', url: 'webcam:1' },
                          { name: 'Webcam 3', kind: 'webcam', url: 'webcam:2' }
                        ];
                        
                        for (const stream of defaultStreams) {
                          await supabase
                            .from('streams')
                            .insert({
                              org_id: orgData.id,
                              name: stream.name,
                              kind: stream.kind,
                              url: stream.url,
                            });
                        }
                        
                        // Reload streams
                        const { data: newStreams } = await supabase
                          .from('streams')
                          .select('*')
                          .eq('org_id', orgData.id)
                          .order('name');
                          
                        setStreams(newStreams || []);
                      }
                    }}
                    className="px-6 py-3 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 transition-all font-medium"
                  >
                    Setup Default Cameras
                  </button>
                </div>
              ) : (
                <>
                  {/* Camera Selection */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Select Camera
                    </label>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                    >
                      <option value="" className="bg-slate-800 text-white">Choose a camera...</option>
                      {streams.map((stream) => (
                        <option key={stream.id} value={stream.id} className="bg-slate-800 text-white">
                          {stream.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Door Name */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Door Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Main Entrance, Side Door..."
                      value={doorName}
                      onChange={(e) => setDoorName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                    />
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => {
                        setShowAddCameraModal(false);
                        setSelectedCameraId('');
                        setDoorName('');
                      }}
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white/60 rounded-xl hover:bg-white/10 transition-all font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddCamera}
                      disabled={!selectedCameraId || !doorName.trim()}
                      className="flex-1 px-4 py-3 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                    >
                      Add Door
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
