"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentMass } from "@/contexts/CurrentMassContext";

type Props = {
  orgId: string;
  massId: string;              // still passed from the dashboard but not strictly needed here
  scheduleId?: string | null;
  className?: string;
};

export default function MassControls({ orgId, className }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { currentMass, refresh } = useCurrentMass();
  const [loading, setLoading] = useState<"end" | null>(null);

  const isRunning =
    !!currentMass && (currentMass.status === "running" || currentMass.status === "live");

  const handleEnd = async () => {
    if (!currentMass) return;

    setLoading("end");
    try {
      const { error } = await supabase.rpc("end_mass_occurrence", {
        p_occurrence_id: currentMass.id,
      });

      if (error) {
        console.error("[MassControls] end_mass_occurrence error:", error);
        alert(error.message || "Failed to end Mass.");
        return;
      }

      await refresh();
    } catch (err: any) {
      console.error("[MassControls] end handler error:", err);
      alert(err.message || "Unexpected error ending Mass.");
    } finally {
      setLoading(null);
    }
  };

  if (!isRunning) {
    return (
      <div className={className}>
        <div className="text-xs text-white/60 italic">No Mass is currently live.</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        onClick={handleEnd}
        disabled={loading === "end"}
        className="inline-flex items-center justify-center px-4 py-2 rounded-xl
                   bg-red-500/80 hover:bg-red-500 transition-colors
                   text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed
                   border border-red-300/50 shadow-[0_10px_30px_rgba(239,68,68,0.35)]
                   backdrop-blur-lg"
      >
        {loading === "end" ? "Ending…" : "End Mass"}
      </button>
    </div>
  );
}
