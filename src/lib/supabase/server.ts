// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// NOTE: In Next 15 some environments type `cookies()` as Promise<ReadonlyRequestCookies>.
// Supabase's SSR client expects the *synchronous* cookie interface.
// The cast below normalizes it for TS without changing runtime behavior.
type ReadonlyRequestCookies =
  ReturnType<typeof cookies> extends Promise<infer P> ? P : ReturnType<typeof cookies>;

export function createClient() {
  const cookieStore = cookies() as unknown as ReadonlyRequestCookies;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );
}


