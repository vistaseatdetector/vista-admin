// Node runtime (needs server.js helpers)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const supabase = createClient();

  // Try a dedicated masses table first
  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .select("id")
    .eq("slug", slug)
    .single();

  if (orgErr || !org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  // Preferred: real masses table
  const { data: masses, error: massesErr } = await supabase
    .from("masses")
    .select("id,title,active")
    .eq("org_id", org.id)
    .order("title", { ascending: true });

  if (!massesErr && masses && masses.length) {
    return NextResponse.json(
      masses
        .filter(m => m.active ?? true)
        .map(m => ({ id: m.id, title: m.title ?? "Mass" }))
    );
  }

  // Fallback: distinct from occurrences
  const { data: occs, error: occErr } = await supabase
    .from("mass_occurrences")
    .select("mass_id,title")
    .eq("org_id", org.id);

  if (occErr) {
    return NextResponse.json({ error: occErr.message }, { status: 500 });
  }

  const byId = new Map<string, string>();
  for (const row of occs ?? []) {
    if (row.mass_id && !byId.has(row.mass_id)) {
      byId.set(row.mass_id, row.title ?? "Mass");
    }
  }

  return NextResponse.json(
    Array.from(byId.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title))
  );
}
