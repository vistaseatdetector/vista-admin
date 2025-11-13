"use server";

import { createClient } from "@/lib/supabase/server";

export type NextOccurrence = {
  id: string;
  mass_name: string | null;
  scheduled_starts_at: string; // ISO
  scheduled_ends_at: string;   // ISO
};

export async function getNextScheduled(orgId: string): Promise<NextOccurrence | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("mass_occurrences")
    .select("id, scheduled_starts_at, scheduled_ends_at, masses(name)")
    .eq("org_id", orgId)
    .eq("status", "scheduled")
    .gte("scheduled_starts_at", new Date().toISOString())
    .order("scheduled_starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getNextScheduled error:", error.message);
    return null;
  }

  if (!data) return null;

  // supabase returns nested join as { masses: { name } }
  const mass_name = (data as any)?.masses?.name ?? null;

  return {
    id: data.id,
    mass_name,
    scheduled_starts_at: data.scheduled_starts_at,
    scheduled_ends_at: data.scheduled_ends_at,
  };
}
