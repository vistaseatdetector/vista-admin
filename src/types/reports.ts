export type WeekendRow = {
  mass_id: string;
  mass_title: string | null;
  occurrence_id: string;
  occurrence_start_local: string;
  headcount: number;
};

export type WeekendPayload = {
  orgId: string;
  orgTimezone: string;
  weekendLabel: string;
  window: { startISO: string; endISO: string };
  masses: WeekendRow[];
  kpis: {
    total: number;
    avgPerMass: number;
    maxService: { label: string; headcount: number } | null;
  };
};

export type TrendWeekendTotalPoint = {
  weekend_start_local: string; // ISO
  total: number;
};

export type TrendPerMassPoint = {
  weekend_start_local: string;
  mass_id: string;
  mass_title: string | null;
  total: number;
};

export type TrendPayload =
  | { mode: 'weekend_total'; orgId: string; orgTimezone: string; points: TrendWeekendTotalPoint[] }
  | { mode: 'per_mass'; orgId: string; orgTimezone: string; points: TrendPerMassPoint[] };
