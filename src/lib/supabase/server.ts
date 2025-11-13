// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Synchronous server-side Supabase client for Route Handlers, Server Actions, and RSC.
 * No 'await' required when you call this in your API routes.
 */
export function createClient() {
  // In Next 15, cookies() can be typed oddly; at runtime it's fine to call it here
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            cookieStore.set({ name, value: "", ...options, expires: new Date(0) });
          } catch {
            // ignore if headers already sent
          }
        },
      },
    }
  );
}

/**
 * If you want a strictly read-only client for React Server Components,
 * you can export another function. But the single createClient() above
 * works for both GET routes and Server Actions.
 */


