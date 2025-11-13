import { DateTime } from "luxon";

export function previousWeekendISO(dateISO: string, tz: string) {
  // Simple/robust: just minus one week; your weekend API already snaps by date internally
  return DateTime.fromISO(dateISO, { zone: tz }).minus({ weeks: 1 }).toISO()!;
}