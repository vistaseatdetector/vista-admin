import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

async function getOrgIdBySlug(service: SupabaseClient, slug: string) {
  // Try primary orgs table first
  let { data: org, error: orgErr } = await service
    .from("orgs")
    .select("id")
    .eq("slug", slug)
    .single();
  if (org && !orgErr) return org.id as string;

  // Fallback to legacy organizations table
  const { data: legacy, error: legacyErr } = await service
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();
  if (legacy && !legacyErr) return legacy.id as string;

  return null;
}

// POST /api/org/[slug]/streams
// Body: { name: string, kind: 'webcam'|'rtsp'|'camera', url: string }
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { name, kind, url } = await request.json();
    if (!name || !kind || !url) {
      return NextResponse.json({ error: "name, kind, and url are required" }, { status: 400 });
    }

    const { slug } = await params;
    const supabaseAuth = createAuthClient();
    const service = supabaseAdmin;

    // Require user session (so only logged-in users can add)
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      // In local/dev, allow inserts without a session to unblock setup
      const allowUnauth = process.env.ALLOW_UNAUTH_STREAM_INSERT === '1' || process.env.NODE_ENV !== 'production';
      if (!allowUnauth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Resolve org id from slug (supports orgs or organizations)
    const orgId = await getOrgIdBySlug(service, slug);
    if (!orgId) return NextResponse.json({ error: "Organization not found for slug", slug }, { status: 404 });

    const insert = {
      org_id: orgId,
      name: String(name).trim(),
      kind: String(kind).trim(),
      url: String(url).trim(),
    } as const;

    const { data, error } = await service
      .from("streams")
      .insert(insert)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });

    return NextResponse.json({ stream: data });
  } catch (err) {
    console.error("Streams POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
