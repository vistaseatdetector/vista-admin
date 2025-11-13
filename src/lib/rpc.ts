import { createClient } from '@/lib/supabase/client';
import type { MassOccurrence, RpcGetCurrent } from '@/types/mass';

const supabase = createClient();

export async function rpcGetCurrentMassOccurrence(orgId: string) {
  const { data, error } = await supabase.rpc('get_current_mass_occurrence', { p_org_id: orgId });
  if (error) throw error;
  return data as RpcGetCurrent; // data is either an object or null
}

export async function rpcStartMassOccurrence(params: {
  massId: string;
  startedBy?: string | null;
  scheduleId?: string | null;
}) {
  const { massId, startedBy, scheduleId } = params;

  // If caller didn't pass startedBy, pull it from auth (safe default)
  let uid = startedBy ?? null;
  if (!uid) {
    const { data: auth } = await supabase.auth.getUser();
    uid = auth.user?.id ?? null;
  }

  const { data, error } = await supabase.rpc('start_mass_occurrence', {
    p_mass_id: massId,
    p_started_by: uid,
    p_schedule_id: scheduleId ?? null,
  });

  if (error) throw error;
  return data as MassOccurrence;
}

export async function rpcEndMassOccurrence(occurrenceId: string) {
  const { data, error } = await supabase.rpc('end_mass_occurrence', {
    p_occurrence_id: occurrenceId,
  });
  if (error) throw error;
  return data as MassOccurrence;
}
