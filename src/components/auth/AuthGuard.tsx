"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
  fallback?: React.ReactNode;
}

export default function AuthGuard({ 
  children, 
  redirectTo = "/login",
  fallback = <AuthLoadingScreen />
}: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (!isMounted) return;

        if (authError) {
          console.error("Auth error:", authError);
          setError(authError.message);
          setIsAuthenticated(false);
          return;
        }

        if (!user) {
          setIsAuthenticated(false);
          router.replace(redirectTo);
          return;
        }

        setIsAuthenticated(true);
      } catch (err) {
        if (!isMounted) return;
        console.error("Auth check failed:", err);
        setError("Failed to check authentication status");
        setIsAuthenticated(false);
      }
    };

    // Set timeout for loading state
    timeoutId = setTimeout(() => {
      if (isMounted && isAuthenticated === null) {
        setError("Authentication check is taking longer than expected. This might be due to network issues.");
        setIsAuthenticated(false);
      }
    }, 8000); // 8 second timeout

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      
      if (event === 'SIGNED_OUT' || !session) {
        setIsAuthenticated(false);
        router.replace(redirectTo);
      } else if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
      }
    });

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [router, supabase, redirectTo]);

  if (error) {
    return (
      <AuthErrorScreen 
        error={error} 
        onRetry={() => {
          setError(null);
          setIsAuthenticated(null);
        }}
        redirectTo={redirectTo}
      />
    );
  }

  if (isAuthenticated === null) {
    return fallback;
  }

  if (isAuthenticated === false) {
    return null; // Will redirect
  }

  return <>{children}</>;
}

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
        <p className="text-white/70">Checking authentication...</p>
      </div>
    </div>
  );
}

function AuthErrorScreen({ 
  error, 
  onRetry, 
  redirectTo 
}: { 
  error: string; 
  onRetry: () => void;
  redirectTo: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-red-400 mb-4">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white mb-2">Authentication Error</h1>
        <p className="text-white/70 mb-6">{error}</p>
        <div className="space-y-3">
          <button
            onClick={() => window.location.href = redirectTo}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Go to Login
          </button>
          <button
            onClick={() => window.location.href = "/demo"}
            className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
          >
            View Demo Page
          </button>
          <button
            onClick={onRetry}
            className="w-full px-4 py-2 text-white/70 hover:text-white transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}