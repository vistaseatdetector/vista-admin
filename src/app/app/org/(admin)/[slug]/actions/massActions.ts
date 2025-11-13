"use server";

import { createClient } from "@/lib/supabase/server";

export async function startScheduledOccurrence(occurrenceId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_scheduled_occurrence", {
    p_occurrence_id: occurrenceId,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: !!row?.ok, message: row?.message ?? "", occurrenceId: occurrenceId };
}

export async function startAdhocMass(params: {
  orgId: string;
  name?: string;
  startsAt?: string;      // ISO; default now
  durationMinutes?: number; // default 60
  leadMinutes?: number;     // default 10
  tailMinutes?: number;     // default 5
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_adhoc_mass", {
    p_org_id: params.orgId,
    p_name: params.name ?? "Ad-Hoc Mass",
    p_starts_at: params.startsAt ?? null,
    p_duration_minutes: params.durationMinutes ?? 60,
    p_lead_minutes: params.leadMinutes ?? 10,
    p_tail_minutes: params.tailMinutes ?? 5,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: !!row?.ok, message: row?.message ?? "", occurrenceId: row?.occurrence_id as string };
}

export async function endCurrentMass(orgId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("end_current_mass", { p_org_id: orgId });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
