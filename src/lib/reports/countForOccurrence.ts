"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

type OccurrenceWindow = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
};

/**
 * Best-effort people counter for a mass occurrence.
 * Returns 0 if required data tables are unavailable or query fails.
 */
export async function countForOccurrence(
  supabase: SupabaseClient,
  orgId: string,
  occurrence: OccurrenceWindow
): Promise<number> {
  if (!occurrence.starts_at) return 0;

  const rangeStart = occurrence.starts_at;
  const rangeEnd = occurrence.ends_at ?? new Date().toISOString();

  try {
    const query = supabase
      .from("person_events")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("occurred_at", rangeStart)
      .lte("occurred_at", rangeEnd)
      .eq("event_type", "in");

    if (occurrence.id) {
      query.eq("mass_occurrence_id", occurrence.id);
    }

    const { count, error } = await query;
    if (error || typeof count !== "number") {
      return 0;
    }
    return count;
  } catch {
    return 0;
  }
}
