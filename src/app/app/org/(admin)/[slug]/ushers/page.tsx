"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GlassCard from "@/components/ui/GlassCard";
import { DateTime } from "luxon";

type Usher = {
  id: string;
  org_id: string;
  profile_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
};

type OrgUsherRow = {
  org_id: string;
  user_id: string;
  role: "usher" | string;
  added_by: string | null;
  user_name: string | null;
  email: string | null;
};

type Mass = {
  id: string;
  org_id: string;
  title: string | null;
  starts_at: string; // ISO
  location: string | null;
  notes: string | null;
};

type Assignment = {
  id: string;
  org_id: string;
  mass_id: string;
  usher_id: string;
  role: string;
  status?: string | null;
  usher: Pick<Usher, "id" | "name" | "email">;
};

function formatLocal(dtIso: string) {
  // Display in America/Chicago (your app can globalize this)
  const dt = new Date(dtIso);
  return dt.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UshersPage() {
  const supabase = createClient();
  const { slug } = useParams<{ slug: string }>();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgTimezone, setOrgTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [ushers, setUshers] = useState<Usher[]>([]);
  const [orgUshers, setOrgUshers] = useState<OrgUsherRow[]>([]);
  const [masses, setMasses] = useState<Mass[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // UI state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  // New Mass form state + toggle
  const [newMassWhen, setNewMassWhen] = useState<string>("");
  const [newMassTitle, setNewMassTitle] = useState("Mass");
  const [newMassLocation, setNewMassLocation] = useState("");
  const [showNewMassForm, setShowNewMassForm] = useState(false);

  function resetMassForm() {
    setNewMassWhen("");
    setNewMassTitle("Mass");
    setNewMassLocation("");
  }

  async function createMass() {
    if (!orgId) return;
    if (!newMassWhen) return alert("Pick a date & time");
    const dt = new Date(newMassWhen);
    const { data, error } = await supabase
      .from("masses")
      .insert({
        org_id: orgId,
        name: newMassTitle || "Mass",     // for legacy schema that expects "name"
        title: newMassTitle || "Mass",
        starts_at: dt.toISOString(),      // stored UTC
        location: newMassLocation || null,
      })
      .select("*")
      .single();
    if (error) return alert(error.message);

    setMasses((m) =>
      [...m, data as Mass].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    );
    // Close and reset the form after a successful save
    setShowNewMassForm(false);
    resetMassForm();
  }

  // ✅ Resolve orgId from slug
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("orgs")
          .select("id, slug, timezone")
          .eq("slug", slug)
          .single();
        if (error) throw error;
        setOrgId(data.id);
        setOrgTimezone(data.timezone ?? null);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [slug, supabase]);

  // Load ushers, upcoming masses (now → future), and assignments
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const nowIso = new Date().toISOString();

        const [
          { data: ushersData, error: ushersErr },
          { data: massesData, error: massesErr },
          { data: locationsData, error: locationsErr },
          { data: orgUshersData, error: orgUshersErr },
        ] = await Promise.all([
          supabase.from("ushers")
            .select("*")
            .eq("org_id", orgId)
            .order("name", { ascending: true }),
          supabase.from("masses")
            .select("*")
            .eq("org_id", orgId)
            .gte("starts_at", nowIso)
            .order("starts_at", { ascending: true }),
          supabase.from("locations")
            .select("id, name")
            .eq("org_id", orgId)
            .order("name", { ascending: true }),
          supabase.from("org_ushers_with_name")
            .select("*")
            .eq("org_id", orgId)
            .order("user_name", { ascending: true }),
        ]);
        if (ushersErr) throw ushersErr;
        if (massesErr) throw massesErr;
        if (locationsErr) throw locationsErr;
        if (orgUshersErr) throw orgUshersErr;

        setUshers((ushersData ?? []) as Usher[]);
        setOrgUshers((orgUshersData ?? []) as OrgUsherRow[]);
        const locMap = Object.fromEntries(
          (locationsData ?? []).map((loc) => [loc.id, loc.name])
        );
        let upcoming: Mass[] = (massesData as Mass[]) ?? [];

        if (!upcoming.length) {
          const { data: scheduleRows, error: scheduleErr } = await supabase
            .from("masses")
            .select("id, name, title, weekday, start_time, location, location_id")
            .eq("org_id", orgId)
            .order("weekday", { ascending: true })
            .order("start_time", { ascending: true });

          if (!scheduleErr && scheduleRows) {
            const tz = orgTimezone || "America/Chicago";
            upcoming = buildUpcomingFromSchedule(scheduleRows, tz, locMap, orgId);
          }
        }

        setMasses(upcoming);

        // fetch assignments with joined ushers
        const { data: assignData, error: assignErr } = await supabase
          .from("usher_assignments")
          .select("id, org_id, mass_id, usher_id, role, status, usher:ushers(id,name,email)")
          .eq("org_id", orgId);
        if (assignErr) throw assignErr;
        const rows = (assignData ?? []) as Array<{ usher: any } & Assignment>;
        const normalized = rows.map((row) => ({
          ...row,
          usher: Array.isArray(row.usher) ? row.usher[0] : row.usher,
        }));
        setAssignments(normalized);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId, orgTimezone, supabase]);

  // Group assignments by mass_id for quick lookup
  const byMassId = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!m.has(a.mass_id)) m.set(a.mass_id, []);
      m.get(a.mass_id)!.push(a);
    }
    return m;
  }, [assignments]);

  const profileNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of orgUshers) {
      map.set(row.user_id, row.user_name ?? row.email ?? row.user_id);
    }
    return map;
  }, [orgUshers]);

  const displayForUsher = useCallback(
    (usher: Usher) => {
      if (usher.profile_id && profileNameLookup.has(usher.profile_id)) {
        return profileNameLookup.get(usher.profile_id)!;
      }
      return usher.name?.trim() || usher.email || usher.id;
    },
    [profileNameLookup]
  );

  const assignableUshers = useMemo(() => {
    const active = ushers.filter((u) => u.active);
    active.sort((a, b) =>
      displayForUsher(a).localeCompare(displayForUsher(b))
    );
    return active;
  }, [ushers, displayForUsher]);

  async function assignUsher(massId: string, usherId: string) {
    if (!orgId) return;
    const { data, error } = await supabase
      .from("usher_assignments")
      .insert({ org_id: orgId, mass_id: massId, usher_id: usherId })
      .select("id, org_id, mass_id, usher_id, role, status, usher:ushers(id,name,email)")
      .single();
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    const normalized = ({
      ...data,
      usher: Array.isArray(data?.usher) ? data.usher[0] : data?.usher,
    }) as Assignment;
    setAssignments((prev) => [...prev, normalized]);
  }

  async function unassign(massAssignmentId: string) {
    const { error } = await supabase
      .from("usher_assignments")
      .delete()
      .eq("id", massAssignmentId);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    setAssignments((prev) => prev.filter((a) => a.id !== massAssignmentId));
  }

  async function addGuestAndAssign(massId: string) {
    if (!orgId) return;
    try {
      if (!guestName.trim()) {
        alert("Please enter a name");
        return;
      }
      const { data: usher, error: usherErr } = await supabase
        .from("ushers")
        .insert({
          org_id: orgId,
          profile_id: null,
          name: guestName.trim(),
          email: guestEmail.trim() || null,
          active: true,
        })
        .select("*")
        .single();
      if (usherErr) throw usherErr;

      await assignUsher(massId, usher.id);
      setGuestName("");
      setGuestEmail("");
      setAddingGuest(false);
      await reloadOrgUshers();
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Failed to add usher";
      alert(message);
    }
  }

  async function requestHelp(massId: string) {
    if (!orgId) return;
    const res = await fetch(`/api/request-mass-help?org_id=${orgId}&mass_id=${massId}`, {
      method: "POST",
    });
    if (!res.ok) {
      const msg = await res.text();
      alert(msg || "Failed to send help request");
      return;
    }
    alert("Help request sent to all ushers.");
  }

  async function reloadOrgUshers() {
    if (!orgId) return;
    const { data, error } = await supabase
      .from("org_ushers_with_name")
      .select("*")
      .eq("org_id", orgId)
      .order("user_name", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setOrgUshers((data ?? []) as OrgUsherRow[]);
  }

  async function inviteUsher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orgId) return;

    const email = inviteEmail.trim().toLowerCase();
    const name = inviteName.trim();
    if (!email) {
      setInviteError("Email is required.");
      return;
    }

    setInviteLoading(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/ushers/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId,
          email,
          name: name || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to invite usher");
      }

      if (payload?.usher) {
        const newUsher = payload.usher as Usher;
        setUshers((prev) => {
          const filtered = prev.filter((u) => u.id !== newUsher.id);
          const next = [...filtered, newUsher];
          next.sort((a, b) => {
            const aName = a.name?.trim() || a.email || a.id;
            const bName = b.name?.trim() || b.email || b.id;
            return aName.localeCompare(bName);
          });
          return next;
        });
        await reloadOrgUshers();
      }

      setInviteName("");
      setInviteEmail("");
      setShowInviteForm(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to invite usher";
      setInviteError(message);
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
      {/* Left: Usher Directory */}
      <GlassCard className="lg:col-span-1">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Ushers</h2>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-lg border border-white/15"
              onClick={() => {
                setShowInviteForm((v) => !v);
                setInviteError(null);
              }}
            >
              {showInviteForm ? "Close" : "+ Add ushers"}
            </button>
          </div>

          {showInviteForm && (
            <form
              onSubmit={inviteUsher}
              className="mb-4 space-y-3 rounded-xl border border-white/15 p-3"
            >
              <div className="grid gap-2">
                <input
                  className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1"
                  placeholder="Full name (optional)"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
                <input
                  className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1"
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              {inviteError ? (
                <p className="text-xs text-rose-200">{inviteError}</p>
              ) : (
                <p className="text-xs opacity-70">
                  We’ll email existing ushers and mark new ones as pending until they sign up.
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="text-sm px-3 py-1.5 rounded-lg border border-white/15 disabled:opacity-60"
                  disabled={inviteLoading}
                >
                  {inviteLoading ? "Inviting…" : "Send invite"}
                </button>
                <button
                  type="button"
                  className="text-sm px-3 py-1.5 rounded-lg border border-white/15"
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteError(null);
                    setInviteName("");
                    setInviteEmail("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div>Loading…</div>
          ) : orgUshers.length === 0 ? (
            <div className="text-sm opacity-70">No ushers yet.</div>
          ) : (
            <ul className="space-y-2">
              {orgUshers.map((usher) => {
                const label =
                  usher.user_name ?? usher.email ?? usher.user_id;
                const initial = label.trim().charAt(0).toUpperCase();
                return (
                  <li
                    key={usher.user_id}
                    className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-content-center rounded-full bg-white/10">
                        {initial || "U"}
                      </div>
                      <div>
                        <div className="font-medium">{label}</div>
                        {usher.email ? (
                          <div className="text-xs opacity-70">{usher.email}</div>
                        ) : null}
                      </div>
                    </div>
                    
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </GlassCard>

      {/* Right: Schedule */}
      <GlassCard className="lg:col-span-2">
        <div className="p-4">
          {/* Header with toggle button */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Upcoming Masses</h2>
            <button
              className="text-sm px-3 py-1.5 rounded-lg border border-white/15"
              onClick={() => setShowNewMassForm(v => !v)}
              title={showNewMassForm ? "Close" : "Add a new Mass"}
            >
              {showNewMassForm ? "Close" : "+ Add Mass"}
            </button>
          </div>

          {/* Collapsible Add Mass form */}
          {showNewMassForm && (
            <div className="mb-4 rounded-xl border border-white/15 p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  type="datetime-local"
                  className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1"
                  value={newMassWhen}
                  onChange={(e) => setNewMassWhen(e.target.value)}
                  title="When (local time; saved in UTC)"
                />
                <input
                  className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1"
                  placeholder="Title"
                  value={newMassTitle}
                  onChange={(e) => setNewMassTitle(e.target.value)}
                />
                <input
                  className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1"
                  placeholder="Location (optional)"
                  value={newMassLocation}
                  onChange={(e) => setNewMassLocation(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/15"
                    onClick={createMass}
                  >
                    Save
                  </button>
                  <button
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/15"
                    onClick={() => { resetMassForm(); setShowNewMassForm(false); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div>Loading…</div>
          ) : masses.length === 0 ? (
            <div className="text-sm opacity-70">No upcoming Masses scheduled.</div>
          ) : (
            <div className="space-y-4">
              {masses.map((m) => {
                const assigned = byMassId.get(m.id) || [];
                return (
                  <div key={m.id} className="rounded-xl border border-white/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-medium">
                          {m.title || "Mass"} • {formatLocal(m.starts_at)}
                        </div>
                        {m.location ? (
                          <div className="text-xs opacity-70">{m.location}</div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Assign from existing ushers */}
                        <select
                          className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1 disabled:opacity-60"
                          defaultValue=""
                          disabled={assignableUshers.length === 0}
                          onChange={(e) => {
                            const usherId = e.target.value;
                            if (!usherId) return;
                            assignUsher(m.id, usherId);
                            e.currentTarget.value = "";
                          }}
                        >
                          <option value="">Assign usher…</option>
                          {assignableUshers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {displayForUsher(u)}
                            </option>
                          ))}
                        </select>

                        {/* Add guest usher then assign */}
                        <button
                          className="text-sm px-2 py-1 rounded-lg border border-white/15"
                          onClick={() => setAddingGuest((v) => !v)}
                        >
                          Add usher manually
                        </button>

                        {/* Request help */}
                        <button
                          className="text-sm px-2 py-1 rounded-lg border border-white/15"
                          onClick={() => requestHelp(m.id)}
                          title="Email/notify all ushers this Mass needs help"
                        >
                          Request help
                        </button>
                      </div>
                    </div>

                    {/* Guest form */}
                    {addingGuest && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <input
                          className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1"
                          placeholder="Usher Name"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                        />
                        <input
                          className="bg-transparent border border-white/15 rounded-lg text-sm px-2 py-1"
                          placeholder="Usher Email (optional)"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                        />
                        <button
                          className="text-sm px-2 py-1 rounded-lg border border-white/15"
                          onClick={() => addGuestAndAssign(m.id)}
                        >
                          Add & assign
                        </button>
                      </div>
                    )}

                    {/* Assigned list */}
                    <div className="mt-3">
                      <div className="text-sm opacity-80 mb-1">Assigned ushers:</div>
                      {assigned.length === 0 ? (
                        <div className="text-sm opacity-60">None assigned yet.</div>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {assigned.map((a) => (
                            <li
                              key={a.id}
                              className="flex items-center gap-2 text-sm px-2 py-1 rounded-full border border-white/15"
                            >
                              <span className="font-medium">{a.usher?.name ?? "Unknown"}</span>
                              <button
                                className="opacity-70 hover:opacity-100"
                                onClick={() => unassign(a.id)}
                                title="Remove"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

type ScheduleRow = {
  id: string;
  name: string | null;
  title: string | null;
  weekday: number | null;
  start_time: string | null;
  location: string | null;
  location_id: string | null;
};

function buildUpcomingFromSchedule(
  rows: ScheduleRow[],
  timezone: string,
  locationMap: Record<string, string>,
  orgId: string
): Mass[] {
  const now = DateTime.now().setZone(timezone);
  const upcoming: Mass[] = [];

  for (const row of rows) {
    if (
      row.weekday == null ||
      row.start_time == null ||
      !row.start_time.includes(":")
    ) {
      continue;
    }

    const [hourStr, minuteStr] = row.start_time.split(":");
    const hour = Number.parseInt(hourStr, 10);
    const minute = Number.parseInt(minuteStr, 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

    const targetLuxonWeekday = row.weekday === 0 ? 7 : row.weekday;

    const startOfDay = now.startOf("day");
    const diffDays = (targetLuxonWeekday - now.weekday + 7) % 7;
    let occurrence = startOfDay.plus({ days: diffDays }).set({
      hour,
      minute,
      second: 0,
      millisecond: 0,
    });
    if (occurrence <= now) {
      occurrence = occurrence.plus({ weeks: 1 });
    }

    const generatedId = row.id ? String(row.id) : `temp-${orgId}-${Math.random().toString(36).slice(2, 8)}`;
    const startsAt = occurrence.toISO();
    if (!startsAt) continue;
    upcoming.push({
      id: generatedId,
      org_id: orgId,
      title: row.title || row.name || "Mass",
      starts_at: startsAt,
      location:
        row.location ||
        (row.location_id ? locationMap[row.location_id] ?? null : null),
      notes: null,
    });
  }

  upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return upcoming;
}
