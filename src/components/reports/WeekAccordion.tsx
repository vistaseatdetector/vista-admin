"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/http/fetcher";
import { WeekendPayload } from "@/types/reports";
import WeekendBar from "@/components/reports/WeekendBar";
import KpiRow from "@/components/reports/KpiRow";
import DownloadButtons from "@/components/reports/DownloadButton";
import { DateTime } from "luxon";

type WeekRow = { weekend_start_local: string; total: number; delta_vs_prev: number | null; };
type WeeksPayload = { orgId: string; orgTimezone: string; weekends: WeekRow[]; };

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
  );
}

function WeekItem({ orgId, tz, row }: { orgId: string; tz: string; row: WeekRow }) {
  const [open, setOpen] = useState(false);

  const pretty = DateTime.fromISO(row.weekend_start_local, { zone: tz });
  const label = `Weekend of ${pretty.toFormat("LLL d")}–${pretty.plus({ days: 1 }).toFormat("d, yyyy")}`;

  // Lazy-load detailed weekend data when opened
  const url = open
    ? `/api/reports/weekend?orgId=${encodeURIComponent(orgId)}&date=${pretty.toISODate()}`
    : null;

  const { data, error, isLoading } = useSWR<WeekendPayload>(url, jsonFetcher, {
    revalidateOnFocus: false,
  });

  return (
    <div className="border border-white/15 rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-white/5 hover:bg-white/10"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <Chevron open={open} />
          <div className="font-medium">{label}</div>
        </div>
        <div className="text-sm opacity-80 flex items-center gap-3">
          <span>Total: {row.total.toLocaleString()}</span>
          <span className={`${row.delta_vs_prev == null ? "opacity-60" : row.delta_vs_prev >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {row.delta_vs_prev == null ? "—" : (row.delta_vs_prev >= 0 ? "+" : "") + row.delta_vs_prev}
          </span>
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white/5">
          {isLoading && <div className="opacity-70">Loading…</div>}
          {error && <div className="text-rose-400">Error: {(error as any)?.message ?? String(error)}</div>}
          {data && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm opacity-80">{data.weekendLabel}</div>
                <DownloadButtons
                  orgId={orgId}
                  weekendStartISO={data.window.startISO}
                  monthYear={{
                    year: DateTime.fromISO(data.window.startISO).year,
                    month: DateTime.fromISO(data.window.startISO).month
                  }}
                />
              </div>
              <KpiRow
                total={data.kpis.total}
                avgPerMass={data.kpis.avgPerMass}
                maxService={data.kpis.maxService}
              />
              <WeekendBar rows={data.masses} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function WeekAccordion({ orgId }: { orgId: string }) {
  const url = `/api/reports/weeks?orgId=${encodeURIComponent(orgId)}&count=10`;
  const { data, error, isLoading } = useSWR<WeeksPayload>(url, jsonFetcher, { revalidateOnFocus: false });

  if (isLoading) return <div className="opacity-70">Loading weeks…</div>;
  if (error) return <div className="text-rose-400">Error: {(error as any)?.message ?? String(error)}</div>;
  if (!data || data.weekends.length === 0) return <div className="opacity-60">No past weekends yet.</div>;

  return (
    <div className="space-y-3">
      {data.weekends.map((w) => (
        <WeekItem key={w.weekend_start_local} orgId={orgId} tz={data.orgTimezone} row={w} />
      ))}
    </div>
  );
}
