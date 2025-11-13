import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'missing';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'missing';
  const srv  = process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing';
  return NextResponse.json({
    supabase_url_tail: url.slice(-24), // last part only, safe
    anon_len: anon.length,
    service_len: srv.length
  });
}

