// src/app/api/org/[slug]/occupancy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

type RouteParams = { params: { slug: string } };

export async function GET(
  req: NextRequest,
  { params }: RouteParams
) {
  const { slug } = params;

  const supabaseAdmin = createSupabaseAdminClient();

  if (!supabaseAdmin) {
    // Do NOT crash the build; fail at request time instead
    return NextResponse.json(
      { error: "Supabase admin client is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    // First get the org by slug to resolve org_id
    const { data: org, error: orgError } = await supabaseAdmin
      .from("orgs")
      .select("id")
      .eq("slug", slug)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Example: get the most recent occupancy record for this org.
    // Adjust this query to match however you actually want to compute "occupancy".
    const { data, error } = await supabaseAdmin
      .from("metrics_occ")
      .select("*")
      .eq("org_id", org.id)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch occupancy data:", error);
      return NextResponse.json(
        { error: "Failed to fetch occupancy data", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Occupancy API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
