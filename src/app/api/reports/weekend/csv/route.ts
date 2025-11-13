import { NextRequest } from "next/server";
import { DateTime } from "luxon";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { resolveOrgTz, orgNow, weekendWindowFor, weekendWindowForDate } from "@/lib/time/weekend";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  const dateISO = url.searchParams.get("date"); // optional

  if (!orgId) {
    return new Response("orgId is required", { status: 400 });
  }

  const supa = createServerSupabase();

  // org + tz
  const { data: org, error: orgErr } = await supa
    .from("orgs")
    .select("id,name,timezone")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) return new Response("Org not found", { status: 404 });
  const orgTz = resolveOrgTz(org.timezone);

  // weekend window
  const interval = dateISO
    ? weekendWindowForDate(dateISO, orgTz)
    : weekendWindowFor(orgNow(orgTz));
  const start = interval.start!;
  const end = interval.end!;

  // occurrences
  const { data: occs, error: occErr } = await supa
    .from("v_occurrences_with_weekend")
    .select("occurrence_id, org_id, mass_id, starts_at, headcount")
    .eq("org_id", orgId)
    .gte("starts_at", start.toUTC().toISO())
    .lt("starts_at", end.toUTC().toISO());
  if (occErr) return new Response(occErr.message, { status: 500 });

  // mass titles
  const massIds = Array.from(new Set((occs ?? []).map(o => o.mass_id)));
  const { data: masses } = await supa
    .from("masses")
    .select("id,title")
    .in("id", massIds.length ? massIds : ["00000000-0000-0000-0000-000000000000"]);
  const titleById = new Map<string, string | null>();
  (masses ?? []).forEach(m => titleById.set(m.id, m.title ?? null));

  // CSV
  const rows = (occs ?? []).map(o => {
    const local = DateTime.fromISO(o.starts_at, { zone: orgTz });
    return {
      weekend_start_local: start.toISO(),
      occurrence_start_local: local.toFormat("cccc, LLL d yyyy, h:mma"),
      mass_title: titleById.get(o.mass_id) ?? "",
      mass_id: o.mass_id,
      occurrence_id: o.occurrence_id,
      headcount: o.headcount ?? 0,
    };
  });

  const header = [
    "weekend_start_local",
    "occurrence_start_local",
    "mass_title",
    "mass_id",
    "occurrence_id",
    "headcount",
  ].join(",");

  const csv = [
    header,
    ...rows.map(r =>
      [
        r.weekend_start_local,
        `"${r.occurrence_start_local}"`,
        `"${(r.mass_title || "").replaceAll(`"`, `""`)}"`,
        r.mass_id,
        r.occurrence_id,
        r.headcount,
      ].join(",")
    ),
  ].join("\n");

  const filename = `Vista_Weekend_${DateTime.fromISO(start.toISO()!).toFormat("yyyy-LL-dd")}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
