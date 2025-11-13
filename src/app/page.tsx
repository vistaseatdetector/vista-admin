"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const checkAuth = async () => {
      try {
        // Add retry logic for network issues
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            
            if (!isMounted) return;

            if (authError) {
              console.error("Auth error:", authError);
              setError(authError.message);
              setIsLoading(false);
              return;
            }

            if (!user) {
              // No user, redirect to login
              router.replace("/login");
              return;
            }

            // User is authenticated, redirect to app
            router.replace("/app");
            return;
          } catch (err) {
            retryCount++;
            if (retryCount >= maxRetries) {
              throw err;
            }
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Auth check failed:", err);
        setError("Failed to check authentication status. Please check your internet connection.");
        setIsLoading(false);
      }
    };

    // Set timeout for loading state
    timeoutId = setTimeout(() => {
      if (isMounted && isLoading) {
        setError("Authentication check is taking longer than expected. This might be due to network issues.");
        setIsLoading(false);
      }
    }, 8000); // 8 second timeout

    checkAuth();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [router, supabase, isLoading]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
  };

  if (error) {
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
              onClick={() => window.location.href = "/login"}
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
              onClick={handleRetry}
              className="w-full px-4 py-2 text-white/70 hover:text-white transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
        <p className="text-white/70">Checking authentication...</p>
        <p className="text-white/50 text-sm mt-2">This should only take a moment</p>
      </div>
    </div>
  );
}