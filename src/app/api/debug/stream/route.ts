// src/app/api/debug/stream/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();

  if (!supabaseAdmin) {
    // Fail at *request time*, not build time, if envs are misconfigured
    return NextResponse.json(
      { error: "Supabase admin client is not configured on the server." },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("streams")
    .select("id, ingest_secret, is_active")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ data, error });
}
