// src/app/api/org/[slug]/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

type RouteParams = { params: { slug: string } };

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { slug } = params;

    const supabaseServiceRole = createSupabaseAdminClient();

    if (!supabaseServiceRole) {
      // Do NOT crash the build; fail at request time instead
      return NextResponse.json(
        { error: "Supabase admin client is not configured on the server." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { people_count, location_id, mass_id } = body;

    // Validate input
    if (typeof people_count !== "number") {
      return NextResponse.json(
        { error: "people_count must be a number" },
        { status: 400 }
      );
    }

    // Get the org by slug
    const { data: org, error: orgError } = await supabaseServiceRole
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

    // Resolve active mass if not provided
    let currentMassId = mass_id ?? null;
    if (!currentMassId) {
      const { data: state } = await supabaseServiceRole
        .from("org_states")
        .select("current_mass_id")
        .eq("org_id", org.id)
        .maybeSingle();

      currentMassId = state?.current_mass_id ?? null;
    }

    // Insert occupancy data
    const occupancyData = {
      org_id: org.id,
      location_id: location_id || null,
      people_count: people_count,
      open_seats: null, // Can be calculated later if needed
      observed_at: new Date().toISOString(),
      mass_id: currentMassId,
    };

    console.log("📊 Inserting occupancy data:", occupancyData);

    const { data: insertedData, error: insertError } = await supabaseServiceRole
      .from("metrics_occ")
      .insert(occupancyData)
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert occupancy data:", insertError);
      return NextResponse.json(
        {
          error: "Failed to save occupancy data",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    console.log("✅ Successfully inserted occupancy data:", insertedData);

    return NextResponse.json({
      success: true,
      data: insertedData,
    });
  } catch (error) {
    console.error("Ingest API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
