"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GlassCard from "@/components/ui/GlassCard";
import {
  LogOut,
  Shield,
  Trash2,
  KeyRound,
  User2,
  Building2,
  MonitorCog,
  Search,
  X,
} from "lucide-react";

type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null; // kept as DIGITS in state (e.g., "4433559576")
  avatar_url: string | null;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  role: string | null;
  joined_at: string | null;
};

// -------------------- Phone helpers (US-centric) --------------------
function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}
// Pretty: (443) 355-9576 (accepts an optional leading "1")
function formatUSPhonePretty(input: string) {
  const d = digitsOnly(input).slice(0, 11);
  const core = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (core.length === 0) return "";
  if (core.length <= 3) return core;
  if (core.length <= 6) return `(${core.slice(0, 3)}) ${core.slice(3)}`;
  return `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6, 10)}`;
}
// Normalize to E.164 (+1XXXXXXXXXX) if valid US length
function toUS_E164(input: string) {
  const d = digitsOnly(input);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null; // invalid for strict E.164-US
}

export default function AccountPage() {
  const { slug } = useParams<{ slug: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);

  // orgs
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [notifEmail, setNotifEmail] = useState(true);

  // JOIN MODAL STATE
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setLoading(false);
        setOrgsLoading(false);
        return;
      }

      // Load profile row
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, updated_at")
        .eq("id", user.id)
        .maybeSingle();

      // Fallback to user_metadata if profiles row missing fields
      const meta = user.user_metadata ?? {};
      const fallbackFullName =
        prof?.full_name ?? meta.full_name ?? meta.display_name ?? "";
      const fallbackPhoneRaw = prof?.phone ?? meta.phone ?? "";
      const fallbackPhoneDigits = digitsOnly(fallbackPhoneRaw); // keep digits in state

      setProfile({
        id: user.id,
        full_name: fallbackFullName,
        phone: fallbackPhoneDigits,
        avatar_url: prof?.avatar_url ?? null,
        email: user.email ?? "",
      });

      // Load org memberships — try view first (filtered by user), then fallback join
      setOrgsLoading(true);
      setOrgsError(null);

      // 1) Try org_memberships_view if it exists
      const { data: membershipsView, error: viewErr } = await supabase
        .from("org_memberships_view")
        .select("id, name, slug, role, joined_at, user_id")
        .eq("user_id", user.id);

      if (!viewErr && membershipsView) {
        const mapped = (membershipsView as any[]).map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          role: r.role ?? null,
          joined_at: r.joined_at ?? null,
        })) as OrgRow[];
        setOrgs(mapped);
        setOrgsLoading(false);
        setLoading(false);
        return;
      }

      // 2) Fallback: org_members → orgs join
      const { data: fallback, error: joinErr } = await supabase
        .from("org_members")
        .select(
          `
          role,
          created_at,
          orgs:org_id (
            id,
            name,
            slug
          )
        `
        )
        .eq("user_id", user.id);

      if (joinErr) {
        setOrgsError(joinErr.message);
        setOrgs([]);
      } else {
        const mapped =
          (fallback || [])
            .map((row: any) => ({
              id: row.orgs?.id,
              name: row.orgs?.name,
              slug: row.orgs?.slug,
              role: row.role ?? null,
              joined_at: row.created_at ?? null,
            }))
            .filter((r: OrgRow) => r.id) ?? [];
        setOrgs(mapped);
      }

      setOrgsLoading(false);
      setLoading(false);
    })();
  }, [supabase, slug]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      // 1) Get latest user
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) throw userErr ?? new Error("Not signed in");

      const full_name = (profile.full_name ?? "").trim();

      // Convert stored digits to E.164 for DB
      const e164 = toUS_E164(profile.phone ?? "");
      const phoneDigits = digitsOnly(profile.phone ?? "");

      // 2) Update auth.user metadata (recommended)
      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          display_name: full_name,
          full_name,
          phone: e164 ?? phoneDigits || null, // store a copy in metadata
        },
      });
      if (authErr) throw authErr;

      // 3) Upsert public.profiles with normalized phone
      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name,
            phone: e164 ?? null, // store normalized phone (or null if invalid)
            avatar_url: profile.avatar_url,
            email: user.email ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      if (upsertErr) throw upsertErr;

      // 4) Re-sync local state (pull from profiles)
      const { data: freshRow } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url")
        .eq("id", user.id)
        .single();

      if (freshRow) {
        setProfile((p) =>
          p
            ? {
                ...p,
                full_name: freshRow.full_name ?? "",
                // convert E.164 back to digits for the input state
                phone: digitsOnly(freshRow.phone ?? ""),
                avatar_url: freshRow.avatar_url,
              }
            : p
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPw) return;
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setNewPw("");
    } catch (err) {
      console.error(err);
    } finally {
      setPwLoading(false);
    }
  }

  async function signOutAll() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ---------- Join Modal helpers ----------
  useEffect(() => {
    if (!showJoinModal) return;
    let t: any;

    async function run() {
      setSearching(true);
      setJoinMsg(null);
      const term = searchTerm.trim();

      const base = supabase
        .from("orgs")
        .select("id, name, slug")
        .order("name")
        .limit(10);

      const { data, error } = term ? await base.ilike("name", `%${term}%`) : await base;
      if (error) {
        setJoinMsg(`Search error: ${error.message}`);
        setSearchResults([]);
      } else {
        setSearchResults(data ?? []);
      }
      setSearching(false);
    }

    t = setTimeout(run, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, showJoinModal]);

  async function requestJoin(orgId: string) {
    setJoinMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setJoinMsg("You must be signed in to request access.");
      return;
    }

    const { error } = await supabase
      .from("org_join_requests")
      .insert([{ org_id: orgId, user_id: user.id, note: null }]);

    if (error) setJoinMsg(`Could not send request: ${error.message}`);
    else setJoinMsg("Request sent! An admin will review it shortly.");
  }

  return (
    <div className="mx-auto max-w-6xl px-3 md:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="rounded-3xl bg-white/15 backdrop-blur-xl border border-white/20 shadow-lg p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-white/30 flex items-center justify-center">
            <User2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">
              {loading ? "…" : profile?.full_name || "Your Account"}
            </h1>
            <p className="text-sm opacity-80">{profile?.email}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT */}
        <div className="space-y-6 lg:col-span-2">
          {/* Profile */}
          <GlassCard>
            <header className="mb-4 flex items-center gap-2">
              <User2 className="h-4 w-4 opacity-90" />
              <h2 className="text-lg font-semibold tracking-wide">Profile</h2>
            </header>

            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="block text-sm opacity-80 mb-1">Full name</label>
                <input
                  className="w-full rounded-xl bg-white/20 backdrop-blur-md border border-white/20 px-3 py-2 focus:outline-none"
                  value={profile?.full_name || ""}
                  onChange={(e) =>
                    setProfile((p) => (p ? { ...p, full_name: e.target.value } : p))
                  }
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block text-sm opacity-80 mb-1">Email</label>
                <input
                  className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 opacity-70"
                  value={profile?.email || ""}
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm opacity-80 mb-1">Phone</label>
                <input
                  className="w-full rounded-xl bg-white/20 backdrop-blur-md border border-white/20 px-3 py-2"
                  value={formatUSPhonePretty(profile?.phone || "")}
                  onChange={(e) => {
                    const digits = digitsOnly(e.target.value).slice(0, 11);
                    setProfile((p) => (p ? { ...p, phone: digits } : p));
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(555) 555-5555"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-2 hover:bg-white/30 transition"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </GlassCard>

          {/* Organizations */}
          <GlassCard>
            <header className="mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 opacity-90" />
              <h2 className="text-lg font-semibold tracking-wide">Organizations</h2>
            </header>

            {orgsLoading ? (
              <p className="text-sm opacity-80">Loading organizations…</p>
            ) : orgsError ? (
              <p className="text-sm text-red-300">Error: {orgsError}</p>
            ) : orgs.length === 0 ? (
              <p className="text-sm opacity-80">You don’t belong to any organizations yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/15">
                <table className="w-full text-sm">
                  <thead className="bg-white/10">
                    <tr>
                      <th className="text-left p-3">Organization</th>
                      <th className="text-left p-3">Role</th>
                      <th className="text-left p-3">Joined</th>
                      <th className="text-left p-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {orgs.map((o) => (
                      <tr key={o.id} className="hover:bg-white/5">
                        <td className="p-3">{o.name}</td>
                        <td className="p-3 capitalize">{o.role ?? "—"}</td>
                        <td className="p-3">
                          {o.joined_at ? new Date(o.joined_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="p-3">
                          <a
                            className="text-sm underline opacity-90 hover:opacity-100"
                            href={`/app/org/${o.slug}`}
                          >
                            Switch
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <a
                className="rounded-full border border-white/30 bg-white/20 px-4 py-2 hover:bg-white/30 transition"
                href="/app/org/new"
              >
                Create organization
              </a>

              {/* Request to join → modal trigger */}
              <button
                onClick={() => {
                  setShowJoinModal(true);
                  setSearchTerm("");
                  setSearchResults([]);
                  setJoinMsg(null);
                }}
                className="rounded-full border border-white/30 bg-white/20 px-4 py-2 hover:bg-white/30 transition"
              >
                Request to join
              </button>
            </div>
          </GlassCard>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* Security */}
          <GlassCard>
            <header className="mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 opacity-90" />
              <h2 className="text-lg font-semibold tracking-wide">Security</h2>
            </header>

            <form onSubmit={changePassword} className="space-y-3">
              <label className="block text-sm opacity-80">Change password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password"
                className="w-full rounded-xl bg-white/20 backdrop-blur-md border border-white/20 px-3 py-2"
              />
              <button
                type="submit"
                disabled={pwLoading || newPw.length < 8}
                className="rounded-full border border-white/30 bg-white/20 px-4 py-2 hover:bg-white/30 transition inline-flex items-center gap-2"
              >
                <KeyRound className="h-4 w-4" />
                {pwLoading ? "Updating…" : "Update password"}
              </button>
            </form>

            <div className="mt-5">
              <div className="text-sm opacity-80">Current session</div>
              <button
                onClick={signOutAll}
                className="mt-3 rounded-full border border-white/30 bg-white/20 px-4 py-2 hover:bg-white/30 transition inline-flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </GlassCard>

          {/* Preferences */}
          <GlassCard>
            <header className="mb-4 flex items-center gap-2">
              <MonitorCog className="h-4 w-4 opacity-90" />
              <h2 className="text-lg font-semibold tracking-wide">Preferences</h2>
            </header>

            <div className="space-y-4">
              <div>
                <label className="block text-sm opacity-80 mb-1">Theme</label>
                <div className="flex gap-2">
                  {(["system", "light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      type="button"
                      className={`px-3 py-2 rounded-full border border-white/30 ${
                        theme === t ? "bg-white/30" : "bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm opacity-80">Email notifications</span>
                <button
                  type="button"
                  onClick={() => setNotifEmail((v) => !v)}
                  className={`w-12 h-7 rounded-full border border-white/30 transition ${
                    notifEmail ? "bg-white/30" : "bg-white/10"
                  }`}
                  title="Toggle email notifications"
                />
              </div>
            </div>
          </GlassCard>

          {/* Danger Zone */}
          <GlassCard>
            <header className="mb-4 flex items-center gap-2">
              <Trash2 className="h-4 w-4 opacity-90" />
              <h2 className="text-lg font-semibold tracking-wide text-red-200">Danger Zone</h2>
            </header>

            <div className="space-y-3">
              <button
                className="w-full rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 px-4 py-2 transition"
                onClick={() => alert("Data export request received. Implement API route.")}
              >
                Export my data
              </button>
              <button
                className="w-full rounded-xl border border-red-400/60 text-red-100 bg-red-600/20 hover:bg-red-600/30 px-4 py-2 transition"
                onClick={() => alert("Account deletion requires a server-side Admin API route.")}
              >
                Delete my account
              </button>
              <p className="text-xs opacity-70">
                Deleting your account is permanent and removes your profile and memberships.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ---------- REQUEST TO JOIN MODAL ---------- */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[92vw] max-w-lg rounded-2xl border border-white/20 bg-white/10 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Request to join a church</h3>
              <button
                onClick={() => setShowJoinModal(false)}
                className="rounded-lg p-1 hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search for church…"
                className="w-full rounded-xl bg-white/5 pl-10 pr-3 py-2 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-white/10">
              {searching ? (
                <div className="p-4 text-sm opacity-80">Searching…</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-sm opacity-80">No results yet.</div>
              ) : (
                <ul className="divide-y divide-white/10">
                  {searchResults.map((r) => (
                    <li key={r.id} className="flex items-center justify-between p-3 hover:bg-white/5">
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs opacity-70">{r.slug}</div>
                      </div>
                      <button
                        onClick={() => requestJoin(r.id)}
                        className="rounded-lg px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        Request
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {joinMsg && <div className="mt-3 text-sm opacity-90">{joinMsg}</div>}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowJoinModal(false)}
                className="rounded-lg px-4 py-2 text-sm bg-white/10 hover:bg-white/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

