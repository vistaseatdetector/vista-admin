"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// Mirror server truth (single running occurrence or null)
export type MassOccurrence =
  | {
      id: string;
      mass_id: string;
      status: "scheduled" | "running" | "live" | "ended";
      starts_at: string | null;
      ends_at: string | null;
      schedule_id: string | null;
      started_by: string | null;
      org_id: string;
    }
  | null;

type Ctx = {
  currentMass: MassOccurrence;
  refresh: () => Promise<void>;
  setCurrentMass: (m: MassOccurrence) => void;
};

const CurrentMassContext = createContext<Ctx | null>(null);

export function CurrentMassProvider({ children, orgId }: { children: React.ReactNode; orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [currentMass, setCurrentMass] = useState<MassOccurrence>(null);

  const refresh = useCallback(async () => {
    // Prefer RPC if present, but gracefully fall back to a direct query.
    try {
      const { data, error } = await supabase.rpc("get_current_mass_occurrence", { p_org_id: orgId });
      if (error) throw error;
      if (data) {
        const row = data as any;
        const normalized: NonNullable<MassOccurrence> = {
          id: row.id,
          mass_id: row.mass_id,
          status: row.status,
          starts_at: row.starts_at ?? null,
          ends_at: row.ends_at ?? null,
          schedule_id: row.schedule_id ?? null,
          started_by: row.started_by ?? null,
          org_id: row.org_id,
        };
        setCurrentMass(normalized);
        return;
      }
    } catch (rpcErr: any) {
      console.warn("[CurrentMass] RPC get_current_mass_occurrence failed; falling back:", rpcErr?.message || rpcErr);
    }

    // Fallback: read directly from mass_occurrences for running/live
    const { data: occ, error: qerr } = await supabase
      .from("mass_occurrences")
      .select("id, mass_id, status, starts_at, ends_at, schedule_id, started_by, org_id")
      .eq("org_id", orgId)
      .in("status", ["running", "live"]) as any;

    if (qerr) {
      console.warn("[CurrentMass] fallback query error:", qerr.message);
      setCurrentMass(null);
      return;
    }
    const rows = (occ ?? []) as any[];
    const row = rows.sort((a, b) => new Date(b.starts_at || 0).getTime() - new Date(a.starts_at || 0).getTime())[0];
    if (!row) {
      setCurrentMass(null);
      return;
    }
    const normalized: NonNullable<MassOccurrence> = {
      id: row.id,
      mass_id: row.mass_id,
      status: row.status,
      starts_at: row.starts_at ?? null,
      ends_at: row.ends_at ?? null,
      schedule_id: row.schedule_id ?? null,
      started_by: row.started_by ?? null,
      org_id: row.org_id,
    };
    setCurrentMass(normalized);
  }, [supabase, orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: whenever the org's mass_occurrences change, refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`mass-occurrences-live-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mass_occurrences",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, orgId, refresh]);

  const value: Ctx = { currentMass, refresh, setCurrentMass };
  return <CurrentMassContext.Provider value={value}>{children}</CurrentMassContext.Provider>;
}

export function useCurrentMass() {
  const ctx = useContext(CurrentMassContext);
  if (!ctx) throw new Error("useCurrentMass must be used within CurrentMassProvider");
  return ctx;
}
