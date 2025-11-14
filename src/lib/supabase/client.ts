// src/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  return { url, anon };
}

export function createClient() {
  const { url, anon } = getSupabaseEnv();

  const hasUrl = !!url;
  const hasAnon = !!anon;

  if (!hasUrl || !hasAnon) {
    // During build (no window), don't crash
    if (typeof window === "undefined") {
      console.warn("[Supabase][client] Missing env vars during build.", {
        hasUrl,
        hasAnon,
      });
      return null as any;
    }

    // In the browser, now we want a clear error
    if (!hasUrl) throw new Error("Supabase URL missing in browser");
    if (!hasAnon) throw new Error("Supabase anon key missing in browser");
  }

  return createBrowserClient(url, anon);
}
