"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentMass } from "@/contexts/CurrentMassContext";
import { Play, Loader2 } from "lucide-react";

type Props = {
  orgId: string;
  massId: string;
  scheduleId?: string | null;
  className?: string;
};

export default function MassStartButton({ massId, scheduleId = null, className }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { refresh } = useCurrentMass();
  const [loading, setLoading] = useState(false);

  const onStart = async () => {
    if (!massId) return;
    setLoading(true);
    const user = (await supabase.auth.getUser()).data.user;
    const startedBy = user?.id ?? null;
    const { data, error } = await supabase.rpc("start_mass_occurrence", {
      p_mass_id: massId,
      p_started_by: startedBy,
      p_schedule_id: scheduleId,
    });
    if (error) {
      console.error("[StartMass] RPC error:", error.message);
    }
    if (data && process.env.NODE_ENV !== "production") {
      console.debug("[StartMass] RPC response", data);
    }
    await refresh();
    setLoading(false);
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 shadow ${className ?? ""}`}
      onClick={onStart}
      disabled={loading || !massId}
      aria-label="Start Mass"
    >
      {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Play className="h-4 w-4" />}
      <span>Start Mass</span>
    </button>
  );
}
