import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using service role for full access
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/org/[slug]/zones?stream_id=...
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("stream_id") || undefined;

    // Lookup org by slug
    const { data: org, error: orgError } = await supabase
      .from("orgs")
      .select("id")
      .eq("slug", slug)
      .single();
    if (orgError || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Fetch saved zones
    let query = supabase
      .from("door_zones")
      .select("id, name, x, y, width, height, stream_id, created_at, updated_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: true });
    if (streamId) query = query.eq("stream_id", streamId);

    const { data: rows, error } = await query;
    if (error) {
      console.error("Zones GET error:", error);
      return NextResponse.json({ error: "Failed to load zones" }, { status: 500 });
    }

    // Map DB -> UI format (display-space x1,y1,x2,y2)
    const zones = (rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      x1: r.x,
      y1: r.y,
      x2: r.x + r.width,
      y2: r.y + r.height,
      stream_id: r.stream_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return NextResponse.json({ zones, zones_count: zones.length });
  } catch (err) {
    console.error("Zones GET exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/org/[slug]/zones
// Body: { stream_id: string, zones: Array<{ id?: string, name: string, x1:number, y1:number, x2:number, y2:number }> }
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const body = await request.json();
    const { stream_id, zones } = body || {};
    const { slug } = await params;

    if (!Array.isArray(zones) || zones.length === 0) {
      return NextResponse.json({ error: "zones must be a non-empty array" }, { status: 400 });
    }

    // Lookup org
    const { data: org, error: orgError } = await supabase
      .from("orgs")
      .select("id")
      .eq("slug", slug)
      .single();
    if (orgError || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Replace existing zones for this org+stream if stream provided; otherwise replace all for org
    if (stream_id) {
      const { error: delErr } = await supabase
        .from("door_zones")
        .delete()
        .eq("org_id", org.id)
        .eq("stream_id", stream_id);
      if (delErr) {
        console.error("Zones delete error:", delErr);
        return NextResponse.json({ error: "Failed to replace zones" }, { status: 500 });
      }
    } else {
      const { error: delErr } = await supabase
        .from("door_zones")
        .delete()
        .eq("org_id", org.id);
      if (delErr) {
        console.error("Zones delete error:", delErr);
        return NextResponse.json({ error: "Failed to replace zones" }, { status: 500 });
      }
    }

    // Prepare rows for insert (store display-space x,y,width,height)
    const rowsToInsert = zones.map((z: any) => {
      const x = Math.min(z.x1, z.x2);
      const y = Math.min(z.y1, z.y2);
      const width = Math.abs(z.x2 - z.x1);
      const height = Math.abs(z.y2 - z.y1);
      return {
        org_id: org.id,
        name: z.name || "Zone",
        x,
        y,
        width,
        height,
        stream_id: stream_id || z.stream_id || null,
      };
    });

    const { data: inserted, error: insErr } = await supabase
      .from("door_zones")
      .insert(rowsToInsert)
      .select("id, name, x, y, width, height, stream_id, created_at, updated_at");
    if (insErr) {
      console.error("Zones insert error:", insErr);
      return NextResponse.json({ error: "Failed to save zones" }, { status: 500 });
    }

    return NextResponse.json({
      status: "success",
      saved: inserted?.length || 0,
      zones: (inserted || []).map((r) => ({
        id: r.id,
        name: r.name,
        x1: r.x,
        y1: r.y,
        x2: r.x + r.width,
        y2: r.y + r.height,
        stream_id: r.stream_id,
      })),
    });
  } catch (err) {
    console.error("Zones POST exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

