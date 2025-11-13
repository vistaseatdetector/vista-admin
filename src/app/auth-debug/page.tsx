"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthDebugPage() {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log("Checking auth state...");
        
        // Get session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log("Session:", session, "Error:", sessionError);
        setSession(session);
        
        // Get user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        console.log("User:", user, "Error:", userError);
        setUser(user);
        
        if (sessionError || userError) {
          setError(sessionError?.message || userError?.message || "Unknown auth error");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setError(err instanceof Error ? err.message : "Auth check failed");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event, session);
      setSession(session);
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: "test@example.com", // Replace with actual test credentials
        password: "testpassword123"
      });
      
      console.log("Login result:", data, error);
      
      if (error) {
        setError(error.message);
      } else {
        router.push("/app");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError(error.message);
      } else {
        setUser(null);
        setSession(null);
        router.push("/login");
      }
    } catch (err) {
      console.error("Logout error:", err);
      setError(err instanceof Error ? err.message : "Logout failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Checking authentication...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-2xl mx-auto bg-slate-800 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Authentication Debug</h1>
        
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6">
            Error: {error}
          </div>
        )}
        
        <div className="space-y-4">
          <div className="bg-slate-700 p-4 rounded">
            <h3 className="text-white font-semibold mb-2">Authentication Status</h3>
            <p className="text-white/80">
              User: {user ? "✅ Authenticated" : "❌ Not authenticated"}
            </p>
            <p className="text-white/80">
              Session: {session ? "✅ Active" : "❌ No session"}
            </p>
          </div>
          
          {user && (
            <div className="bg-slate-700 p-4 rounded">
              <h3 className="text-white font-semibold mb-2">User Info</h3>
              <pre className="text-white/80 text-sm overflow-auto">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
          )}
          
          {session && (
            <div className="bg-slate-700 p-4 rounded">
              <h3 className="text-white font-semibold mb-2">Session Info</h3>
              <pre className="text-white/80 text-sm overflow-auto">
                {JSON.stringify(session, null, 2)}
              </pre>
            </div>
          )}
          
          <div className="flex gap-4">
            {!user ? (
              <button
                onClick={handleLogin}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Test Login
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Logout
              </button>
            )}
            
            <button
              onClick={() => router.push("/app")}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Try App Access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}