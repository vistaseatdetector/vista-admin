"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import GlassPanel from "@/components/ui/GlassPanel";

export default function LoginPage() {
  const router = useRouter();
  const qs = useSearchParams();
  const next = qs.get("next") || "/app";

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });

    if (error) {
      setLoading(false);
      setErr(error.message);
      return;
    }

    router.replace(next);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <GlassPanel className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex justify-center">
          <img
            src="/vistalogowhite.png"
            alt="Vista"
            className="block h-15 w-auto select-none"
            draggable={false}
          />
        </div>

        <h1 className="mb-2 text-center text-xl font-semibold text-white/90">
          Welcome back
        </h1>
        <p className="mb-6 text-center text-sm text-white/70">
          Sign in to access your church dashboard
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm text-white/80">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/40"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-white/80">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/40"
              placeholder="••••••••"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white/90 px-4 py-2 font-medium text-black transition hover:bg-white disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          {err && (
            <p className="mt-2 text-center text-sm text-red-200">{err}</p>
          )}
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/reset" className="text-white/80 hover:text-white">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-white/80 hover:text-white">
            Create account
          </Link>
        </div>
      </GlassPanel>
    </div>
  );
}

