export const OCC_TABLE = process.env.NEXT_PUBLIC_OCC_TABLE ?? "occupancy";
export const OCC_COLUMNS = {
  observedAt: "observed_at",
  peopleCount: "people_count",
  openSeats: "open_seats",
  orgId: "org_id",
} as const;
