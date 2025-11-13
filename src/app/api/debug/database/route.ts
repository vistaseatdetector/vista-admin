import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Test database connectivity
    const { data: user } = await supabase.auth.getUser();
    console.log("User:", user?.user?.email);

    // Check if streams table exists
    const { data: streams, error: streamError } = await supabase
      .from("streams")
      .select("*")
      .limit(1);

    if (streamError) {
      return NextResponse.json({
        error: "Streams table issue",
        details: streamError,
        suggestion: "The 'streams' table might not exist. You may need to create it in your Supabase database."
      }, { status: 500 });
    }

    // Check orgs table
    const { data: orgs, error: orgError } = await supabase
      .from("orgs")
      .select("id, name, slug")
      .limit(5);

    if (orgError) {
      return NextResponse.json({
        error: "Orgs table issue", 
        details: orgError
      }, { status: 500 });
    }

    // Check locations table
    const { data: locations, error: locError } = await supabase
      .from("locations")
      .select("id, name, org_id")
      .limit(5);

    if (locError) {
      return NextResponse.json({
        error: "Locations table issue",
        details: locError
      }, { status: 500 });
    }

    // Check metrics_occ table
    const { data: metrics, error: metricsError } = await supabase
      .from("metrics_occ")
      .select("*")
      .limit(5);

    return NextResponse.json({
      success: true,
      tables: {
        streams: { exists: true, count: streams?.length || 0 },
        orgs: { exists: true, count: orgs?.length || 0 },
        locations: { exists: true, count: locations?.length || 0 },
        metrics_occ: { 
          exists: !metricsError, 
          count: metrics?.length || 0,
          error: metricsError ? metricsError.message : null
        }
      },
      sample_data: {
        orgs: orgs?.slice(0, 2),
        locations: locations?.slice(0, 2),
        metrics: metrics?.slice(0, 2)
      }
    });

  } catch (error) {
    console.error("Database test error:", error);
    return NextResponse.json({
      error: "Database connection failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}