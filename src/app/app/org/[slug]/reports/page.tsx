"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import GlassCard from "@/components/ui/GlassCard";

/** get Monday start for a given date (local) */
function startOfWeek(d = new Date()) {
  const t = new Date(d);
  const day = t.getDay(); // Sun=0..Sat=6
  const diff = (day === 0 ? -6 : 1 - day); // back to Monday
  t.setDate(t.getDate() + diff);
  t.setHours(0, 0, 0, 0);
  return t;
}
function addDays(d: Date, n: number) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function ReportsPage() {
  const { slug } = useParams<{ slug: string }>();
  const weeks = useMemo(() => {
    const start = startOfWeek(new Date()); // this Monday
    return Array.from({ length: 8 }).map((_, i) => {
      const from = addDays(start, -7 * i);
      const to   = addDays(from, 7); // [from, to)
      return { label: `${from.toLocaleDateString()} → ${addDays(to,-1).toLocaleDateString()}`, from, to };
    });
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Reports</h1>

      <GlassCard>
        <p className="text-white/80 mb-4">Weekly attendance & security summaries</p>

        <div className="grid gap-4">
          {weeks.map((w, idx) => {
            const from = ymd(w.from);
            const to   = ymd(w.to);
            // these API routes assume your existing endpoints accept ?from=&to=
            const attendanceCSV = `/api/org/${slug}/attendance?from=${from}&to=${to}`;
            const securityCSV   = `/api/org/${slug}/security?from=${from}&to=${to}`;
            const viewHref      = `/app/org/${slug}/reports/${from}`; // detail page stub below
            return (
              <div key={idx} className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium">{w.label}</div>
                <div className="flex gap-2">
                  <a className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15" href={viewHref}>View</a>
                  <a className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15" href={attendanceCSV}>Download Attendance CSV</a>
                  <a className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15" href={securityCSV}>Download Security CSV</a>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
