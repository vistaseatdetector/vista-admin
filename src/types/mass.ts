export type MassOccurrence = {
  id: string;
  mass_id: string;
  status: 'scheduled' | 'running' | 'live' | 'ended';
  starts_at: string | null;
  ends_at: string | null;
  schedule_id: string | null;
  started_by: string | null;
  org_id: string;
};

export type RpcGetCurrent = MassOccurrence | null;
