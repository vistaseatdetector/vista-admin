"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Settings } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import SharedCamera from "@/components/SharedCamera";
import ThreatAnalysisProgressCard from "@/components/ThreatAnalysisProgressCard";
import { useDetectionContext } from "@/contexts/DetectionContext";
import { throttle } from "@/utils/throttle";
import { useCurrentMass } from "@/contexts/CurrentMassContext";
import MassControls from "@/components/mass/MassControls";
import StartMassDialog from "./components/StartMassDialog";
// ❌ removed: import { getNextScheduled } from "./actions/getNextScheduled";

interface DetectionResult {
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
}

interface Stream {
  id: string;
  name: string;
  org_id: string;
  kind: string;
  url?: string;
  enabled?: boolean;
}

interface MassOption {
  id: string;
  name: string | null;
}

/** NEW: type for next scheduled occurrence loaded client-side */
type NextOccurrence = {
  id: string;
  mass_id: string;
  mass_name: string | null;
  scheduled_starts_at: string; // ISO
  scheduled_ends_at: string;   // ISO
};


export default function OrgDashboard() {
  const params = useParams();
  const detectionContext = useDetectionContext();
  const mainVideoRef = useRef<HTMLVideoElement>(null!);
  const { currentMass } = useCurrentMass();
  const hasLiveMass =
    currentMass?.status === "running" || currentMass?.status === "live";

  // State
  const [org, setOrg] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [liveDetectionCount, setLiveDetectionCount] = useState<number | null>(null);
  const [liveOccupancy, setLiveOccupancy] = useState<number | null>(null);
  const [entryCount, setEntryCount] = useState<number>(0);
  const [exitCount, setExitCount] = useState<number>(0);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [massOptions, setMassOptions] = useState<MassOption[]>([]);
  const [selectedMassId, setSelectedMassId] = useState<string>("");
  const [mainCameraId, setMainCameraId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [suspiciousConf, setSuspiciousConf] = useState<number>(0.25);
  const [threatConf, setThreatConf] = useState<number>(0.35);
  const [suspiciousIou, setSuspiciousIou] = useState<number>(0.5);
  const [threatIou, setThreatIou] = useState<number>(0.5);
  const [peopleConf, setPeopleConf] = useState<number>(0.25);
  const [peopleIou, setPeopleIou] = useState<number>(0.5);
  const [llmEnabled, setLlmEnabled] = useState<boolean>(true);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [newCameraName, setNewCameraName] = useState("");
  const [newCameraType, setNewCameraType] = useState<"webcam" | "rtsp">("webcam");
  const [newCameraUrl, setNewCameraUrl] = useState("");
  const [webcamIndex, setWebcamIndex] = useState<number>(0);
  const [showAllClear, setShowAllClear] = useState(false);
  const [strobesSuppressed, setStrobesSuppressed] = useState(false);
  const [strobeUntil, setStrobeUntil] = useState<number | null>(null);
  const [strobeTick, setStrobeTick] = useState<number>(0);

  /** NEW: state for next scheduled occurrence */
  const [nextOccurrence, setNextOccurrence] = useState<NextOccurrence | null>(null);

  // Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Listen to detection results for the currently selected main camera
  useEffect(() => {
    if (!detectionContext) return;
    const main =
      streams.find((s) => s.id === mainCameraId) ||
      streams.find((s) => s.url?.startsWith("webcam:") || s.kind === "webcam") ||
      streams[0];
    const mainSource = main?.url || "webcam:0";

    const unsubscribe = detectionContext.subscribeToDetections(mainSource, (state) => {
      if (state.result) {
        setLiveDetectionCount(state.result.people_count);

        if (typeof state.result.current_occupancy !== "undefined") {
          setLiveOccupancy(state.result.current_occupancy);
          setEntryCount(state.result.entry_count || 0);
          setExitCount(state.result.exit_count || 0);
        }
        try {
          const result = state.result;
          postDetectionThrottled({
            stream_id: mainCameraId ?? null,
            people_count: result?.people_count ?? null,
            current_occupancy:
              typeof result?.current_occupancy !== "undefined" ? result.current_occupancy : null,
            entry_count: result?.entry_count ?? null,
            exit_count: result?.exit_count ?? null,
            source: typeof result?.current_occupancy !== "undefined" ? "zones" : "simple",
            result,
            detected_at: Date.now(),
            mass_id: currentMass?.id ?? null,
          });
        } catch (e) {
          console.error("Snapshot post error:", e);
        }
        try {
          const confirmedThreat = state.result.llm_is_false_positive === false;
          if (confirmedThreat) setStrobeUntil(Date.now() + 10_000);
        } catch {}
      }
    });

    return unsubscribe;
  }, [detectionContext, streams, mainCameraId, currentMass?.id]);

  const postDetectionThrottled = useRef(
    throttle(async (payload: any) => {
      if (!org) return;
      try {
        await fetch(`/api/org/${org.slug}/detections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error("Failed to post detection:", e);
      }
    }, 2000)
  ).current;

  // Heartbeat for All Clear button
  useEffect(() => {
    if (strobesSuppressed) {
      setShowAllClear(false);
      return;
    }
    if (strobeUntil && Date.now() < strobeUntil) {
      setShowAllClear(true);
      const id = setInterval(() => {
        setStrobeTick(Date.now());
        if (!(strobeUntil && Date.now() < strobeUntil)) {
          setShowAllClear(false);
          clearInterval(id);
        }
      }, 250);
      return () => clearInterval(id);
    } else {
      setShowAllClear(false);
    }
  }, [strobeUntil, strobesSuppressed]);

  // Load org + streams
  useEffect(() => {
    const loadData = async () => {
      const orgSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

      try {
        const { data: orgData, error: orgError } = await supabase
          .from("orgs")
          .select("id, name, slug")
          .eq("slug", orgSlug)
          .single();

        if (orgError || !orgData) {
          console.error("Error getting organization:", orgError);
          const mockOrg = {
            id: "test-org-id",
            name: orgSlug === "test-org" ? "Test Organization" : `Organization ${orgSlug}`,
            slug: orgSlug || "default",
          };
          setOrg(mockOrg);
          setStreams([]);
          setIsLoading(false);
          return;
        }

        setOrg(orgData);

        const { data: streamsData, error: streamsError } = await supabase
          .from("streams")
          .select("*")
          .eq("org_id", orgData.id)
          .order("name");

        if (streamsError) {
          console.error("Error loading streams:", streamsError);
          setStreams([]);
        } else {
          setStreams(streamsData || []);
        }
      } catch (error) {
        console.error("Unexpected error loading data:", error);
        const mockOrg = {
          id: "test-org-id",
          name: "Test Organization",
          slug: "default",
        };
        setOrg(mockOrg);
        setStreams([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (params.slug) loadData();
  }, [params.slug, supabase]);

  // Load Mass templates list (for your existing MassControls)
  useEffect(() => {
    const loadMasses = async () => {
      if (!org?.id) {
        setMassOptions([]);
        setSelectedMassId("");
        return;
      }
      try {
        const { data, error } = await supabase
          .from("masses")
          .select("id, name")
          .eq("org_id", org.id)
          .order("name", { ascending: true });
        if (error) throw error;
        const rows = data ?? [];
        setMassOptions(rows);
        setSelectedMassId((prev) => (prev ? prev : rows[0]?.id ?? ""));
      } catch (error) {
        console.error("Error loading masses:", error);
        setMassOptions([]);
      }
    };
    loadMasses();
  }, [org, supabase]);

  /** Load the next scheduled occurrence client-side */
  useEffect(() => {
    const loadNext = async () => {
      if (!org?.id) {
        setNextOccurrence(null);
        return;
      }

      const { data, error } = await supabase
        .from("mass_occurrences")
        .select("id, mass_id, scheduled_starts_at, scheduled_ends_at, masses(name)")
        .eq("org_id", org.id)
        .eq("status", "scheduled")
        .gte("scheduled_starts_at", new Date().toISOString())
        .order("scheduled_starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("loadNext scheduled error:", error);
        setNextOccurrence(null);
        return;
      }
      if (!data) {
        setNextOccurrence(null);
        return;
      }

      setNextOccurrence({
        id: (data as any).id,
        mass_id: (data as any).mass_id,
        scheduled_starts_at: (data as any).scheduled_starts_at,
        scheduled_ends_at: (data as any).scheduled_ends_at,
        mass_name: (data as any)?.masses?.name ?? null,
      });
    };

    loadNext();
  }, [org?.id, supabase]);

  // Maintain main camera selection
  useEffect(() => {
    if (!streams || streams.length === 0) {
      setMainCameraId(null);
      return;
    }
    const exists = mainCameraId && streams.some((s) => s.id === mainCameraId);
    if (!exists) {
      const def =
        streams.find((s) => s.url?.startsWith("webcam:") || s.kind === "webcam") || streams[0];
      setMainCameraId(def?.id || null);
    }
  }, [streams, mainCameraId]);

  // Add camera handler (unchanged)
  const handleAddCamera = async () => {
    if (!newCameraName.trim()) {
      alert("Please enter a camera name");
      return;
    }
    if (!org) {
      alert("Organization not loaded");
      return;
    }
    try {
      let cameraUrl = "";
      if (newCameraType === "webcam") {
        let idx = Number.isFinite(webcamIndex) && webcamIndex >= 0 ? Math.floor(webcamIndex) : -1;
        if (idx < 0) {
          const webcamStreams = streams.filter((s) => s.url?.startsWith("webcam:"));
          const used = webcamStreams
            .map((s) => parseInt(s.url?.split(":")[1] || "0"))
            .filter((n) => Number.isFinite(n));
          idx = (used.length ? Math.max(...used) : -1) + 1;
        }
        cameraUrl = `webcam:${idx}`;
      } else {
        cameraUrl = newCameraUrl.trim();
        if (!cameraUrl) {
          alert("Please enter an RTSP URL");
          return;
        }
      }

      const resp = await fetch(`/api/org/${org.slug}/streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCameraName.trim(), kind: newCameraType, url: cameraUrl }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("Add camera failed:", resp.status, txt);
        alert("Failed to add camera. Please try again.");
        return;
      }
      const { stream } = await resp.json();
      setStreams([...streams, stream]);

      setShowAddCameraModal(false);
      setNewCameraName("");
      setNewCameraType("webcam");
      setNewCameraUrl("");
      setWebcamIndex(0);

      alert(`Camera "${newCameraName}" added successfully!`);
    } catch (error) {
      console.error("Unexpected error adding camera:", error);
      alert("Failed to add camera. Please try again.");
    }
  };

  if (!org) {
    return (
      <div className="text-center py-12">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  const mainCamera =
    (mainCameraId ? streams.find((s) => s.id === mainCameraId) : undefined) ||
    streams.find((s) => s.url?.startsWith("webcam:") || s.kind === "webcam") ||
    streams[0];
  const additionalCameras = streams;
  const mainSource =
    mainCamera?.url && mainCamera.url.startsWith("webcam:") ? mainCamera.url : "";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">{org.name}</h1>
          <p className="text-white/60">Church Dashboard</p>
        </div>

        <div className="flex flex-wrap items-stretch justify-end gap-4">
          {/* Start Mass glass card with popup */}
          {!hasLiveMass && org?.id && (
            <div
              className="min-w-[220px] rounded-2xl border border-white/15 bg-white/10 px-6 py-3 text-white
                         backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)]
                         [box-shadow:inset_0_1px_0_rgba(255,255,255,.25),0_20px_60px_-20px_rgba(59,130,246,.35)]"
            >
              <div className="text-sm text-white/80">Action</div>
              <div className="mt-2">
                <StartMassDialog orgId={org.id} nextOccurrence={nextOccurrence} />
              </div>
            </div>
          )}

          {/* Select Mass / MassControls card */}
          <div className="flex min-w-[220px] flex-col rounded-2xl border border-white/15 bg-white/10 px-6 py-3 text-white
                  backdrop-blur-xl transition-all shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
            <div className="text-sm text-white/80">{hasLiveMass ? "Live Mass" : "No Mass live"}</div>
            <div className="mt-1 text-center text-2xl font-semibold text-white">
              {currentMass?.mass_id || currentMass?.id || "Select Mass"}
            </div>
            <div className="mt-4 space-y-3">
              {massOptions.length > 0 ? (
                <div>
                  <label className="text-xs uppercase tracking-wide text-white/60">Mass to control</label>
                  <select
                    value={selectedMassId}
                    onChange={(e) => setSelectedMassId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                  >
                    {massOptions.map((mass) => (
                      <option key={mass.id} value={mass.id} className="bg-slate-900 text-white">
                        {mass.name?.trim() || mass.id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="text-sm text-white/70">
                  {org?.id ? "No masses configured for this org." : "Loading masses…"}
                </div>
              )}
              {org?.id ? (
                <MassControls
                  orgId={org.id}
                  massId={selectedMassId}
                  scheduleId={null}
                  className="flex justify-center"
                />
              ) : (
                <div className="text-center text-sm text-white/60">Loading…</div>
              )}
            </div>
          </div>

          {/* Green KPI card (unchanged) */}
          <div className="flex min-w-[220px] flex-col items-center justify-center rounded-2xl border border-green-500/30 bg-green-500/25 px-6 py-3 text-white font-medium">
            <div className="text-sm text-white/80">Total Headcount</div>
            <div className="mt-1 text-4xl font-extrabold tracking-tight">
              {liveOccupancy !== null ? liveOccupancy : liveDetectionCount !== null ? liveDetectionCount : "0"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Camera Stream */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Main Camera Feed</h2>
          <div className="flex items-center gap-3">
            {mainCamera && <span className="text-sm text-white/60">{mainCamera.name}</span>}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="p-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white/80"
              title="Detection settings"
              aria-label="Detection settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="w-full">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h4 className="text-2xl font-bold text-white mb-3">
                  {mainCamera ? mainCamera.name : "Main Camera"}
                </h4>
                <div className="flex items-center gap-4 text-sm">
                  <span className="px-3 py-1.5 bg-green-500/20 text-green-300 border border-green-500/30 rounded-full text-xs font-medium">
                    LIVE
                  </span>
                  <span className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-xs font-medium uppercase">
                    {mainCamera?.kind || "WEBCAM"}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative mb-6">
              <div className="aspect-video rounded-xl overflow-hidden bg-black/30 border border-white/10">
                {mainSource ? (
                  <SharedCamera
                    key={mainSource}
                    cameraSource={mainSource}
                    isLarge={true}
                    enableDetection={true}
                    detectionFrameRate={3}
                    videoElementRef={mainVideoRef}
                    onError={(error: Error) => {
                      console.error("Main webcam error:", error);
                    }}
                    onStatusChange={(isActive: boolean) => {
                      console.log("Main webcam status:", isActive);
                    }}
                    onDetection={(result: DetectionResult) => {
                      console.log("Detection result:", result);
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">
                    This stream is not a local webcam source. Configure a webcam URL (webcam:X) or use the Vista player for RTSP.
                  </div>
                )}
                {showAllClear && (
                  <div className="absolute top-3 right-3 z-20">
                    <button
                      onClick={() => {
                        try {
                          document.body.classList.add("strobe-suppressed");
                        } catch {}
                        setStrobesSuppressed(true);
                        setShowAllClear(false);
                      }}
                      className="px-3 py-1.5 rounded-md bg-red-600/90 hover:bg-red-500 text-white text-xs border border-white/20 shadow"
                    >
                      All Clear
                    </button>
                  </div>
                )}
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

      <GlassCard>
        <ThreatAnalysisProgressCard cameraSource={mainCamera?.url || "webcam:0"} videoRef={mainVideoRef} />
      </GlassCard>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-40 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm overflow-y-auto pb-6">
          <GlassCard className="w-full max-w-md mx-4 p-0 max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Detection Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-white/70 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Controls unchanged… */}
              {/* People Confidence */}
              <div>
                <label className="block text-sm text-white/80 mb-2">People Confidence</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={peopleConf}
                  onChange={(e) => setPeopleConf(parseFloat(e.target.value))}
                  className="w-full accent-blue-400"
                />
                <div className="mt-1 text-xs text-white/50">{peopleConf.toFixed(2)}</div>
              </div>
              {/* Rest of settings ... (unchanged) */}
              <div>
                <label className="block text-sm text-white/80 mb-2">People Overlap (IoU)</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={peopleIou}
                  onChange={(e) => setPeopleIou(parseFloat(e.target.value))}
                  className="w-full accent-blue-400"
                />
                <div className="mt-1 text-xs text-white/50">{peopleIou.toFixed(2)}</div>
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-2">Suspicious Confidence</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={suspiciousConf}
                  onChange={(e) => setSuspiciousConf(parseFloat(e.target.value))}
                  className="w-full accent-blue-400"
                />
                <div className="mt-1 text-xs text-white/50">{suspiciousConf.toFixed(2)}</div>
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-2">Threat Confidence</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={threatConf}
                  onChange={(e) => setThreatConf(parseFloat(e.target.value))}
                  className="w-full accent-blue-400"
                />
                <div className="mt-1 text-xs text-white/50">{threatConf.toFixed(2)}</div>
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-2">Suspicious Overlap (IoU)</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={suspiciousIou}
                  onChange={(e) => setSuspiciousIou(parseFloat(e.target.value))}
                  className="w-full accent-blue-400"
                />
                <div className="mt-1 text-xs text-white/50">{suspiciousIou.toFixed(2)}</div>
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-2">Threat Overlap (IoU)</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={threatIou}
                  onChange={(e) => setThreatIou(parseFloat(e.target.value))}
                  className="w-full accent-blue-400"
                />
                <div className="mt-1 text-xs text-white/50">{threatIou.toFixed(2)}</div>
              </div>
              <div>
                <label className="inline-flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={llmEnabled}
                    onChange={(e) => setLlmEnabled(e.target.checked)}
                    className="accent-blue-400"
                  />
                  Enable LLM confirmation (false-positive filter)
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    try {
                      localStorage.setItem(
                        "threatSettings",
                        JSON.stringify({
                          people_conf: peopleConf,
                          people_iou: peopleIou,
                          suspicious_conf: suspiciousConf,
                          threat_conf: threatConf,
                          suspicious_iou: suspiciousIou,
                          threat_iou: threatIou,
                          llm_enabled: llmEnabled,
                        })
                      );
                    } catch {}
                    setShowSettings(false);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    try {
                      localStorage.removeItem("threatSettings");
                    } catch {}
                    setPeopleConf(0.25);
                    setPeopleIou(0.5);
                    setSuspiciousConf(0.25);
                    setThreatConf(0.35);
                    setSuspiciousIou(0.5);
                    setThreatIou(0.5);
                    setLlmEnabled(true);
                    setShowSettings(false);
                  }}
                  className="px-4 py-2 bg-white/5 border border-white/15 text-white/80 rounded-xl hover:bg-white/10 transition-colors"
                >
                  Reset
                </button>
              </div>
              <p className="text-xs text-white/60">
                Settings are saved locally and used on the next detection request.
              </p>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Additional Camera Streams */}
      {additionalCameras.length > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Additional Camera Streams</h2>
            <span className="text-sm text-white/60">{additionalCameras.length} cameras</span>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {additionalCameras.map((camera) => {
              const isCurrent = camera.id === mainCamera?.id;
              const isWebcam = !!camera.url && camera.url.startsWith("webcam:");
              return (
                <button
                  key={camera.id}
                  onClick={() => setMainCameraId(camera.id)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    isCurrent
                      ? "border-blue-400/60 bg-blue-500/10"
                      : "border-white/15 bg-white/5 hover:border-blue-400/40 hover:bg-white/10"
                  }`}
                  title="Click to set as main feed"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-white">{camera.name}</h4>
                    <div className="flex items-center gap-2">
                      {isCurrent && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                          CURRENT
                        </span>
                      )}
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          (camera as any).enabled === false
                            ? "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                            : "bg-green-500/20 text-green-300 border border-green-500/30"
                        }`}
                      >
                        {(camera as any).enabled === false ? "INACTIVE" : "ACTIVE"}
                      </span>
                    </div>
                  </div>
                  <div className="aspect-video rounded-lg overflow-hidden bg-black/30 border border-white/10 mb-3">
                    {isWebcam ? (
                      <SharedCamera
                        key={camera.url as string}
                        cameraSource={camera.url as string}
                        isLarge={false}
                        enableDetection={false}
                        onError={(error: Error) => {
                          console.error(`Camera ${camera.name} error:`, error);
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/60 text-xs">
                        No browser preview
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span className="uppercase">{camera.kind}</span>
                    <span className="text-blue-300">Click to make main</span>
                  </div>
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* KPI row */}
      <div className="grid gap-8 md:grid-cols-3">
        <GlassCard>
          <div className="text-sm text-white/70">Current Occupancy</div>
          <div className="mt-1 text-5xl font-extrabold tracking-tight">
            {liveOccupancy !== null
              ? liveOccupancy
              : liveDetectionCount !== null
              ? liveDetectionCount
              : "—"}
          </div>
          <div className="mt-2 text-xs text-white/60">
            {liveOccupancy !== null
              ? "Zone-Based Count"
              : liveDetectionCount !== null
              ? "Simple Detection"
              : "No Detection"}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-sm text-white/70">Daily Entries</div>
          <div className="mt-1 text-5xl font-extrabold tracking-tight">{entryCount}</div>
          <div className="mt-2 text-xs text-white/60">People Entered Today</div>
        </GlassCard>

        <GlassCard>
          <div className="text-sm text-white/70">Active Cameras</div>
          <div className="mt-1 text-5xl font-extrabold tracking-tight">
            {streams.filter((s) => (s as any).enabled !== false).length}
          </div>
          <div className="mt-2 text-xs text-white/60">{streams.length} Total Configured</div>
        </GlassCard>
      </div>

      {/* Add Camera Modal */}
      {showAddCameraModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Add Camera
              </h3>
              <button
                onClick={() => {
                  setShowAddCameraModal(false);
                  setNewCameraName("");
                  setNewCameraType("webcam");
                  setNewCameraUrl("");
                }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal content unchanged… */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Camera Name</label>
                <input
                  type="text"
                  placeholder="e.g., Front Door, Sanctuary, Parking Lot..."
                  value={newCameraName}
                  onChange={(e) => setNewCameraName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Camera Type</label>
                <select
                  value={newCameraType}
                  onChange={(e) => setNewCameraType(e.target.value as "webcam" | "rtsp")}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                >
                  <option value="webcam" className="bg-slate-800 text-white">
                    Local Webcam
                  </option>
                  <option value="rtsp" className="bg-slate-800 text-white">
                    RTSP/IP Camera
                  </option>
                </select>
              </div>

              {newCameraType === "webcam" && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Webcam Device Index</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={webcamIndex}
                    onChange={(e) => setWebcamIndex(parseInt(e.target.value || "0", 10))}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                  />
                  <div className="mt-1 text-xs text-white/50">Example: 0 = default camera, 1 = secondary</div>
                </div>
              )}

              {newCameraType === "rtsp" && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">RTSP URL</label>
                  <input
                    type="text"
                    placeholder="rtsp://username:password@camera-ip:port/stream"
                    value={newCameraUrl}
                    onChange={(e) => setNewCameraUrl(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddCameraModal(false);
                    setNewCameraName("");
                    setNewCameraType("webcam");
                    setNewCameraUrl("");
                  }}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white/60 rounded-xl hover:bg-white/10 transition-all font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCamera}
                  disabled={!newCameraName.trim() || (newCameraType === "rtsp" && !newCameraUrl.trim())}
                  className="flex-1 px-4 py-3 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                >
                  Add Camera
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
