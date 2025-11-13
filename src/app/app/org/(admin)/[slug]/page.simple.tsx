"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";
import WebcamStreamWithDetection from "@/components/WebcamStreamWithDetection";
import { useDetectionContext } from "@/contexts/DetectionContext";

export default function OrgDashboard() {
  const params = useParams();
  const detectionContext = useDetectionContext();
  
  // State
  const [org, setOrg] = useState<any>(null);
  const [liveDetectionCount, setLiveDetectionCount] = useState<number | null>(null);

  // Listen to detection results for live updates
  useEffect(() => {
    if (!detectionContext) return;

    console.log('📊 OVERVIEW: Setting up detection subscription for webcam:0');

    // Subscribe to detections from the webcam
    const unsubscribe = detectionContext.subscribeToDetections('webcam:0', (state) => {
      console.log('📊 OVERVIEW: Received detection update:', state);
      if (state.result) {
        console.log('📊 OVERVIEW: Setting live count to:', state.result.people_count);
        setLiveDetectionCount(state.result.people_count);
      } else {
        console.log('📊 OVERVIEW: No result in state, keeping current count');
      }
    });

    return unsubscribe;
  }, [detectionContext]);

  // Load org data
  useEffect(() => {
    const orgSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
    
    const mockOrg = {
      id: 'test-org-id',
      name: orgSlug === 'test-org' ? 'Test Organization' : `Organization ${orgSlug}`,
      slug: orgSlug
    };
    
    setOrg(mockOrg);
    console.log('📊 OVERVIEW: Created mock org:', mockOrg);
  }, [params.slug]);

  if (!org) {
    return (
      <div className="text-center py-12">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{org.name}</h1>
          <p className="text-white/60">Organization Dashboard</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-8 md:grid-cols-2">
        <GlassCard>
          <div className="text-sm text-white/70">Current Guests</div>
          <div className="mt-1 text-5xl font-extrabold tracking-tight">
            {liveDetectionCount !== null ? liveDetectionCount : "—"}
          </div>
          <div className="mt-2 text-xs text-white/60">
            {liveDetectionCount !== null ? "Live Detection" : "No Detection"}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-sm text-white/70">Detection Status</div>
          <div className="mt-1 text-lg font-bold tracking-tight">
            {detectionContext ? "Connected" : "Disconnected"}
          </div>
          <div className="mt-2 text-xs text-white/60">
            Detection Service
          </div>
        </GlassCard>
      </div>

      {/* Camera Stream */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Live Camera Feed</h2>
        </div>

        <div className="w-full">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h4 className="text-2xl font-bold text-white mb-3">Main Camera</h4>
                <div className="flex items-center gap-4 text-sm">
                  <span className="px-3 py-1.5 bg-green-500/20 text-green-300 border border-green-500/30 rounded-full text-xs font-medium">
                    LIVE
                  </span>
                  <span className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-xs font-medium uppercase">
                    WEBCAM
                  </span>
                </div>
              </div>
            </div>
            
            {/* Main Video Display with YOLOv11 Detection */}
            <div className="relative mb-6">
              <div className="aspect-video rounded-xl overflow-hidden bg-black/30 border border-white/10">
                <WebcamStreamWithDetection 
                  isLarge={true}
                  cameraSource="webcam:0"
                  enableDetection={true}
                  detectionFrameRate={2}
                  autoStart={true}
                  onError={(error: Error) => {
                    console.error('Main webcam error:', error);
                  }}
                  onStatusChange={(isActive: boolean) => {
                    console.log('Main webcam status:', isActive);
                  }}
                  onDetection={(result) => {
                    console.log('Detection result:', result);
                  }}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm text-white/60">
                <span>Main View</span>
                <span>•</span>
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}