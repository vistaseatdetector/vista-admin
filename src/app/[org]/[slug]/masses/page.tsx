"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Org = { id: string; name: string; slug: string };
type Location = { id: string; name: string };
type Mass = {
  id: string;
  name: string;
  weekday: number;      // 0=Sun … 6=Sat
  start_time: string;   // "HH:MM:SS"
  end_time: string;     // "HH:MM:SS"
  location_id: string;
};

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// same helper you used elsewhere (paste here for this page)
async function isAdminForOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string
) {
  const { data, error } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("org_id", orgId)
    .limit(1);
  if (error) return false;
  return data?.[0]?.role === "admin";
}

export default function MassSchedulePage() {
  const supabase = createClient();
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [org, setOrg] = useState<Org | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
        .from("orgs").select("id, name, slug").eq("slug", params.slug).maybeSingle();
      if (oErr) { setErr(oErr.message); setLoading(false); return; }
      if (!orgRow) { setErr("Org not found or no access."); setLoading(false); return; }
      setOrg(orgRow);

      // admin?
      const admin = await isAdminForOrg(supabase, orgRow.id);
      setIsAdmin(admin);
      if (!admin) { setErr("You must be an admin to edit the Mass schedule."); setLoading(false); return; }

      // locations
      const { data: locs, error: lErr } = await supabase
        .from("locations").select("id, name").eq("org_id", orgRow.id).order("name");
      if (lErr) { setErr(lErr.message); setLoading(false); return; }
      setLocations(locs ?? []);
      if ((locs ?? []).length > 0 && !form.location_id) {
        setForm(f => ({ ...f, location_id: (locs ?? [])[0].id }));
      }

      // masses
      const { data: ms, error: mErr } = await supabase
        .from("masses")
        .select("id, name, weekday, start_time, end_time, location_id")
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

  if (loading) return <main className="p-6">Loading…</main>;
  if (err) return <main className="p-6"><div className="text-red-600">{err}</div></main>;
  if (!org || !isAdmin) return null;

  return (
    <main className="p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {org.name} — Mass Schedule
        </h1>
        <a href={`/app/org/${org.slug}`} className="border rounded px-3 py-1">
          Back to dashboard
        </a>
      </header>

      {/* Add new Mass */}
      <section className="border rounded-xl p-4 space-y-3">
        <div className="font-medium">Add Mass</div>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.name || !form.location_id) {
              alert("Name and Location are required");
              return;
            }
            // convert HH:MM -> HH:MM:00
            const start_time = form.start.length === 5 ? `${form.start}:00` : form.start;
            const end_time   = form.end.length === 5 ? `${form.end}:00` : form.end;

            const { error } = await supabase.from("masses").insert({
              org_id: org.id,
              location_id: form.location_id,
              name: form.name,
              weekday: form.weekday,
              start_time,
              end_time,
            });
            if (error) { alert(error.message); return; }

            // refresh list
            const { data: ms } = await supabase
              .from("masses")
              .select("id, name, weekday, start_time, end_time, location_id")
              .eq("org_id", org.id)
              .order("weekday, start_time");
            setMasses(ms ?? []);

            // reset name only
            setForm(f => ({ ...f, name: "" }));
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Name</label>
            <input
              className="border rounded px-2 py-1"
              placeholder="e.g. 9:00 AM Mass"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Weekday</label>
            <select
              className="border rounded px-2 py-1"
              value={form.weekday}
              onChange={(e) => setForm(f => ({ ...f, weekday: Number(e.target.value) }))}
            >
              {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Start time</label>
            <input
              type="time"
              className="border rounded px-2 py-1"
              value={form.start}
              onChange={(e) => setForm(f => ({ ...f, start: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">End time</label>
            <input
              type="time"
              className="border rounded px-2 py-1"
              value={form.end}
              onChange={(e) => setForm(f => ({ ...f, end: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Location</label>
            <select
              className="border rounded px-2 py-1"
              value={form.location_id}
              onChange={(e) => setForm(f => ({ ...f, location_id: e.target.value }))}
            >
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <button className="border rounded px-3 py-1">Add</button>
        </form>
      </section>

      {/* Existing schedule */}
      <section className="space-y-3">
        <div className="font-medium">Current Schedule</div>
        {Object.entries(massesGrouped).map(([weekday, rows]) => (
          <div key={weekday} className="border rounded-xl">
            <div className="px-4 py-2 bg-gray-50 border-b text-sm font-medium">
              {WEEKDAYS[Number(weekday)]}
            </div>
            {rows.length === 0 ? (
              <div className="p-4 text-gray-500 text-sm">No Masses.</div>
            ) : (
              <ul className="divide-y">
                {rows.map(m => (
                  <li key={m.id} className="p-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-gray-600">
                        {m.start_time.slice(0,5)}–{m.end_time.slice(0,5)}
                        {" · "}
                        {locations.find(l => l.id === m.location_id)?.name ?? "—"}
                      </div>
                    </div>
                    <button
                      className="text-red-600 border rounded px-3 py-1"
                      onClick={async () => {
                        if (!confirm(`Delete "${m.name}"?`)) return;
                        const { error } = await supabase.from("masses").delete().eq("id", m.id);
                        if (error) { alert(error.message); return; }
                        setMasses(prev => prev.filter(x => x.id !== m.id));
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
