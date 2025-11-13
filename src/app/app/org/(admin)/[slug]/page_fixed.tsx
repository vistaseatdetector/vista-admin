"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/layout/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import WebcamStream from "@/components/WebcamStream";
import OccChart from "@/components/OccChart";
import MassChart from "@/components/MassChart";

type Stream = { id: string; name: string; url: string | null; kind: string };

export default function OrgDashboard() {
  const supabase = createClient();
  const params = useParams();
  
  // State
  const [org, setOrg] = useState<any>(null);
  const [err, setErr] = useState("");
  const [streams, setStreams] = useState<Stream[]>([]);
  const [vistaStreams, setVistaStreams] = useState<any[]>([]);
  const [featuredStreamId, setFeaturedStreamId] = useState<string | null>(null);
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{show: boolean; stream: any} | null>(null);
  const [occ, setOcc] = useState<any>(null);
  const [occHistory, setOccHistory] = useState<any[]>([]);
  const [massSeries, setMassSeries] = useState<any[]>([]);
  const [massTotal, setMassTotal] = useState(0);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocId, setSelectedLocId] = useState<string>("");
  const [events, setEvents] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load org data
  useEffect(() => {
    (async () => {
      const { data: orgRow, error: orgErr } = await supabase
        .from("orgs")
        .select("*")
        .eq("slug", params.slug)
        .single();

      if (orgErr || !orgRow) {
        setErr("Organization not found");
        return;
      }
      setOrg(orgRow);

      // Check admin status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roleData } = await supabase
          .from("user_org_roles")
          .select("role")
          .eq("org_id", orgRow.id)
          .eq("user_id", user.id)
          .single();
        
        setIsAdmin(roleData?.role === "admin" || roleData?.role === "owner");
      }

      // Load streams
      const { data: streamData } = await supabase
        .from("streams")
        .select("id, name, url, kind")
        .eq("org_id", orgRow.id)
        .order("name");
      setStreams(streamData || []);

      // Load Vista streams
      try {
        const { data: vistaData } = await supabase
          .from("vista.streams")
          .select("*")
          .eq("org_id", orgRow.id);
        setVistaStreams(vistaData || []);
      } catch (error: unknown) {
        console.log("Vista integration not available");
      }

      // Load locations
      const { data: locData } = await supabase
        .from("locations")
        .select("*")
        .eq("org_id", orgRow.id)
        .order("name");
      setLocations(locData || []);
      if (locData && locData.length > 0) {
        setSelectedLocId(locData[0].id);
      }

      // Load events
      const { data: evts } = await supabase
        .from("events_security")
        .select("id, type, severity, occurred_at, details")
        .eq("org_id", orgRow.id)
        .order("occurred_at", { ascending: false })
        .limit(10);
      setEvents(evts || []);
    })();
  }, [params.slug]);

  // Load occupancy data
  useEffect(() => {
    const fetchOccupancy = async () => {
      if (!org || !selectedLocId) {
        setOcc(null);
        return;
      }
      
      try {
        const url = `/api/org/${org.slug}/occupancy?location_id=${selectedLocId}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (data.latest) {
          setOcc(data.latest);
        }
        setOccHistory(data.history || []);
      } catch (error: unknown) {
        console.error("Occupancy fetch error:", error);
      }
    };

    fetchOccupancy();
    const interval = setInterval(fetchOccupancy, 30000);
    return () => clearInterval(interval);
  }, [org, selectedLocId]);

  if (err) {
    return (
      <AppShell>
        <div className="text-center py-12">
          <div className="text-red-400">{err}</div>
        </div>
      </AppShell>
    );
  }

  if (!org) {
    return (
      <AppShell>
        <div className="text-center py-12">
          <div className="text-white/60">Loading...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
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
              {occ?.people_count ?? "—"}
            </div>
            <div className="mt-2 text-xs text-white/60">Database Count</div>
          </GlassCard>

          <GlassCard>
            <div className="text-sm text-white/70">Attendance Total (Selected Day)</div>
            <div className="mt-1 text-5xl font-extrabold tracking-tight">
              {massTotal || "—"}
            </div>
            <div className="mt-4 text-sm text-white/80">Sum of peaks across Masses.</div>
          </GlassCard>
        </div>

        {/* Camera Streams */}
        <GlassCard>
          {isAdmin && (
            <div className="mb-4">
              <button
                onClick={() => setShowAddCamera(true)}
                className="border rounded-xl px-4 py-2 bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/30 transition-colors"
              >
                + Add Camera
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Live Camera Feeds</h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/60">
                {vistaStreams.length + streams.length} total camera{vistaStreams.length + streams.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* All Camera Streams - Main View + Grid */}
          {(vistaStreams.length > 0 || streams.length > 0) ? (
            <div className="space-y-6">
              {(() => {
                // Combine all streams
                const allStreams = [...vistaStreams, ...streams];
                
                // Determine which stream to feature (prioritize webcams, then first available)
                const defaultFeaturedId = featuredStreamId || 
                  allStreams.find(s => s.url?.startsWith('webcam:') || s.kind === 'webcam')?.id || 
                  allStreams[0]?.id;
                const featuredStream = allStreams.find(s => s.id === defaultFeaturedId);
                const otherStreams = allStreams.filter(s => s.id !== defaultFeaturedId);
                
                return (
                  <div className="space-y-6">
                    {/* Large Main Camera Window */}
                    {featuredStream && (
                      <div className="w-full">
                        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 hover:bg-white/10 transition-colors">
                          <div className="flex items-start justify-between mb-6">
                            <div>
                              <h4 className="text-2xl font-bold text-white mb-3">{featuredStream.name}</h4>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="px-3 py-1.5 bg-green-500/20 text-green-300 border border-green-500/30 rounded-full text-xs font-medium">
                                  LIVE
                                </span>
                                <span className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-xs font-medium uppercase">
                                  {featuredStream.kind || 'Camera'}
                                </span>
                                <span className="text-white/60">Featured Camera</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Main Video Display */}
                          <div className="relative mb-6">
                            {featuredStream.url?.startsWith('webcam:') || featuredStream.kind === 'webcam' ? (
                              <div className="aspect-video rounded-xl overflow-hidden bg-black/30 border border-white/10">
                                <WebcamStream 
                                  isLarge={true}
                                  cameraSource={featuredStream.url || "webcam:0"}
                                  onError={(error: Error) => {
                                    console.error('Main webcam error:', error);
                                  }}
                                  onStatusChange={(isActive: boolean) => {
                                    console.log('Main webcam status:', isActive);
                                  }}
                                />
                              </div>
                            ) : featuredStream.url && (featuredStream.url.startsWith("rtsp://") || featuredStream.url.startsWith("http")) ? (
                              <div className="aspect-video rounded-xl overflow-hidden bg-black/30 border border-white/10">
                                <WebcamStream 
                                  isLarge={true}
                                  cameraSource={featuredStream.url}
                                  onError={(error: Error) => {
                                    console.error('Main stream error:', error);
                                  }}
                                  onStatusChange={(isActive: boolean) => {
                                    console.log('Main stream status:', isActive);
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="aspect-video bg-black/50 rounded-xl flex items-center justify-center border border-white/10">
                                <div className="text-center">
                                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                                    <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                  <p className="text-white/60 text-lg font-medium">Main Camera Feed</p>
                                  <p className="text-white/40 text-sm mt-2">{featuredStream.url || 'No URL configured'}</p>
                                </div>
                              </div>
                            )}
                            
                            {/* Overlay controls */}
                            <div className="absolute top-4 right-4 flex gap-2">
                              <button className="p-2 bg-black/50 hover:bg-black/70 border border-white/20 text-white rounded-lg text-sm transition-colors backdrop-blur-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-sm text-white/60">
                              <span>🎯 Main View</span>
                              <span>•</span>
                              <span>{new Date().toLocaleTimeString()}</span>
                            </div>
                            <div className="flex gap-2">
                              <button className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-lg text-sm transition-colors">
                                📸 Snapshot
                              </button>
                              <button className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200 rounded-lg text-sm transition-colors">
                                🔍 Full Screen
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Grid of Other Cameras */}
                    {otherStreams.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-medium text-white/90">All Camera Feeds</h3>
                          <span className="text-sm text-white/60">
                            {otherStreams.length} additional camera{otherStreams.length !== 1 ? 's' : ''} • Click to feature
                          </span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {otherStreams.map((stream) => (
                            <div
                              key={stream.id}
                              className="group relative rounded-xl border border-white/15 bg-white/5 p-4 cursor-pointer hover:bg-white/10 hover:border-white/25 transition-all duration-200 hover:scale-[1.02]"
                              onClick={() => {
                                console.log('Switching featured stream to:', stream.name);
                                setFeaturedStreamId(stream.id);
                              }}
                            >
                              {/* Delete button for regular streams */}
                              {streams.some(s => s.id === stream.id) && isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirm({show: true, stream});
                                  }}
                                  className="absolute top-2 right-2 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white text-lg leading-none z-10"
                                  title="Delete stream"
                                >
                                  ×
                                </button>
                              )}
                              
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h5 className="font-medium text-white mb-1 line-clamp-1">{stream.name}</h5>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">
                                      Live
                                    </span>
                                    <span className="text-white/60">{stream.kind}</span>
                                  </div>
                                </div>
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/20 rounded text-white/60 hover:text-white"
                                  title="Feature this camera"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                  </svg>
                                </button>
                              </div>
                              
                              {/* Mini video preview */}
                              <div className="aspect-video rounded-lg overflow-hidden mb-3 bg-black/30 border border-white/10">
                                {stream.url?.startsWith('webcam:') || stream.kind === 'webcam' ? (
                                  <WebcamStream 
                                    isLarge={false}
                                    cameraSource={stream.url || "webcam:0"}
                                    onError={(error: Error) => {
                                      console.error('Mini webcam error for stream:', stream.name, error);
                                    }}
                                    onStatusChange={(isActive: boolean) => {
                                      console.log('Mini webcam status for', stream.name, ':', isActive);
                                    }}
                                  />
                                ) : stream.url && (stream.url.startsWith("rtsp://") || stream.url.startsWith("http")) ? (
                                  <WebcamStream 
                                    isLarge={false}
                                    cameraSource={stream.url}
                                    onError={(error: Error) => {
                                      console.error('Mini stream error for:', stream.name, error);
                                    }}
                                    onStatusChange={(isActive: boolean) => {
                                      console.log('Mini stream status for', stream.name, ':', isActive);
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <div className="text-center">
                                      <div className="w-8 h-8 mx-auto mb-1 rounded-full bg-white/10 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
                                        </svg>
                                      </div>
                                      <p className="text-white/40 text-xs">Click to feature</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white/80 mb-2">No Camera Streams</h3>
              <p className="text-white/60 mb-4">Get started by adding your first camera stream.</p>
              {isAdmin && (
                <button
                  onClick={() => setShowAddCamera(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Your First Camera
                </button>
              )}
            </div>
          )}
        </GlassCard>

        {/* Locations + occupancy + charts */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* left: locations */}
          <GlassCard className="lg:col-span-1">
            <h2 className="text-lg font-semibold mb-3">Locations</h2>
            {locations.length === 0 ? (
              <div className="text-white/70">No locations yet.</div>
            ) : (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  {locations.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLocId(l.id)}
                      className={`px-3 py-1.5 rounded-xl border border-white/20 ${
                        selectedLocId === l.id
                          ? "bg-white/20 text-white"
                          : "bg-white/10 hover:bg-white/15"
                      }`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3">
                  {locations.map((loc) => (
                    <div
                      key={loc.id}
                      className="rounded-xl border border-white/15 bg-white/5 p-3"
                    >
                      <div className="font-medium">{loc.name}</div>
                      <div className="text-xs text-white/70">
                        {loc.seating_capacity ?? "—"} seats
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </GlassCard>

          {/* right: live + charts */}
          <div className="space-y-8 lg:col-span-2">
            <GlassCard>
              <div className="font-medium mb-1">
                Live occupancy{" "}
                {selectedLocId
                  ? `— ${locations.find((x) => x.id === selectedLocId)?.name ?? ""}`
                  : ""}
              </div>
              {occ ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                    <div className="text-white/70 text-xs">People</div>
                    <div className="text-2xl font-semibold">
                      {occ.people_count}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                    <div className="text-white/70 text-xs">Open seats</div>
                    <div className="text-2xl font-semibold">
                      {occ.open_seats ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                    <div className="text-white/70 text-xs">Updated</div>
                    <div className="text-sm">
                      {new Date(occ.observed_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-white/70">Waiting for first data…</div>
              )}
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-medium text-white/80 mb-3">
                24h Attendance (Selected Location)
              </h3>
              {selectedLocId && <OccChart data={occHistory} />}
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-medium text-white/80 mb-3">
                Attendance by Mass
              </h3>
              {massSeries.length > 0 ? (
                <MassChart data={massSeries} total={massTotal} />
              ) : (
                <div className="text-white/70">
                  No Masses configured for this day.
                </div>
              )}
            </GlassCard>
          </div>
        </div>

        {/* events */}
        <GlassCard>
          <h2 className="text-lg font-semibold mb-3">Recent security events</h2>
          {events.length === 0 ? (
            <div className="text-white/70">No events yet.</div>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="rounded-2xl border border-white/15 bg-white/5 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.type}</span>
                    {(() => {
                      const base = "text-xs px-2 py-0.5 rounded-full border";
                      const cls =
                        e.severity === "high"
                          ? base +
                            " border-rose-400/60 text-rose-200 bg-rose-400/10"
                          : e.severity === "warn" || e.severity === "warning"
                          ? base +
                            " border-amber-400/60 text-amber-200 bg-amber-400/10"
                          : base +
                            " border-white/20 text-white/80 bg-white/10";
                      return <span className={cls}>{e.severity}</span>;
                    })()}
                  </div>
                  <div className="text-xs text-white/60">
                    {new Date(e.occurred_at).toLocaleString()}
                  </div>
                  {e.details && (
                    <pre className="text-xs text-white/60 mt-1">
                      {JSON.stringify(e.details, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Add Camera Modal */}
      {showAddCamera && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Camera</h3>
            
            <style jsx>{`
              .camera-type-btn {
                transition: all 0.2s ease;
              }
              
              .camera-type-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              }
              
              .camera-type-btn.active {
                background: rgba(59, 130, 246, 0.2) !important;
                border-color: rgba(59, 130, 246, 0.5) !important;
                color: white !important;
                box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.3);
              }
              
              .camera-type-btn.active svg {
                color: rgb(96, 165, 250);
              }
              
              .camera-type-btn:not(.active):hover {
                background: rgba(255, 255, 255, 0.1) !important;
                border-color: rgba(255, 255, 255, 0.3) !important;
              }
            `}</style>
            
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!org) return;
                const fd = new FormData(e.currentTarget as HTMLFormElement);
                const name = String(fd.get("name") || "");
                const url = String(fd.get("url") || "");
                const streamType = String(fd.get("streamType") || "webcam");
                
                if (!name) return alert("Name is required");
                
                let finalUrl = url;
                let kind = "camera";
                
                // Handle different stream types
                if (streamType === "webcam") {
                  const cameraId = String(fd.get("cameraId") || "0");
                  finalUrl = `webcam:${cameraId}`;
                  kind = "webcam";
                } else if (streamType === "rtsp") {
                  if (!url.startsWith("rtsp://")) {
                    return alert("RTSP URL must start with rtsp://");
                  }
                  kind = "rtsp";
                } else if (streamType === "http") {
                  if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    return alert("HTTP stream URL must start with http:// or https://");
                  }
                  kind = "http";
                }
                
                const { error } = await supabase.from("streams").insert({
                  org_id: org.id,
                  name,
                  kind,
                  url: finalUrl,
                });
                if (error) return alert(error.message);
                const { data } = await supabase
                  .from("streams")
                  .select("id, name, url, kind")
                  .eq("org_id", org.id)
                  .order("name");
                setStreams(data ?? []);
                setShowAddCamera(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-white/80 mb-2">Camera Name</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-white/10 border-white/20 text-white placeholder-white/60"
                  name="name"
                  placeholder="e.g., Front Door Camera"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm text-white/80 mb-3">Camera Type</label>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      const form = document.querySelector('form');
                      if (!form) return;
                      
                      // Update hidden input
                      const hiddenInput = form.querySelector('[name="streamType"]') as HTMLInputElement;
                      if (hiddenInput) hiddenInput.value = 'webcam';
                      
                      // Update UI
                      const urlField = form.querySelector('.url-field') as HTMLDivElement;
                      const cameraField = form.querySelector('.camera-field') as HTMLDivElement;
                      if (urlField) urlField.style.display = 'none';
                      if (cameraField) cameraField.style.display = 'block';
                      
                      // Update button states
                      document.querySelectorAll('.camera-type-btn').forEach(btn => {
                        btn.classList.remove('active');
                      });
                      document.querySelector('[data-type="webcam"]')?.classList.add('active');
                    }}
                    className="camera-type-btn active flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 bg-blue-500/20 border-blue-500/50 text-white"
                    data-type="webcam"
                  >
                    <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium">USB Webcam</span>
                    <span className="text-xs text-white/60">Built-in or USB</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const form = document.querySelector('form');
                      if (!form) return;
                      
                      // Update hidden input
                      const hiddenInput = form.querySelector('[name="streamType"]') as HTMLInputElement;
                      if (hiddenInput) hiddenInput.value = 'rtsp';
                      
                      // Update UI
                      const urlField = form.querySelector('.url-field') as HTMLDivElement;
                      const cameraField = form.querySelector('.camera-field') as HTMLDivElement;
                      if (urlField) urlField.style.display = 'block';
                      if (cameraField) cameraField.style.display = 'none';
                      
                      // Update button states
                      document.querySelectorAll('.camera-type-btn').forEach(btn => {
                        btn.classList.remove('active');
                      });
                      document.querySelector('[data-type="rtsp"]')?.classList.add('active');
                    }}
                    className="camera-type-btn flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 bg-white/5 border-white/20 text-white/80 hover:bg-white/10 hover:border-white/30"
                    data-type="rtsp"
                  >
                    <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    <span className="text-sm font-medium">RTSP Camera</span>
                    <span className="text-xs text-white/60">Network camera</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const form = document.querySelector('form');
                      if (!form) return;
                      
                      // Update hidden input
                      const hiddenInput = form.querySelector('[name="streamType"]') as HTMLInputElement;
                      if (hiddenInput) hiddenInput.value = 'http';
                      
                      // Update UI
                      const urlField = form.querySelector('.url-field') as HTMLDivElement;
                      const cameraField = form.querySelector('.camera-field') as HTMLDivElement;
                      if (urlField) urlField.style.display = 'block';
                      if (cameraField) cameraField.style.display = 'none';
                      
                      // Update button states
                      document.querySelectorAll('.camera-type-btn').forEach(btn => {
                        btn.classList.remove('active');
                      });
                      document.querySelector('[data-type="http"]')?.classList.add('active');
                    }}
                    className="camera-type-btn flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 bg-white/5 border-white/20 text-white/80 hover:bg-white/10 hover:border-white/30"
                    data-type="http"
                  >
                    <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <span className="text-sm font-medium">HTTP Stream</span>
                    <span className="text-xs text-white/60">Web stream</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const form = document.querySelector('form');
                      if (!form) return;
                      
                      // Update hidden input
                      const hiddenInput = form.querySelector('[name="streamType"]') as HTMLInputElement;
                      if (hiddenInput) hiddenInput.value = 'other';
                      
                      // Update UI
                      const urlField = form.querySelector('.url-field') as HTMLDivElement;
                      const cameraField = form.querySelector('.camera-field') as HTMLDivElement;
                      if (urlField) urlField.style.display = 'block';
                      if (cameraField) cameraField.style.display = 'none';
                      
                      // Update button states
                      document.querySelectorAll('.camera-type-btn').forEach(btn => {
                        btn.classList.remove('active');
                      });
                      document.querySelector('[data-type="other"]')?.classList.add('active');
                    }}
                    className="camera-type-btn flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 bg-white/5 border-white/20 text-white/80 hover:bg-white/10 hover:border-white/30"
                    data-type="other"
                  >
                    <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                    </svg>
                    <span className="text-sm font-medium">Other</span>
                    <span className="text-xs text-white/60">Custom source</span>
                  </button>
                </div>
                
                {/* Hidden input to store the selected type */}
                <input type="hidden" name="streamType" defaultValue="webcam" />
              </div>
              
              <div className="camera-field">
                <label className="block text-sm text-white/80 mb-2">Camera ID</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-white/10 border-white/20 text-white placeholder-white/60"
                  name="cameraId"
                  placeholder="0 for first camera, 1 for second, etc."
                  defaultValue="0"
                />
                <p className="text-xs text-white/50 mt-1">0 = Built-in camera, 1 = First USB camera, 2 = Second USB camera...</p>
              </div>
              
              <div className="url-field" style={{display: 'none'}}>
                <label className="block text-sm text-white/80 mb-2">Stream URL</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-white/10 border-white/20 text-white placeholder-white/60"
                  name="url"
                  placeholder="rtsp://192.168.1.100:554/stream"
                />
                <p className="text-xs text-white/50 mt-1">Enter the full RTSP or HTTP stream URL</p>
              </div>
              
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddCamera(false)}
                  className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-500/80 border border-blue-500/50 text-white hover:bg-blue-500 transition-colors"
                >
                  Add Camera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-3">Delete Stream</h3>
            <p className="text-white/80 mb-6">
              Are you sure you want to delete &ldquo;{deleteConfirm.stream.name}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { error } = await supabase.from("streams").delete().eq("id", deleteConfirm.stream.id);
                  if (error) {
                    alert(error.message);
                  } else {
                    // Refresh streams list
                    if (org) {
                      const { data } = await supabase
                        .from("streams")
                        .select("id, name, url, kind")
                        .eq("org_id", org.id)
                        .order("name");
                      setStreams(data ?? []);
                    }
                  }
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-500/80 border border-red-500/50 text-white hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}