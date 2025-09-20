"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  theme: "system" | "light" | "dark";
  banner_path: string | null;
};

function applyTheme(theme: "system" | "light" | "dark") {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;

  const actual =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  root.classList.remove("light", "dark");
  root.classList.add(actual);
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const { org } = useParams<{ org: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState<string>("");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1) load session + profile
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user }, error: uerr } = await supabase.auth.getUser();
      if (uerr || !user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // fetch or create profile
      const { data: existing, error: perr } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!perr && existing) {
        const row = existing as ProfileRow;
        setDisplayName(row.display_name ?? "");
        setTheme(row.theme ?? "system");
        setBannerPath(row.banner_path ?? null);
        // prefetch signed URL if banner exists
        if (row.banner_path) {
          const { data: signed } = await supabase.storage
            .from("profile-banners")
            .createSignedUrl(row.banner_path, 60 * 30); // 30 min
          setBannerUrl(signed?.signedUrl ?? null);
        }
      } else {
        // Insert a default profile row for this user
        const insertRow = {
          user_id: user.id,
          display_name: "",
          theme: "system",
          banner_path: null as string | null,
        };
        await supabase.from("profiles").insert(insertRow).select().single();
      }

      setLoading(false);
    })();
  }, [supabase]);

  // 2) apply theme immediately when it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        applyTheme(theme);
      } catch {}
    }
  }, [theme]);

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
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      alert(`Save failed: ${error.message}`);
    } else {
      alert("Saved!");
    }
  }

  async function handleBannerPick(file: File) {
    if (!userId) return;

    // Path: <user_id>/banner.ext (keep extension)
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/banner.${ext}`;

    // we use upsert-like behavior: try remove old, then upload
    // (Alternatively, use upload with { upsert: true } if your SDK supports it.)
    // For simplicity we'll call upload and allow overwrite if enabled.
    const { data: uploadData, error: uerr } = await supabase.storage
      .from("profile-banners")
      .upload(path, file, { upsert: true });

    if (uerr) {
      alert(`Upload failed: ${uerr.message}`);
      return;
    }

    setBannerPath(uploadData?.path ?? path);

    // get fresh signed URL
    const { data: signed, error: serr } = await supabase.storage
      .from("profile-banners")
      .createSignedUrl(uploadData?.path ?? path, 60 * 30);

    if (!serr) {
      setBannerUrl(signed?.signedUrl ?? null);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-2 opacity-75">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-semibold">Profile</h1>
        <p className="text-sm opacity-80">
          Org: <span className="font-mono">{String(org)}</span>
        </p>
      </header>

      {/* Banner preview */}
      <section className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="aspect-[3/1] bg-black/5 dark:bg-white/5 relative">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt="Profile banner"
              className="absolute inset-0 h-full w-full object-cover"
            />
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
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleBannerPick(file);
            }}
          />
          <button
            className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload banner
          </button>
          {bannerPath && (
            <span className="text-xs opacity-70">Saved path: {bannerPath}</span>
          )}
        </div>
      </section>

      {/* Basic fields */}
      <section className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/15 bg-transparent"
            placeholder="Your name"
          />
        </label>

        {/* Theme toggle */}
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
          <p className="text-xs opacity-70">
            Saved to your profile and applied immediately.
          </p>
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
      </section>
    </div>
  );
}
