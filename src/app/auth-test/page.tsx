"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthTestPage() {
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("testpassword123");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const supabase = createClient();

  const testSignUp = async () => {
    setLoading(true);
    setResult("Testing signup...");
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setResult(`❌ Signup Error: ${error.message}`);
      } else if (data.user) {
        setResult(`✅ Signup successful! User ID: ${data.user.id}, Email: ${data.user.email}`);
      } else {
        setResult("⚠️ Signup completed but no user data returned");
      }
    } catch (err) {
      setResult(`❌ Network Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setLoading(false);
  };

  const testSignIn = async () => {
    setLoading(true);
    setResult("Testing signin...");
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setResult(`❌ Signin Error: ${error.message}`);
      } else if (data.user) {
        setResult(`✅ Signin successful! User ID: ${data.user.id}, Email: ${data.user.email}`);
      } else {
        setResult("⚠️ Signin completed but no user data returned");
      }
    } catch (err) {
      setResult(`❌ Network Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setLoading(false);
  };

  const testCurrentUser = async () => {
    setLoading(true);
    setResult("Testing current user...");
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) {
        setResult(`❌ Auth Error: ${error.message}`);
      } else if (user) {
        setResult(`✅ User authenticated! ID: ${user.id}, Email: ${user.email}`);
      } else {
        setResult("ℹ️ No user session found");
      }
    } catch (err) {
      setResult(`❌ Network Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setLoading(false);
  };

  const testSignOut = async () => {
    setLoading(true);
    setResult("Testing signout...");
    
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setResult(`❌ Signout Error: ${error.message}`);
      } else {
        setResult(`✅ Signout successful!`);
      }
    } catch (err) {
      setResult(`❌ Network Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Authentication Debug Tool</h1>
        
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Credentials</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={testCurrentUser}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Check Current User
            </button>
            <button
              onClick={testSignUp}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              Test Sign Up
            </button>
            <button
              onClick={testSignIn}
              disabled={loading}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
            >
              Test Sign In
            </button>
            <button
              onClick={testSignOut}
              disabled={loading}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
            >
              Test Sign Out
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <div className="bg-gray-100 p-4 rounded min-h-[100px] font-mono text-sm whitespace-pre-wrap">
            {loading ? "⏳ Loading..." : result || "Click a button above to test authentication"}
          </div>
        </div>

        <div className="mt-6">
          <a 
            href="/" 
            className="text-blue-600 hover:underline"
          >
            ← Back to main app
          </a>
        </div>
      </div>
    </div>
  );
}