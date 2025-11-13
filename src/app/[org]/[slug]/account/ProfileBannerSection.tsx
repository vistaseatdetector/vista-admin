"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  theme: "system" | "light" | "dark";
  banner_path: string | null;
};

function applyTheme(theme: "system" | "light" | "dark") {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const actual = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(actual);
}

export default function ProfileBannerSection() {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data: existing } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)          // If you used Option B (id instead of user_id), change to .eq("id", user.id)
        .single();

      if (existing) {
        const row = existing as ProfileRow;
        setDisplayName(row.display_name ?? "");
        setTheme(row.theme ?? "system");
        setBannerPath(row.banner_path ?? null);
        if (row.banner_path) {
          const { data: signed } = await supabase
            .storage.from("profile-banners")
            .createSignedUrl(row.banner_path, 60 * 30);
          setBannerUrl(signed?.signedUrl ?? null);
        }
      } else {
        await supabase.from("profiles").insert({
          user_id: user.id,              // If using Option B, use id: user.id
          display_name: "",
          theme: "system",
          banner_path: null
        }).select().single();
      }
      setLoading(false);
    })();
  }, [supabase]);

  useEffect(() => { if (typeof window !== "undefined") applyTheme(theme); }, [theme]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        theme,
        banner_path: bannerPath,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);            // If using Option B, change to .eq("id", userId)
    setSaving(false);
    if (error) alert(`Save failed: ${error.message}`);
  }

  async function handleBannerPick(file: File) {
    if (!userId) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/banner.${ext}`;

    const { data: up, error } = await supabase
      .storage.from("profile-banners")
      .upload(path, file, { upsert: true });
    if (error) { alert(`Upload failed: ${error.message}`); return; }

    setBannerPath(up?.path ?? path);
    const { data: signed } = await supabase
      .storage.from("profile-banners")
      .createSignedUrl(up?.path ?? path, 60 * 30);
    setBannerUrl(signed?.signedUrl ?? null);
  }

  if (loading) return <p className="opacity-70">Loading account…</p>;

  return (
    <section id="profile-banner" className="space-y-6">
      <h2 className="text-xl font-semibold">Appearance & Banner</h2>

      {/* Banner */}
      <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="aspect-[3/1] bg-black/5 dark:bg-white/5 relative">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="Profile banner"
              className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm opacity-60">
              No banner yet
            </div>
          )}
        </div>
        <div className="p-4 flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerPick(f); }}
          />
          <button
            className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload banner
          </button>
          {bannerPath && <span className="text-xs opacity-70">Saved path: {bannerPath}</span>}
        </div>
      </div>

      {/* Basic fields + Theme */}
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/15 bg-transparent"
            placeholder="Your name"
          />
        </label>

        <div className="grid gap-2">
          <span className="text-sm">Theme</span>
          <div className="flex flex-wrap gap-2">
            {(["system", "light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-2 rounded-xl border ${
                  theme === t
                    ? "border-blue-500 ring-1 ring-blue-500/30"
                    : "border-black/10 dark:border-white/15"
                }`}
                aria-pressed={theme === t}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs opacity-70">Applies immediately and saves to your profile.</p>
        </div>

        <div className="pt-2">
          <button
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}
