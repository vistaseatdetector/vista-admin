import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server-admin';

export async function GET() {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client is not configured on the server.' },
        { status: 500 }
      );
    }

    console.log('🔧 Testing Supabase write access...');
    // Avoid logging full URLs/keys in production
    console.log('URL present:', !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL));
    
    // Try to create the orgs table
    const { error: orgsError } = await supabaseAdmin
      .from('_query')
      .select('*')
      .limit(0);

    if (orgsError) {
      console.log('❌ Query error (expected):', orgsError.message);
    }

    // Try a raw SQL approach
    const { data: tables, error: tablesError } = await supabaseAdmin
      .rpc('sql', { query: `
        CREATE TABLE IF NOT EXISTS orgs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS metrics_occ (
          id SERIAL PRIMARY KEY,
          org_id UUID REFERENCES orgs(id),
          location_id UUID,
          people_count INTEGER NOT NULL,
          open_seats INTEGER,
          observed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          confidence DECIMAL(3,2),
          source VARCHAR(50) DEFAULT 'detection'
        );
      ` });

    return NextResponse.json({
      success: true,
      connection: {
        hasUrl: !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      tables: {
        data: tables,
        error: tablesError?.message || null
      }
    });

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
