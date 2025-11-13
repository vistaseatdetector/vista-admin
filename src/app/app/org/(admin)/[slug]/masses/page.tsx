"use client";
import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GlassPanel, {
  GlassHeader,
  GlassSubtitle,
  GlassTitle,
} from "@/components/ui/GlassPanel";
import LiquidBlobs from "@/components/ui/LiquidBlobs";

type Org = { id: string; name: string; slug: string; timezone: string | null };
type Location = { id: string; name: string };
type Mass = {
  id: string;
  name: string;
  weekday: number;      // 0=Sun … 6=Sat
  start_time: string;   // "HH:MM:SS"
  end_time: string;     // "HH:MM:SS"
  location_id: string;
  starts_at?: string | null;
};

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export default function MassSchedulePage() {
  const supabase = createClient();
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [org, setOrg] = useState<Org | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [masses, setMasses] = useState<Mass[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Add form state
  const [form, setForm] = useState<{
    name: string;
    weekday: number;
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
    location_id: string;
  }>({
    name: "",
    weekday: 0,
    start: "07:00",
    end: "08:00",
    location_id: "",
  });

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);

      // auth
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) { setErr(uErr.message); setLoading(false); return; }
      if (!user) { router.replace("/login"); return; }

      // org
      const { data: orgRow, error: oErr } = await supabase
        .from("orgs").select("id, name, slug, timezone").eq("slug", params.slug).maybeSingle();
      if (oErr) { setErr(oErr.message); setLoading(false); return; }
      if (!orgRow) { setErr("Org not found or no access."); setLoading(false); return; }
      setOrg(orgRow);

      // locations
      const { data: locs, error: lErr } = await supabase
        .from("locations").select("id, name").eq("org_id", orgRow.id).order("name");
      if (lErr) { setErr(lErr.message); setLoading(false); return; }
      const safeLocs = locs ?? [];
      setLocations(safeLocs);
      if (safeLocs.length > 0) {
        setForm((prev) => {
          if (prev.location_id) return prev;
          return { ...prev, location_id: safeLocs[0].id };
        });
      }

      // masses
      const { data: ms, error: mErr } = await supabase
        .from("masses")
        .select("id, name, weekday, start_time, end_time, location_id, starts_at")
        .eq("org_id", orgRow.id)
        .order("weekday, start_time");
      if (mErr) { setErr(mErr.message); setLoading(false); return; }
      setMasses(ms ?? []);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  const massesGrouped = useMemo(() => {
    const byDay: Record<number, Mass[]> = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
    for (const m of masses) byDay[m.weekday].push(m);
    for (const d of Object.keys(byDay)) {
      byDay[Number(d)].sort((a,b) => a.start_time.localeCompare(b.start_time));
    }
    return byDay;
  }, [masses]);

  const renderShell = (content: ReactNode) => (
    <main className="relative">
      <div className="relative mx-auto max-w-5xl p-4 md:p-6">
        <LiquidBlobs />
        <GlassPanel
          tinted
          elevated
          className="flex min-h-[220px] items-center justify-center text-white/80"
        >
          {content}
        </GlassPanel>
      </div>
    </main>
  );

  if (loading) return renderShell(<p>Loading…</p>);
  if (err) return renderShell(<p className="text-rose-200">{err}</p>);
  if (!org) return null;

  return (
    <main className="relative">
      <div className="relative mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <LiquidBlobs />

        <GlassPanel tinted elevated className="space-y-2">
          <GlassHeader className="mb-0 flex-wrap gap-3">
            <div className="space-y-1">
              <GlassTitle className="text-2xl font-semibold text-white">
                {org.name} — Mass Schedule
              </GlassTitle>
              <GlassSubtitle>
                Manage recurring Mass times and the locations where they are celebrated.
              </GlassSubtitle>
            </div>
            <Link
              href={`/app/org/${org.slug}`}
              className="inline-flex items-center rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/20"
            >
              Back to dashboard
            </Link>
          </GlassHeader>
        </GlassPanel>

        <GlassPanel tinted elevated className="space-y-5">
          <div className="space-y-1">
            <GlassTitle>Add Mass</GlassTitle>
            <GlassSubtitle>
              Define the Mass name, weekday, and time, then assign it to one of your locations.
            </GlassSubtitle>
          </div>
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const locationRequired = locations.length > 1;
              const selectedLocationId =
                locations.length === 1
                  ? locations[0].id
                  : form.location_id || null;

              if (!form.name || (locationRequired && !selectedLocationId)) {
                alert("Name and location required");
                return;
              }
              const start_time =
                form.start.length === 5 ? `${form.start}:00` : form.start;
              const end_time =
                form.end.length === 5 ? `${form.end}:00` : form.end;

              const timezone = org?.timezone || "America/Chicago";
              const now = DateTime.now().setZone(timezone);
              const [startHourStr, startMinuteStr] = start_time.split(":");
              const startHour = Number.parseInt(startHourStr, 10);
              const startMinute = Number.parseInt(startMinuteStr, 10);
              const targetWeekday = form.weekday === 0 ? 7 : form.weekday;
              const diffDays = (targetWeekday - now.weekday + 7) % 7;
              let occurrence = now.startOf("day").plus({ days: diffDays }).set({
                hour: startHour,
                minute: startMinute,
                second: 0,
                millisecond: 0,
              });
              if (occurrence <= now) {
                occurrence = occurrence.plus({ weeks: 1 });
              }
              const startsAtISO = occurrence.toUTC().toISO();

              const { error } = await supabase.from("masses").insert({
                org_id: org.id,
                location_id: selectedLocationId,
                name: form.name,
                weekday: form.weekday,
                start_time,
                end_time,
                starts_at: startsAtISO,
              });
              if (error) {
                alert(error.message);
                return;
              }

              const { data: refreshed } = await supabase
                .from("masses")
                .select("id, name, weekday, start_time, end_time, location_id, starts_at")
                .eq("org_id", org.id)
                .order("weekday, start_time");
              setMasses(refreshed ?? []);
              setForm((current) => ({ ...current, name: "" }));
            }}
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-wide text-white/60">
                Name
              </label>
              <input
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none transition focus:border-white/40"
                placeholder="e.g. 9:00 AM Mass"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-wide text-white/60">
                Weekday
              </label>
              <select
                className="w-full appearance-none rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-white/40"
                value={form.weekday}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    weekday: Number(event.target.value),
                  }))
                }
              >
                {WEEKDAYS.map((weekday, index) => (
                  <option key={weekday} value={index} className="text-gray-900">
                    {weekday}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-wide text-white/60">
                Start time
              </label>
              <input
                type="time"
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-white/40"
                value={form.start}
                onChange={(event) =>
                  setForm((current) => ({ ...current, start: event.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-wide text-white/60">
                End time
              </label>
              <input
                type="time"
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-white/40"
                value={form.end}
                onChange={(event) =>
                  setForm((current) => ({ ...current, end: event.target.value }))
                }
              />
            </div>

            {locations.length > 1 ? (
              <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-medium uppercase tracking-wide text-white/60">
                  Location
                </label>
                <select
                  className="w-full appearance-none rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-white/40"
                  value={form.location_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      location_id: event.target.value,
                    }))
                  }
                >
                  {locations.map((location) => (
                    <option
                      key={location.id}
                      value={location.id}
                      className="text-gray-900"
                    >
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-medium uppercase tracking-wide text-white/60">
                  Location
                </label>
                <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                  {locations[0]?.name ?? "No locations configured"}
                </p>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white"
              >
                Add Mass
              </button>
            </div>
          </form>
        </GlassPanel>

        <GlassPanel tinted className="space-y-4">
          <div>
            <GlassTitle>Current Schedule</GlassTitle>
            <GlassSubtitle>
              Each Mass appears on the day it’s scheduled. Remove any entries that are no longer needed.
            </GlassSubtitle>
          </div>
          <div className="space-y-3">
            {Object.entries(massesGrouped).map(([weekday, rows]) => {
              const label = WEEKDAYS[Number(weekday)];
              return (
                <div
                  key={weekday}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                >
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-sm font-medium text-white/80">
                    <span>{label}</span>
                    <span className="text-xs text-white/50">
                      {rows.length === 1 ? "1 Mass" : `${rows.length} Masses`}
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-white/60">
                      No Masses scheduled.
                    </div>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {rows.map((mass) => (
                        <li
                          key={mass.id}
                          className="flex items-center justify-between gap-4 px-4 py-3"
                        >
                          <div className="space-y-0.5">
                            <div className="text-sm font-semibold text-white/90">
                              {mass.name}
                            </div>
                            <div className="text-xs text-white/60">
                              {mass.start_time.slice(0, 5)} – {mass.end_time.slice(0, 5)}
                              {" · "}
                              {locations.find((location) => location.id === mass.location_id)?.name ??
                                "—"}
                            </div>
                          </div>
                          <button
                            className="rounded-xl border border-rose-300/40 bg-rose-200/10 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-200/20"
                            onClick={async () => {
                              if (!confirm(`Delete "${mass.name}"?`)) return;
                              const { error } = await supabase
                                .from("masses")
                                .delete()
                                .eq("id", mass.id);
                              if (error) {
                                alert(error.message);
                                return;
                              }
                              setMasses((previous) =>
                                previous.filter((existing) => existing.id !== mass.id)
                              );
                            }}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </div>
    </main>
  );
}
