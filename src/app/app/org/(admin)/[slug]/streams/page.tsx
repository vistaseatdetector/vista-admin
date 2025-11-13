"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import GlassCard from "@/components/ui/GlassCard";
import SharedCamera from "@/components/SharedCamera";

interface Stream {
  id: string;
  name: string;
  org_id: string;
  kind: string;
  url?: string;
  enabled?: boolean;
}

type CameraKind = "webcam" | "rtsp";

export default function StreamsPage() {
  const params = useParams();

  const [org, setOrg] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [newCameraName, setNewCameraName] = useState("");
  const [newCameraType, setNewCameraType] = useState<CameraKind>("webcam");
  const [newCameraUrl, setNewCameraUrl] = useState("");
  const [webcamIndex, setWebcamIndex] = useState<number>(0);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  useEffect(() => {
    const loadData = async () => {
      const orgSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

      if (!orgSlug) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

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
        const fallbackSlug = orgSlug;
        const mockOrg = {
          id: "test-org-id",
          name: fallbackSlug === "test-org" ? "Test Organization" : `Organization ${fallbackSlug}`,
          slug: fallbackSlug || "default",
        };
        setOrg(mockOrg);
        setStreams([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [params.slug, supabase]);

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
            .map((s) => parseInt(s.url?.split(":")[1] || "0", 10))
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
        body: JSON.stringify({
          name: newCameraName.trim(),
          kind: newCameraType,
          url: cameraUrl,
        }),
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

  const orgName = org?.name || "Organization";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Camera Streams</h1>
        <p className="text-white/60">
          Manage the cameras connected to {orgName}.
        </p>
      </div>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Connected Camera Streams</h2>
          <span className="text-sm text-white/60">{streams.length} cameras</span>
        </div>

        {isLoading ? (
          <div className="text-white/60">Loading streams...</div>
        ) : streams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-white/60">
            No cameras connected yet.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {streams.map((camera) => {
              const isWebcam = !!camera.url && camera.url.startsWith("webcam:");
              return (
                <div
                  key={camera.id}
                  className="text-left rounded-xl border border-white/15 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-white">{camera.name}</h4>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        camera.enabled === false
                          ? "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                          : "bg-green-500/20 text-green-300 border border-green-500/30"
                      }`}
                    >
                      {camera.enabled === false ? "INACTIVE" : "ACTIVE"}
                    </span>
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
                    {camera.url && <span>{camera.url}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex justify-start">
          <button
            onClick={() => setShowAddCameraModal(true)}
            className="px-6 py-3 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 transition-all font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Camera
          </button>
        </div>
      </GlassCard>

      {showAddCameraModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2z"
                  />
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

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Camera Name
                </label>
                <input
                  value={newCameraName}
                  onChange={(event) => setNewCameraName(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="Main Entrance"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Camera Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewCameraType("webcam")}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      newCameraType === "webcam"
                        ? "border-blue-400/60 bg-blue-500/10 text-blue-200"
                        : "border-white/15 bg-white/5 text-white/70 hover:border-blue-400/40"
                    }`}
                  >
                    Built-in Webcam
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCameraType("rtsp")}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      newCameraType === "rtsp"
                        ? "border-blue-400/60 bg-blue-500/10 text-blue-200"
                        : "border-white/15 bg-white/5 text-white/70 hover:border-blue-400/40"
                    }`}
                  >
                    RTSP Stream
                  </button>
                </div>
              </div>

              {newCameraType === "webcam" && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Webcam Index
                  </label>
                  <input
                    type="number"
                    value={webcamIndex}
                    onChange={(event) => setWebcamIndex(Number(event.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    placeholder="0"
                    min={0}
                  />
                  <div className="mt-1 text-xs text-white/50">
                    Example: 0 = default camera, 1 = secondary
                  </div>
                </div>
              )}

              {newCameraType === "rtsp" && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    RTSP URL
                  </label>
                  <input
                    value={newCameraUrl}
                    onChange={(event) => setNewCameraUrl(event.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    placeholder="rtsp://username:password@camera-ip:port/stream"
                  />
                  <div className="mt-1 text-xs text-white/50">
                    Use your camera&apos;s RTSP endpoint.
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddCamera}
                  className="flex-1 px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl hover:bg-blue-500/30 transition-colors"
                >
                  Save Camera
                </button>
                <button
                  onClick={() => {
                    setShowAddCameraModal(false);
                    setNewCameraName("");
                    setNewCameraType("webcam");
                    setNewCameraUrl("");
                  }}
                  className="px-4 py-2 bg-white/5 border border-white/15 text-white/80 rounded-xl hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
