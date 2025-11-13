"use client";

import { FormEvent, useEffect, useMemo, useState, type ComponentProps, type ComponentType } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import GlassPanel from "@/components/ui/GlassPanel";
import LiquidBlobs from "@/components/ui/LiquidBlobs";
import { createClient } from "@/lib/supabase/client";
import type { OrgMemberRow, OrgSummary } from "@/lib/types";
import InviteDialog from "@/components/Admin/InviteDialog";
import RequestsDialog from "@/components/Admin/RequestsDialog";

type ToastState = {
  message: string;
  variant: "success" | "error";
};

type InviteState = {
  org: OrgSummary;
  role: "admin" | "usher";
} | null;

const EnhancedGlassPanel = GlassPanel as ComponentType<
  ComponentProps<typeof GlassPanel> & {
    tinted?: boolean;
    elevated?: boolean;
  }
>;

export default function AdminDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [inviteState, setInviteState] = useState<InviteState>(null);
  const [requestsOrg, setRequestsOrg] = useState<OrgSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        if (!cancelled) setError(authError.message);
        setLoading(false);
        return;
      }
      if (!user) {
        router.replace("/login");
        return;
      }

      if (!cancelled) {
        setUserId(user.id);
        setUserEmail(user.email ?? null);
      }

      const { data, error: orgError } = await supabase
        .from("org_members")
        .select("org_id, role, orgs!inner(id, name, slug)")
        .eq("user_id", user.id)
        .eq("role", "admin");

      if (cancelled) return;

      if (orgError) {
        setError(orgError.message);
        setOrgs([]);
      } else {
        const rows = (data ?? []) as Array<{ orgs?: OrgSummary | OrgSummary[] | null }>;
        const mapped = rows
          .map((row) => {
            const value = row.orgs;
            if (Array.isArray(value)) return value[0] ?? null;
            return value ?? null;
          })
          .filter((org): org is OrgSummary => Boolean(org))
          .sort((a, b) => a.name.localeCompare(b.name));
        setOrgs(mapped);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const hasOrgs = useMemo(() => orgs.length > 0, [orgs]);

  function notify(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    const trimmed = createName.trim();
    if (!trimmed) {
      notify("Church name is required.", "error");
      return;
    }

    setCreateLoading(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("orgs")
      .insert([{ name: trimmed, created_by: userId }])
      .select("id, name, slug")
      .single();

    if (insertError || !data) {
      notify(insertError?.message ?? "Failed to create church", "error");
      setCreateLoading(false);
      return;
    }

    const created = data as OrgSummary;
    setCreateName("");
    setShowCreateForm(false);
    setOrgs((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    notify("Church created.");
    setCreateLoading(false);
  }

  function handleOpenUsherApp() {
    const timer = window.setTimeout(() => {
      window.open("/not-an-admin", "_blank", "noopener");
    }, 1500);
    window.location.href = "vistaushers://app";
    window.setTimeout(() => window.clearTimeout(timer), 2000);
  }

  return (
    <main className="relative min-h-screen text-white">
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/church-bg2.jpg"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
        <LiquidBlobs />

        <EnhancedGlassPanel tinted elevated>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold text-white">Vista Admin</h1>
              <div className="flex items-center gap-4 text-sm text-white/80">
                <span>
                  Welcome, {userEmail ?? "—"}
                </span>
                <form action="/logout" method="post">
                  <button className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 hover:bg-white/15">
                    Sign out
                  </button>
                </form>
              </div>
            </div>

            {loading ? (
              <p className="text-white/80">Loading churches…</p>
            ) : error ? (
              <div className="space-y-3">
                <p className="text-rose-200">Failed to load churches: {error}</p>
                <button
                  className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white"
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    setTimeout(() => window.location.reload(), 50);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : hasOrgs ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">
                      Your Churches
                    </h2>
                    <p className="text-sm text-white/70">
                      Manage admins, ushers, and requests.
                    </p>
                  </div>
                  <button
                    className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white"
                    onClick={() => setShowCreateForm((prev) => !prev)}
                  >
                    {showCreateForm ? "Close" : "Create Church"}
                  </button>
                </div>

                {showCreateForm ? (
                  <form
                    onSubmit={handleCreate}
                    className="rounded-2xl border border-white/15 bg-white/5 p-4"
                  >
                    <label className="block text-sm text-white/80">
                      Church name
                      <input
                        className="mt-1 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-white/40"
                        placeholder="e.g. St. Gabriel Parish"
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                      />
                    </label>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-white/30 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10"
                        onClick={() => {
                          setShowCreateForm(false);
                          setCreateName("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white disabled:opacity-60"
                        disabled={createLoading}
                      >
                        {createLoading ? "Creating…" : "Create"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <section className="grid gap-4 md:grid-cols-2">
                  {orgs.map((org) => (
                    <div
                      key={org.id}
                      className="rounded-2xl border border-white/20 bg-white/5 p-4"
                    >
                      <div className="mb-3">
                        <div className="text-lg font-semibold text-white">
                          {org.name}
                        </div>
                        <div className="text-xs text-white/60">
                          /app/org/{org.slug}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`/app/org/${org.slug}`}
                          className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/15"
                        >
                          Open Dashboard
                        </a>
                        <button
                          className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/15"
                          onClick={() =>
                            setInviteState({ org, role: "admin" })
                          }
                        >
                          Invite Admin
                        </button>
                        <button
                          className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/15"
                          onClick={() =>
                            setInviteState({ org, role: "usher" })
                          }
                        >
                          Invite Usher
                        </button>
                        <button
                          className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/15"
                          onClick={() => setRequestsOrg(org)}
                        >
                          View Usher Requests
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    No Churches Yet
                  </h2>
                  <p className="text-sm text-white/70">
                    Create a church to get started or open the usher app to manage teams.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white"
                    onClick={() => setShowCreateForm(true)}
                  >
                    Create Church
                  </button>
                  <button
                    className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm text-white/90 transition hover:bg-white/15"
                    onClick={handleOpenUsherApp}
                  >
                    Open Usher App
                  </button>
                </div>

                {showCreateForm ? (
                  <form
                    onSubmit={handleCreate}
                    className="rounded-2xl border border-white/15 bg-white/5 p-4"
                  >
                    <label className="block text-sm text-white/80">
                      Church name
                      <input
                        className="mt-1 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-white/40"
                        placeholder="e.g. St. Gabriel Parish"
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                      />
                    </label>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-white/30 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10"
                        onClick={() => {
                          setShowCreateForm(false);
                          setCreateName("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white disabled:opacity-60"
                        disabled={createLoading}
                      >
                        {createLoading ? "Creating…" : "Create"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            )}
          </div>
        </EnhancedGlassPanel>

        {toast ? (
          <div className="pointer-events-none fixed right-6 top-6 z-50">
            <div
              className={`rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${
                toast.variant === "success"
                  ? "bg-emerald-500/90 text-white"
                  : "bg-rose-500/90 text-white"
              }`}
            >
              {toast.message}
            </div>
          </div>
        ) : null}

        {inviteState ? (
          <InviteDialog
            open
            orgId={inviteState.org.id}
            orgName={inviteState.org.name}
            role={inviteState.role}
            onClose={() => setInviteState(null)}
            onSuccess={(message) => notify(message, "success")}
          />
        ) : null}

        {requestsOrg ? (
          <RequestsDialog
            open
            orgId={requestsOrg.id}
            orgName={requestsOrg.name}
            onClose={() => setRequestsOrg(null)}
            onNotify={(message, variant) => notify(message, variant)}
          />
        ) : null}
      </div>
    </main>
  );
}
