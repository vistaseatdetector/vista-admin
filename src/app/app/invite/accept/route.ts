import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  const supa = supabaseAdmin;

  const { data: invite, error } = await supa
    .from('org_invites')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !invite) {
    return NextResponse.redirect(new URL('/invite/invalid', req.url));
  }

  // Check session
  // (Using AdminClient, we don't have the user session here; you could instead make this a page and use client supabase)
  // Simpler pattern: just send them to login with a redirect back here
  const next = new URL(`/invite/accept?token=${token}`, req.url).toString();
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
}
