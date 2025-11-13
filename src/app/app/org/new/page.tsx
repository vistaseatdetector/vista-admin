"use client";

import GlassPanel from "@/components/ui/GlassPanel";
import LiquidBlobs from "@/components/ui/LiquidBlobs";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function localSlugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function CreateOrgPage() {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSlug = useMemo(() => {
    const base = slugInput || name;
    return localSlugify(base);
  }, [name, slugInput]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const { data, error } = await supabase.rpc("create_org", {
      p_name: name,
      p_slug: slugInput || null,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    router.push(`/app/org/${data.slug}`);
  }

  return (
    <main className="relative min-h-screen text-white">
      {/* Background image + overlay */}
      <div className="absolute inset-0 -z-20">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900" />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Centered container */}
      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center p-6">
        <LiquidBlobs />
        <GlassPanel className="w-full max-w-xl p-6 sm:p-8">
          <h1 className="text-2xl font-semibold mb-4">Create an Organization</h1>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm mb-1 text-white/90">Organization name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g., St. Mark Catholic Church"
                className="w-full rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/60"
              />
            </div>

            <div>
              <label className="block text-sm mb-1 text-white/90">Custom slug (optional)</label>
              <input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="e.g., st-mark"
                className="w-full rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/60"
              />
              <p className="text-xs text-white/70 mt-1">
                Final URL preview: <code className="text-white/90">/app/org/{previewSlug || "…"}</code>
              </p>
            </div>

            {error && <p className="text-sm text-rose-200">{error}</p>}

            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-xl bg-white/90 px-4 py-2 font-medium text-gray-900 hover:bg-white disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create organization"}
            </button>
          </form>
        </GlassPanel>
      </div>
    </main>
  );
}