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

// GET /api/org/[slug]/doors
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const supabaseAuth = createAuthClient();
    const service = supabaseAdmin;

    // Require auth
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Resolve org (supports orgs and organizations tables)
    const orgId = await getOrgIdBySlug(service, slug);
    if (!orgId) return NextResponse.json({ error: "Organization not found for slug", slug }, { status: 404 });

    // Only return this user's doors for the org
    const { data: rows, error } = await service
      .from("doors")
      .select("id, org_id, user_id, name, camera_id, camera_name, status, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });

    return NextResponse.json({ doors: rows || [] });
  } catch (err) {
    console.error("Doors GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/org/[slug]/doors
// Body: { name: string, camera_id: string, camera_name?: string, status?: 'active'|'inactive' }
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const body = await request.json();
    const { name, camera_id, camera_name, status } = body || {};
    if (!name || !camera_id) return NextResponse.json({ error: "name and camera_id are required" }, { status: 400 });

    const { slug } = await params;
    const supabaseAuth = createAuthClient();
    const service = supabaseAdmin;

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getOrgIdBySlug(service, slug);
    if (!orgId) return NextResponse.json({ error: "Organization not found for slug", slug }, { status: 404 });

    const insertRow = {
      org_id: orgId,
      user_id: user.id,
      name,
      camera_id,
      camera_name: camera_name ?? null,
      status: status ?? 'active',
    };

    const { data: inserted, error } = await service
      .from("doors")
      .insert(insertRow)
      .select("id, org_id, user_id, name, camera_id, camera_name, status, created_at, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    return NextResponse.json({ door: inserted });
  } catch (err) {
    console.error("Doors POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/org/[slug]/doors
// Body: { id: string }
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { slug } = await params;
    const supabaseAuth = createAuthClient();
    const service = supabaseAdmin;

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getOrgIdBySlug(service, slug);
    if (!orgId) return NextResponse.json({ error: "Organization not found for slug", slug }, { status: 404 });

    const { error } = await service
      .from("doors")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    return NextResponse.json({ status: "success" });
  } catch (err) {
    console.error("Doors DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
