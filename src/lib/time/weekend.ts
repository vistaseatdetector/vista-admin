// src/lib/time/weekend.ts
import { DateTime, Interval } from 'luxon';

export function resolveOrgTz(orgTz?: string) {
  return orgTz && orgTz.trim().length > 0 ? orgTz : 'America/Chicago'; // fallback
}

export function orgNow(orgTz?: string) {
  return DateTime.now().setZone(resolveOrgTz(orgTz));
}

/**
 * Returns the weekend window [start, end) for the given "now", using
 * a boundary at Saturday 12:00 PM local time and ending Monday 4:00 AM.
 */
export function weekendWindowFor(now: DateTime) {
  const saturdayNoon = now
    .set({ weekday: 6, hour: 12, minute: 0, second: 0, millisecond: 0 }); // Sat 12:00

  // If we're before Sat noon, use last week's Sat noon; otherwise, use this one.
  const start = now < saturdayNoon ? saturdayNoon.minus({ weeks: 1 }) : saturdayNoon;

  // End Monday 04:00 (catches late services & keeps a stable window)
  const end = start.plus({ days: 2, hours: 16 }); // +2d16h = Mon 04:00

  return Interval.fromDateTimes(start, end);
}

/** Convenience: compute weekend window for a specific ISO date (in org TZ). */
export function weekendWindowForDate(dateISO: string, orgTz?: string) {
  const d = DateTime.fromISO(dateISO, { zone: resolveOrgTz(orgTz) });
  return weekendWindowFor(d);
}

/** Human label like "Weekend of Sep 27–28, 2025". */
export function labelWeekend(intv: Interval) {
  const start = intv.start!;
  // Saturday + Sunday are the “weekend days” we show in the label
  const sat = start;                               // Sat 12:00 anchor
  const sun = sat.plus({ days: 1 }).startOf('day'); // Sunday (00:00 local)

  // If the weekend crosses months, include months both sides
  const sameMonth = sat.month === sun.month && sat.year === sun.year;

  const satLabel = sat.toFormat("LLL d");
  const sunLabel = sameMonth ? sun.toFormat("d, yyyy") : sun.toFormat("LLL d, yyyy");
  return `Weekend of ${satLabel}–${sunLabel}`;
}

/** Quick boolean for UI: have we flipped to the "new weekend" yet? */
export function isAfterSaturdayNoon(now: DateTime) {
  const saturdayNoon = now.set({ weekday: 6, hour: 12, minute: 0, second: 0, millisecond: 0 });
  return now >= saturdayNoon;
}