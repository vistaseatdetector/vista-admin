// src/lib/supabase/server-admin.ts
import { createClient } from "@supabase/supabase-js";

type SupabaseAdminClient = ReturnType<typeof createClient>;

function getSupabaseAdminEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  // Prefer a service role key if you have one, otherwise fall back to anon
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  return { url, key };
}

export function createSupabaseAdminClient(): SupabaseAdminClient | null {
  const { url, key } = getSupabaseAdminEnv();

  const hasUrl = !!url;
  const hasKey = !!key;

  if (!hasUrl || !hasKey) {
    console.warn("[Supabase][admin] Missing env vars in createSupabaseAdminClient()", {
      hasUrl,
      hasKey,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    });

    // Do NOT throw here – this runs during build/module evaluation.
    return null as any;
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// Optional convenience export; now it won't throw, just be null if misconfigured.
export const supabaseAdmin = createSupabaseAdminClient();
// src/lib/supabase/server-admin.ts
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdminEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  // Prefer a service role key; fall back to anon if needed
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  return { url, key };
}

export function createSupabaseAdminClient() {
  const { url, key } = getSupabaseAdminEnv();

  const hasUrl = !!url;
  const hasKey = !!key;

  if (!hasUrl || !hasKey) {
    console.warn(
      "[Supabase][admin] Missing env vars in createSupabaseAdminClient()",
      { hasUrl, hasKey, VERCEL_ENV: process.env.VERCEL_ENV }
    );
    return null as any; // no throw on server
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export const supabaseAdmin = createSupabaseAdminClient();
