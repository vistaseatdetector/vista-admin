"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentMass } from "@/contexts/CurrentMassContext";
import { Square, Loader2 } from "lucide-react";

type Props = {
  orgId: string;
  className?: string;
};

export default function MassEndButton({ className }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { currentMass, refresh } = useCurrentMass();
  const [loading, setLoading] = useState(false);

  const onEnd = async () => {
    if (!currentMass?.id) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("end_mass_occurrence", {
      p_occurrence_id: currentMass.id,
    });
    if (error) {
      console.error("[EndMass] RPC error:", error.message);
    }
    if (data && process.env.NODE_ENV !== "production") {
      console.debug("[EndMass] RPC response", data);
    }
    await refresh();
    setLoading(false);
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 shadow ${className ?? ""}`}
      onClick={onEnd}
      disabled={loading || !currentMass?.id}
      aria-label="End Mass"
    >
      {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Square className="h-4 w-4" />}
      <span>End Mass</span>
    </button>
  );
}
