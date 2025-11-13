import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using service role for metrics access
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('location_id');

    // Await params before using
    const { slug } = await params;

    // Look up org id by slug
    const { data: org, error: orgError } = await supabase
      .from('orgs')
      .select('id')
      .eq('slug', slug)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Build base query for latest record
    let query = supabase
      .from('metrics_occ')
      .select('id, org_id, location_id, people_count, open_seats, observed_at')
      .eq('org_id', org.id)
      .order('observed_at', { ascending: false })
      .limit(1);

    if (locationId) {
      query = query.eq('location_id', locationId);
    }

    const { data: latestRows, error: latestError } = await query;
    if (latestError) {
      console.error('Occupancy latest query error:', latestError);
      return NextResponse.json({ error: 'Failed to query occupancy' }, { status: 500 });
    }

    const latest = latestRows && latestRows.length > 0 ? latestRows[0] : null;

    // Optionally return small history window
    let history: Array<{ t: string; people: number }> = [];
    if (latest) {
      let histQuery = supabase
        .from('metrics_occ')
        .select('people_count, observed_at')
        .eq('org_id', org.id)
        .order('observed_at', { ascending: false })
        .limit(20);
      if (locationId) {
        histQuery = histQuery.eq('location_id', locationId);
      }
      const { data: histRows } = await histQuery;
      if (histRows) {
        history = histRows
          .slice() // copy
          .reverse() // ascending time
          .map((r) => ({ t: r.observed_at as unknown as string, people: r.people_count as unknown as number }));
      }
    }

    return NextResponse.json({ latest, history });
  } catch (error) {
    console.error('Occupancy API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
