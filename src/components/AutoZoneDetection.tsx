"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import SharedCamera from "@/components/SharedCamera";
import { useZoneDetection } from "@/hooks/useZoneDetection";

type StreamRow = {
  id: string;
  name: string;
  org_id: string;
  kind: string;
  url?: string;
  rtsp_url?: string;
  is_active: boolean;
};

export default function AutoZoneDetection({ orgSlug }: { orgSlug: string }) {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [featuredSource, setFeaturedSource] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [zonesLoaded, setZonesLoaded] = useState<boolean>(false);

  // Load streams and pick a default source automatically
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: org, error: orgError } = await supabase
          .from("orgs")
          .select("id")
          .eq("slug", orgSlug)
          .single();
        if (orgError || !org) return;
        const { data: streams } = await supabase
          .from("streams")
          .select("*")
          .eq("org_id", org.id)
          .order("name");
        const list = (streams || []) as StreamRow[];
        const defaultFeatured =
          list.find((s) => s.url?.startsWith("webcam:") || s.kind === "webcam") ||
          list[0];
        const selected =
          defaultFeatured?.url || defaultFeatured?.rtsp_url || "webcam:0";
        if (!cancelled) setFeaturedSource(selected);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSlug, supabase]);

  // Load zones from Supabase for this stream into localStorage so the
  // zone-detection hook has them ready without visiting the Doors page.
  useEffect(() => {
    if (!featuredSource) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `/api/org/${orgSlug}/zones?stream_id=${encodeURIComponent(
            featuredSource
          )}`
        );
        if (!resp.ok) return;
        const data = await resp.json();
        const zones = (data?.zones || []).map((z: any, idx: number) => ({
          id: z.id || `zone_${idx}`,
          name: z.name || `Zone ${idx + 1}`,
          x1: z.x1,
          y1: z.y1,
          x2: z.x2,
          y2: z.y2,
          camera_id: featuredSource,
        }));
        // Merge into localStorage
        const existing = JSON.parse(
          localStorage.getItem("doorZones") || "[]"
        );
        const others = existing.filter(
          (zone: any) => zone.camera_id !== featuredSource
        );
        const all = [...others, ...zones];
        localStorage.setItem("doorZones", JSON.stringify(all));
        window.dispatchEvent(new Event("doorZonesUpdated"));
        if (!cancelled) setZonesLoaded(true);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSlug, featuredSource]);

  // Helper: map display-space zone coords -> frame-space (video pixel) coords
  const mapZonesToFrame = (zones: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>) => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0 || v.videoHeight === 0) return null;
    const rect = v.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const r = Math.min(containerW / vw, containerH / vh);
    const contentW = vw * r;
    const contentH = vh * r;
    const offsetX = (containerW - contentW) / 2;
    const offsetY = (containerH - contentH) / 2;
    const toFrame = (x: number, y: number) => {
      const localX = x - offsetX;
      const localY = y - offsetY;
      const nx = Math.max(0, Math.min(1, localX / contentW));
      const ny = Math.max(0, Math.min(1, localY / contentH));
      return { x: nx * vw, y: ny * vh };
    };
    return zones.map((z) => {
      const p1 = toFrame(z.x1, z.y1);
      const p2 = toFrame(z.x2, z.y2);
      return { id: z.id, name: z.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    });
  };

  // After zones are loaded and the hidden video has metadata, push zones to detection backend automatically
  useEffect(() => {
    if (!featuredSource || !zonesLoaded) return;
    let cancelled = false;

    const pushZones = async () => {
      // Read zones for this camera from localStorage
      let zones: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
      try {
        const all = JSON.parse(localStorage.getItem('doorZones') || '[]');
        zones = (all || []).filter((z: any) => z.camera_id === featuredSource).map((z: any, idx: number) => ({
          id: z.id || `zone_${idx}`,
          x1: z.x1,
          y1: z.y1,
          x2: z.x2,
          y2: z.y2,
        }));
      } catch {}
      if (!zones.length) return;

      // Wait until video metadata is ready
      const waitForVideo = async () => {
        const start = Date.now();
        while (!cancelled) {
          const v = videoRef.current;
          if (v && v.videoWidth > 0 && v.videoHeight > 0) break;
          if (Date.now() - start > 5000) break; // 5s timeout
          await new Promise((r) => setTimeout(r, 100));
        }
      };
      await waitForVideo();
      if (cancelled) return;

      const mapped = mapZonesToFrame(zones);
      if (!mapped || !mapped.length) return;

      try {
        const resp = await fetch('/api/detection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'zones_update',
            camera_id: featuredSource,
            zones: mapped,
          })
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          console.warn('⚠️ AUTO-ZONES: Failed to push zones to detection backend:', resp.status, text);
        } else {
          console.log('✅ AUTO-ZONES: Zones pushed to detection backend');
        }
      } catch (e) {
        console.warn('⚠️ AUTO-ZONES: Error pushing zones to detection backend:', e);
      }
    };

    pushZones();
    return () => { cancelled = true; };
  }, [featuredSource, zonesLoaded]);

  // Enable zone-based occupancy updates using detection results
  useZoneDetection({
    orgSlug,
    cameraSource: featuredSource || "webcam:0",
    enabled: !!featuredSource,
    detectionCooldown: 2000,
  });

  // Render an offscreen SharedCamera (with real dimensions) to drive detection.
  // Offscreen instead of zero-size so zone mapping (display<->frame) works.
  if (!featuredSource) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width: 640,
        height: 360,
        pointerEvents: "none",
        opacity: 0,
      }}
      aria-hidden
    >
      <SharedCamera
        cameraSource={featuredSource}
        enableDetection={true}
        detectionFrameRate={2}
        onDetection={() => {}}
        isLarge={false}
        videoElementRef={videoRef}
      />
    </div>
  );
}
