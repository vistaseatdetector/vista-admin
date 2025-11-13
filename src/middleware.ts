// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // TEMPORARY: Skip auth for background testing
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 DEV MODE: Skipping auth for', req.nextUrl.pathname);
    return res;
  }

  // Skip auth for public routes
  const publicRoutes = ['/login', '/signup', '/'];
  if (publicRoutes.includes(req.nextUrl.pathname)) {
    return res;
  }

  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    // If no session, redirect to login
    if (!session) {
      const redirectUrl = new URL('/login', req.url);
      redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    return res;
  } catch (error) {
    console.error('Middleware auth error:', error);
    // On error, redirect to login
    const redirectUrl = new URL('/login', req.url);
    return NextResponse.redirect(redirectUrl);
  }
}

// Protect all app pages and handle auth redirects
export const config = {
  matcher: ["/app/:path*", "/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

