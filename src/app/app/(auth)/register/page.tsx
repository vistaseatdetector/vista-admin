"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app/churches";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setNotice(null);
    setLoading(true);

    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        data: { full_name: name },
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(
                next
              )}`
            : undefined,
      },
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      try {
        await supabase.from("profiles").upsert({
          id: data.user?.id,
          full_name: name,
          email,
        });
      } catch {
        // best effort
      }
      router.replace(next);
      return;
    }

    setNotice(
      "Check your inbox to confirm your email, then you’ll be redirected."
    );
    setLoading(false);
    router.replace(
      `/auth/check-email?next=${encodeURIComponent(next)}&email=${encodeURIComponent(
        email
      )}`
    );
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Create your account</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm">Name</span>
          <input
            className="w-full rounded-md border p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm">Email</span>
          <input
            className="w-full rounded-md border p-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm">Password</span>
          <input
            className="w-full rounded-md border p-2"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            minLength={6}
            required
          />
        </label>

        <button
          disabled={loading}
          className="w-full rounded-md bg-black py-2 text-white disabled:opacity-60"
          type="submit"
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        {err && <p className="text-sm text-red-600">{err}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
      </form>

      <p className="mt-4 text-sm">
        Already have an account?{" "}
        <a className="underline" href="/auth/login">
          Log in
        </a>
      </p>
    </div>
  );
}

