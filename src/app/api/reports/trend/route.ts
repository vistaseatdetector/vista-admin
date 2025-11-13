import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { resolveOrgTz, orgNow, weekendWindowFor } from '@/lib/time/weekend';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from "@/lib/supabase/server";


type Mode = 'weekend_total' | 'per_mass';

type TrendPointWeekendTotal = {
  weekend_start_local: string;   // ISO in org TZ at Sat 12:00
  total: number;
};

type TrendPointPerMass = {
  weekend_start_local: string;   // ISO in org TZ at Sat 12:00
  mass_id: string;
  mass_title: string | null;
  total: number;
};

type TrendResponse =
  | { mode: 'weekend_total'; orgId: string; orgTimezone: string; points: TrendPointWeekendTotal[] }
  | { mode: 'per_mass'; orgId: string; orgTimezone: string; points: TrendPointPerMass[] };

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { cookies: { get: (k: string) => cookieStore.get(k)?.value } }
  );
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    const mode = (url.searchParams.get('mode') as Mode) || 'weekend_total';
    const weeks = Math.max(1, Math.min(52, Number(url.searchParams.get('weeks')) || 5)); // default ~month
    const massId = url.searchParams.get('massId'); // optional filter when mode=per_mass

    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

   const supa = createServerSupabase();


    // 1) org timezone
    const { data: org, error: orgErr } = await supa
      .from('orgs')
      .select('id, timezone')
      .eq('id', orgId)
      .single();

    if (orgErr || !org) {
      return NextResponse.json({ error: 'Org not found' }, { status: 404 });
    }
    const orgTz = resolveOrgTz(org.timezone);

    // 2) date range: from start of the weekend N-1 weeks ago to end of current weekend
    const now = orgNow(orgTz);
    const currentWeekend = weekendWindowFor(now);
    const end = currentWeekend.end!;
    const start = currentWeekend.start!.minus({ weeks: weeks - 1 }); // include N weekends

    // 3) get occurrences within range
    const { data: occs, error: occErr } = await supa
      .from('v_occurrences_with_weekend')
      .select('occurrence_id, org_id, mass_id, starts_at, headcount, org_timezone')
      .eq('org_id', orgId)
      .gte('starts_at', start.toUTC().toISO())
      .lt('starts_at', end.toUTC().toISO());

    if (occErr) {
      return NextResponse.json({ error: occErr.message }, { status: 500 });
    }

    if (!occs || occs.length === 0) {
      if (mode === 'per_mass') {
        const payload: TrendResponse = { mode, orgId, orgTimezone: orgTz, points: [] };
        return NextResponse.json(payload);
      } else {
        const payload: TrendResponse = { mode: 'weekend_total', orgId, orgTimezone: orgTz, points: [] };
        return NextResponse.json(payload);
      }
    }

    // 4) weekend bucket key = Saturday 12:00 (local), represented as ISO in org TZ
    function weekendKeyISO(localISO: string) {
      // Convert occurrence local time to DateTime to derive its weekend anchor.
      const dt = DateTime.fromISO(localISO, { zone: orgTz });
      // Compute this occurrence's weekend window using the same rule, then return start ISO.
      const w = weekendWindowFor(dt);
      return w.start!.toISO({ suppressMilliseconds: true });
    }

    // Preload Mass titles if needed
    let titleByMass = new Map<string, string | null>();
    if (mode === 'per_mass') {
      const setMassIds = Array.from(new Set(occs.map(o => o.mass_id)));
      const filterIds = massId ? setMassIds.filter(id => id === massId) : setMassIds;
      if (filterIds.length) {
        const { data: masses, error: massErr } = await supa
          .from('masses')
          .select('id, title')
          .in('id', filterIds);
        if (massErr) {
          return NextResponse.json({ error: massErr.message }, { status: 500 });
        }
        masses?.forEach(m => titleByMass.set(m.id, m.title ?? null));
      }
    }

    // 5) aggregate
    if (mode === 'weekend_total') {
      const totals = new Map<string, number>(); // key = weekend_start_local ISO
      for (const o of occs) {
        // starts_at is timestamptz; convert to org local ISO first
        const localISO = DateTime.fromISO(o.starts_at, { zone: orgTz }).toISO();
        const key = weekendKeyISO(localISO!);
        totals.set(key, (totals.get(key) ?? 0) + (o.headcount ?? 0));
      }

      // Make an array of requested N weekends (including missing = 0)
      const points: TrendPointWeekendTotal[] = [];
      for (let i = weeks - 1; i >= 0; i--) {
        const wkStart = currentWeekend.start!.minus({ weeks: i });
        const wkKey = wkStart.toISO({ suppressMilliseconds: true });
        points.push({
          weekend_start_local: wkKey!,
          total: totals.get(wkKey!) ?? 0,
        });
      }

      const payload: TrendResponse = { mode: 'weekend_total', orgId, orgTimezone: orgTz, points };
      return NextResponse.json(payload);
    } else {
      // per_mass
      const byKeyMass = new Map<string, number>(); // key = `${weekendISO}::${mass_id}`
      for (const o of occs) {
        if (massId && o.mass_id !== massId) continue;
        const localISO = DateTime.fromISO(o.starts_at, { zone: orgTz }).toISO();
        const keyISO = weekendKeyISO(localISO!);
        const k = `${keyISO}::${o.mass_id}`;
        byKeyMass.set(k, (byKeyMass.get(k) ?? 0) + (o.headcount ?? 0));
      }

      const points: TrendPointPerMass[] = [];
      const massIds = Array.from(new Set(
        Array.from(byKeyMass.keys()).map(k => k.split('::')[1])
      ));

      // Generate rows for requested weekends; include zeroes for missing
      for (let i = weeks - 1; i >= 0; i--) {
        const wkStart = currentWeekend.start!.minus({ weeks: i });
        const wkISO = wkStart.toISO({ suppressMilliseconds: true })!;
        for (const mId of massIds) {
          const total = byKeyMass.get(`${wkISO}::${mId}`) ?? 0;
          points.push({
            weekend_start_local: wkISO,
            mass_id: mId,
            mass_title: titleByMass.get(mId) ?? null,
            total,
          });
        }
      }

      const payload: TrendResponse = { mode: 'per_mass', orgId, orgTimezone: orgTz, points };
      return NextResponse.json(payload);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}