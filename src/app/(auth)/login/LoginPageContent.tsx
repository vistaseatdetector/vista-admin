// app/(auth)/login/LoginPageContent.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import GlassPanel from "@/components/ui/GlassPanel";

export default function LoginPageContent() {
  const router = useRouter();
  const next = "/app"; // ← no useSearchParams; always go to /app for now

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

    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }

    router.replace(next);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <GlassPanel className="w-full max-w-md p-6 sm:p-8">
        {/* White logo, centered */}
        <div className="flex justify-center mb-6">
          <Image
            src="/vistalogowhite.png"
            alt="Vista"
            width={140}
            height={40}
            className="w-auto h-15 block select-none"
            draggable={false}
            priority
          />
        </div>

        <h1 className="text-center text-white/90 text-xl font-semibold mb-2">
          Welcome back
        </h1>
        <p className="text-center text-white/70 text-sm mb-6">
          Sign in to access your church dashboard
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="block text-white/80 text-sm mb-1">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-white/10 border border-white/25 text-white placeholder-white/60 px-3 py-2 outline-none focus:ring-2 focus:ring-white/40"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="block text-white/80 text-sm mb-1">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full rounded-xl bg-white/10 border border-white/25 text-white placeholder-white/60 px-3 py-2 outline-none focus:ring-2 focus:ring-white/40"
              placeholder="••••••••"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white/90 text-black font-medium px-4 py-2 hover:bg-white transition disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          {err && (
            <p className="mt-2 text-center text-red-200 text-sm">{err}</p>
          )}
        </form>

        <div className="flex items-center justify-between mt-4 text-sm">
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
