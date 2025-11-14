// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function getSupabaseEnv() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseAnon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  return { supabaseUrl, supabaseAnon };
}

/**
 * Synchronous server-side Supabase client for Route Handlers, Server Actions, and RSC.
 * No 'await' required when you call this in your API routes.
 */
export function createClient() {
  const cookieStore = cookies();
  const { supabaseUrl, supabaseAnon } = getSupabaseEnv();

  const hasUrl = !!supabaseUrl;
  const hasAnon = !!supabaseAnon;

  if (!hasUrl || !hasAnon) {
    console.warn("[Supabase][server] Missing env vars in createClient()", {
      hasUrl,
      hasAnon,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    });

    // Do NOT throw here – this runs during Next build / "Collecting page data"
    return null as any;
  }

  return createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name: string) {
        // @ts-expect-error — cookieStore matches Supabase's expected shape at runtime
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          // @ts-expect-error
          cookieStore.set({ name, value, ...options });
        } catch {
          // ignore if headers already sent
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          // @ts-expect-error
          cookieStore.set({
            name,
            value: "",
            ...options,
            expires: new Date(0),
          });
        } catch {
          // ignore if headers already sent
        }
      },
    },
  });
}
