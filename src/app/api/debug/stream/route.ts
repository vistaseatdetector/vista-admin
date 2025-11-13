import { NextRequest, NextResponse } from 'next/server';
// If this import errors, replace with the relative path shown below
import { supabaseAdmin } from '@/lib/supabase/server-admin';
// If the alias above doesn't work in your project, use this instead:
// import { supabaseAdmin } from '../../../lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('streams')
    .select('id, ingest_secret, is_active')
    .eq('id', id)
    .maybeSingle();

  return NextResponse.json({ data, error });
}
