import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only

type DetectionPayload = {
  stream_id?: string | null;
  people_count?: number | null;
  current_occupancy?: number | null;
  entry_count?: number | null;
  exit_count?: number | null;
  source?: string | null;        // 'simple' | 'zones'
  result?: any;                  // raw JSON
  detected_at?: string | number; // ISO string or epoch ms (optional)
  mass_id?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server env not configured" }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const slug = params.slug;
    const body = (await req.json()) as DetectionPayload;

    // 1) resolve org by slug
    const { data: org, error: orgErr } = await supabase
      .from("orgs")
      .select("id")
      .eq("slug", slug)
      .single();

    if (orgErr || !org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    // 2) normalize timestamp
    let detected_at: string | null = null;
    if (body.detected_at) {
      detected_at =
        typeof body.detected_at === "number"
          ? new Date(body.detected_at).toISOString()
          : new Date(body.detected_at).toISOString();
    }

    // 3) resolve current mass id if needed
    let massId = body.mass_id ?? null;
    if (!massId) {
      const { data: state } = await supabase
        .from("org_states")
        .select("current_mass_id")
        .eq("org_id", org.id)
        .maybeSingle();
      massId = state?.current_mass_id ?? null;
    }

    // 4) insert detections row (trigger in DB will update org_occupancy_latest)
    const insertRow = {
      org_id: org.id,
      stream_id: body.stream_id ?? null,
      people_count: body.people_count ?? null,
      current_occupancy: body.current_occupancy ?? null,
      entry_count: body.entry_count ?? null,
      exit_count: body.exit_count ?? null,
      source: body.source ?? "simple",
      result: body.result ?? null,
      mass_id: massId,
      ...(detected_at ? { detected_at } : {}),
    };

    const { data, error } = await supabase
      .from("detections")
      .insert(insertRow)
      .select("id, detected_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: data.id, detected_at: data.detected_at });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
