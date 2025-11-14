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
  // These env vars are compiled into the client bundle, not read at build time.
  // But during the Vercel "Collecting page data" phase, they resolve to empty strings,
  // so we avoid hard-throwing before hydration.

  const { url, anon } = getSupabaseEnv();

  const hasUrl = !!url;
  const hasAnon = !!anon;

  if (!hasUrl || !hasAnon) {
    // During static build / prerender, avoid killing the build.
    if (typeof window === "undefined") {
      console.warn("[Supabase][client] Missing env vars during build.", {
        hasUrl,
        hasAnon,
      });
      return null as any; // stub
    }

    // Browser runtime: now we want a hard error so it's clear something is wrong.
    if (!hasUrl) throw new Error("supabaseUrl is required.");
    if (!hasAnon) throw new Error("supabaseKey is required.");
  }

  return createBrowserClient(url, anon);
}
