"use client";
import * as React from "react";
import { useDetectionContext } from "@/contexts/DetectionContext";

export default function GlassCard({
  className = "",
  children,
  strobeOnThreat = true,
}: React.PropsWithChildren<{ className?: string; strobeOnThreat?: boolean }>) {
  const detectionContext = useDetectionContext();
  // Only strobe when LLM has confirmed a threat; persist for 10s
  const [strobeUntil, setStrobeUntil] = React.useState<number | null>(null);
  const [, setTick] = React.useState<number>(0);

  React.useEffect(() => {
    let unsubs: Array<() => void> = [];
    try {
      const sources = detectionContext.getActiveSources();
      // Subscribe to all current sources
      unsubs = sources.map((src) => detectionContext.subscribeToDetections(src, (state) => {
        const r: any = state?.result;
        if (r && r.llm_is_false_positive === false) {
          setStrobeUntil(Date.now() + 10_000);
        }
      }));
      // Initialize from current state
      for (const src of sources) {
        const r: any = detectionContext.getDetectionState(src)?.result;
        if (r && r.llm_is_false_positive === false) {
          setStrobeUntil(Date.now() + 10_000);
          break;
        }
      }
    } catch {
      // no-op
    }
    return () => {
      unsubs.forEach((u) => {
        try { u(); } catch {}
      });
    };
  }, [detectionContext]);

  // Heartbeat re-render while strobe is active
  React.useEffect(() => {
    if (strobeUntil && Date.now() < strobeUntil) {
      const id = setInterval(() => setTick(Date.now()), 250);
      return () => clearInterval(id);
    }
  }, [strobeUntil]);

  return (
    <div
      className={[
        "relative rounded-2xl border border-white/20 bg-white/10 backdrop-blur-2xl overflow-hidden",
        "shadow-[0_8px_30px_rgba(0,0,0,0.18)]",
        // subtle dark tint for legibility over photos (bump to 0.10 if you want less see-through)
        "after:absolute after:inset-0 after:rounded-2xl after:bg-[rgba(11,36,57,0.08)] after:pointer-events-none",
        "p-6",
        className,
      ].join(" ")}
    >
      {strobeOnThreat && strobeUntil && Date.now() < strobeUntil && (
        <div className="absolute inset-0 strobe-red-alert pointer-events-none" style={{ zIndex: 2 }} />
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}


