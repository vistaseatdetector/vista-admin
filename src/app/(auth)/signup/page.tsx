"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string|null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setErr(error.message);
    router.push("/app");
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3 border p-6 rounded-xl">
        <h1 className="text-xl font-semibold">Create account</h1>
        <input
          className="w-full border rounded p-2"
          type="email" placeholder="you@example.com"
          value={email} onChange={(e)=>setEmail(e.target.value)}
        />
        <input
          className="w-full border rounded p-2"
          type="password" placeholder="8+ characters"
          value={password} onChange={(e)=>setPassword(e.target.value)}
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="w-full rounded bg-black text-white py-2">Create</button>
        <p className="text-sm text-gray-500">
          Have an account? <a className="underline" href="/login">Sign in</a>
        </p>
      </form>
    </main>
  );
}
