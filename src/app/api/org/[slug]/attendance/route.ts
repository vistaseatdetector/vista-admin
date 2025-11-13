import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // RLS protects access to this org
  const { data: org, error: oErr } = await supabase
    .from("orgs").select("id, name").eq("slug", slug).maybeSingle();
  if (oErr) return new NextResponse(oErr.message, { status: 500 });
  if (!org) return new NextResponse("Not found", { status: 404 });

  const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("metrics_occ")
    .select("observed_at, people_count, open_seats, location_id")
    .eq("org_id", org.id)
    .gte("observed_at", sinceISO)
    .order("observed_at");
  if (error) return new NextResponse(error.message, { status: 500 });

  // Optional: join location names (client-side lookup is fine too)
  const { data: locs } = await supabase
    .from("locations").select("id, name").eq("org_id", org.id);

  const nameById = new Map(locs?.map((l) => [l.id, l.name]) ?? []);

  const rows = (data ?? []).map((r) =>
    `${new Date(r.observed_at as string).toISOString()},${nameById.get(String(r.location_id)) ?? ""},${r.people_count},${r.open_seats ?? ""}`
  );
  const csv = ["timestamp,location,people_count,open_seats", ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${slug}-attendance-24h.csv"`
    }
  });
}
