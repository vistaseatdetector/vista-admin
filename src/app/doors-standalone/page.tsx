'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface DoorZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Simple Webcam Component without external dependencies
function SimpleWebcam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsActive(true);
        setError(null);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Failed to access camera');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsActive(false);
    }
  };

  if (error) {
    return (
      <div className="w-full h-96 bg-red-100 border border-red-400 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              startCamera();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="w-full h-96 bg-gray-100 border border-gray-300 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Camera Ready</h3>
          <button
            onClick={startCamera}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start Camera
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-96 bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <button
        onClick={stopCamera}
        className="absolute bottom-4 right-4 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700"
      >
        Stop Camera
      </button>
    </div>
  );
}

export default function DoorsStandalonePage() {
  const [isDrawing, setIsDrawing] = useState(false);
  const [doorZones, setDoorZones] = useState<DoorZone[]>([]);
  const [currentZone, setCurrentZone] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [newZoneName, setNewZoneName] = useState('');
  const isStreamLoaded = true;
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('Doors page loaded - completely standalone, no auth required');
    
    const savedZones = localStorage.getItem('doorZones');
    if (savedZones) {
      try {
        setDoorZones(JSON.parse(savedZones));
      } catch (error) {
        console.error('Error parsing saved zones:', error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('doorZones', JSON.stringify(doorZones));
  }, [doorZones]);

  useEffect(() => {
    if (isStreamLoaded && canvasRef.current && streamContainerRef.current) {
      const canvas = canvasRef.current;
      const container = streamContainerRef.current;
      
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      
      setTimeout(() => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        doorZones.forEach((zone) => {
          ctx.strokeStyle = '#3b82f6';
          ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
          ctx.lineWidth = 2;
          
          ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
          ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
          
          ctx.fillStyle = '#1f2937';
          ctx.font = '14px Inter, sans-serif';
          ctx.fillText(zone.name, zone.x + 5, zone.y + 20);
        });

        if (currentZone) {
          ctx.strokeStyle = '#ef4444';
          ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
          ctx.lineWidth = 2;
          
          const x = Math.min(currentZone.startX, currentZone.endX);
          const y = Math.min(currentZone.startY, currentZone.endY);
          const width = Math.abs(currentZone.endX - currentZone.startX);
          const height = Math.abs(currentZone.endY - currentZone.startY);
          
          ctx.fillRect(x, y, width, height);
          ctx.strokeRect(x, y, width, height);
        }
      }, 100);
    }
  }, [isStreamLoaded, doorZones, currentZone]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentZone({
      startX: x,
      startY: y,
      endX: x,
      endY: y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentZone) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentZone({
      ...currentZone,
      endX: x,
      endY: y,
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    doorZones.forEach((zone) => {
      ctx.strokeStyle = '#3b82f6';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.lineWidth = 2;
      
      ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
      ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
      
      ctx.fillStyle = '#1f2937';
      ctx.font = '14px Inter, sans-serif';
      ctx.fillText(zone.name, zone.x + 5, zone.y + 20);
    });

    const updatedZone = { ...currentZone, endX: x, endY: y };
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 2;
    
    const zoneX = Math.min(updatedZone.startX, updatedZone.endX);
    const zoneY = Math.min(updatedZone.startY, updatedZone.endY);
    const zoneWidth = Math.abs(updatedZone.endX - updatedZone.startX);
    const zoneHeight = Math.abs(updatedZone.endY - updatedZone.startY);
    
    ctx.fillRect(zoneX, zoneY, zoneWidth, zoneHeight);
    ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentZone) return;

    if (newZoneName.trim()) {
      const x = Math.min(currentZone.startX, currentZone.endX);
      const y = Math.min(currentZone.startY, currentZone.endY);
      const width = Math.abs(currentZone.endX - currentZone.startX);
      const height = Math.abs(currentZone.endY - currentZone.startY);

      if (width > 10 && height > 10) {
        const newZone: DoorZone = {
          id: Date.now().toString(),
          name: newZoneName.trim(),
          x,
          y,
          width,
          height,
        };

        setDoorZones([...doorZones, newZone]);
        setNewZoneName('');
      }
    }

    setCurrentZone(null);
    setIsDrawing(false);
  };

  const deleteDoorZone = (id: string) => {
    setDoorZones(doorZones.filter(zone => zone.id !== id));
  };

  const startDrawing = () => {
    if (newZoneName.trim()) {
      setIsDrawing(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Door Management (Standalone)</h1>
          <p className="mt-2 text-gray-600">Monitor entrances and manage door zones - No authentication required</p>
          <div className="mt-2 px-3 py-1 bg-green-100 border border-green-400 text-green-700 rounded text-sm inline-block">
            ✅ Authentication-free version
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Door Zones</h2>
              
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  placeholder="Zone name..."
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={startDrawing}
                  disabled={!newZoneName.trim() || isDrawing}
                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {isDrawing ? 'Drawing...' : 'Draw Zone'}
                </button>
              </div>

              <div className="space-y-2">
                {doorZones.map((zone) => (
                  <div
                    key={zone.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
                  >
                    <span className="text-sm font-medium text-gray-700">{zone.name}</span>
                    <button
                      onClick={() => deleteDoorZone(zone.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Webcam Stream
                  </h2>
                  {isDrawing && (
                    <div className="text-sm text-blue-600 font-medium">
                      Click and drag to draw &quot;{newZoneName}&quot;
                    </div>
                  )}
                </div>

                <div className="relative" ref={streamContainerRef}>
                  <SimpleWebcam />
                  
                  {isStreamLoaded && (
                    <canvas
                      ref={canvasRef}
                      className="absolute top-0 left-0 w-full h-full cursor-crosshair"
                      style={{ pointerEvents: isDrawing ? 'auto' : 'none' }}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                    />
                  )}
                </div>

                <div className="mt-4 text-sm text-gray-600">
                  <p>1. Enter a zone name in the sidebar</p>
                  <p>2. Click &quot;Draw Zone&quot; to start drawing</p>
                  <p>3. Click and drag on the stream to create a door zone</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}