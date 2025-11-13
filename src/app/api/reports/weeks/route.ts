import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { DateTime } from "luxon";
import { resolveOrgTz, orgNow, weekendWindowFor } from "@/lib/time/weekend";
import { createClient as createServerSupabase } from "@/lib/supabase/server";


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
    const orgId = url.searchParams.get("orgId");
    const count = Math.max(1, Math.min(20, Number(url.searchParams.get("count")) || 10)); // default 10 weekends

    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const supa = createServerSupabase();


    // 1) org timezone
    const { data: org, error: orgErr } = await supa
      .from("orgs")
      .select("id, timezone")
      .eq("id", orgId)
      .single();

    if (orgErr || !org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    const orgTz = resolveOrgTz(org.timezone);

    // 2) Build the last N weekend start anchors (local Sat 12:00)
    const now = orgNow(orgTz);
    const curWk = weekendWindowFor(now);
    const anchorsLocal: DateTime[] = [];
    for (let i = 0; i < count + 1; i++) {
      anchorsLocal.push(curWk.start!.minus({ weeks: i }));
    }
    // We'll compute totals for N+1 weekends so we can compute Δ against the previous one.

    const startRange = anchorsLocal[anchorsLocal.length - 1]; // oldest
    const endRange = curWk.end!; // include through current window end

    // 3) Pull occurrences in range
    const { data: occs, error: occErr } = await supa
      .from("v_occurrences_with_weekend")
      .select("starts_at, headcount, org_timezone")
      .eq("org_id", orgId)
      .gte("starts_at", startRange.toUTC().toISO())
      .lt("starts_at", endRange.toUTC().toISO());

    if (occErr) return NextResponse.json({ error: occErr.message }, { status: 500 });

    // 4) Aggregate totals per weekend anchor (local)
    const totals = new Map<string, number>(); // key = weekend_start_local ISO
    function weekendKeyISO(localISO: string) {
      const dt = DateTime.fromISO(localISO, { zone: orgTz });
      const w = weekendWindowFor(dt);
      return w.start!.toISO({ suppressMilliseconds: true })!;
    }

    for (const o of (occs ?? [])) {
      const localISO = DateTime.fromISO(o.starts_at, { zone: orgTz }).toISO()!;
      const key = weekendKeyISO(localISO);
      totals.set(key, (totals.get(key) ?? 0) + (o.headcount ?? 0));
    }

    // 5) Build payload newest→oldest (excluding the very last extra which is only for delta)
    type Row = { weekend_start_local: string; total: number; delta_vs_prev: number | null; };
    const rows: Row[] = [];
    for (let i = 0; i < count; i++) {
      const wk = curWk.start!.minus({ weeks: i });
      const key = wk.toISO({ suppressMilliseconds: true })!;
      const total = totals.get(key) ?? 0;
      // previous weekend key
      const prevKey = wk.minus({ weeks: 1 }).toISO({ suppressMilliseconds: true })!;
      const prevTotal = totals.get(prevKey);
      const delta = prevTotal != null ? total - prevTotal : null;
      rows.push({ weekend_start_local: key, total, delta_vs_prev: delta });
    }

    return NextResponse.json({
      orgId,
      orgTimezone: orgTz,
      weekends: rows, // newest first
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}