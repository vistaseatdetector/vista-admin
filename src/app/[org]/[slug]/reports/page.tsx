"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { jsonFetcher } from "@/lib/http/fetcher";
import { WeekendPayload, TrendPayload } from "@/types/reports";
import WeekendBar from "@/components/reports/WeekendBar";
import TrendLine from "@/components/reports/TrendLine";
import KpiRow from "@/components/reports/KpiRow";
import DownloadButtons from "@/components/reports/DownloadButtons";
import GlassCard from "@/components/ui/GlassCard";
import { DateTime } from "luxon";
import WeekAccordion from "@/components/reports/WeekAccordion";

// NEW imports (from Step 11)
import MassFilter from "@/components/reports/MassFilter";
import { CompareToggle } from "@/components/reports/TrendControls";

// --- helpers ---
async function fetchOrgInfoBySlug(
  slug: string
): Promise<{ id: string; timezone: string; name?: string }> {
  const res = await fetch(`/api/org/${encodeURIComponent(slug)}/info`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Simple/robust: previous weekend = minus 1 week.
// Your backend already snaps "date" to the correct weekend boundary (Sat 12:00 PM) by timezone.
function previousWeekendISO(dateISO: string, tz: string) {
  return DateTime.fromISO(dateISO, { zone: tz }).minus({ weeks: 1 }).toISO()!;
}

export default function ReportsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const search = useSearchParams();

  // Org info
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgTz, setOrgTz] = useState<string | null>(null);
  const [orgErr, setOrgErr] = useState<string | null>(null);

  // Date selector (undefined = backend uses “last weekend”)
  const [selectedDateISO, setSelectedDateISO] = useState<string | undefined>(
    undefined
  );

  // Trend mode & window
  const [trendMode, setTrendMode] = useState<"weekend_total" | "per_mass">(
    "weekend_total"
  );
  const [trendWeeks, setTrendWeeks] = useState<number>(5);

  // Mass filtering & compare toggle
  const [masses, setMasses] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedMassIds, setSelectedMassIds] = useState<string[]>([]); // empty = All Masses
  const [comparePrev, setComparePrev] = useState<boolean>(false);

  // ✅ Initialize state from URL once (after state hooks are declared)
  useEffect(() => {
    const date = search.get("date") || undefined;
    const mode =
      (search.get("mode") as "weekend_total" | "per_mass") || "weekend_total";
    const weeks = Number(search.get("weeks") || "5");
    const m = (search.get("m") || "").split(",").filter(Boolean);
    const cmp = search.get("cmp") === "1";

    setSelectedDateISO(date);
    setTrendMode(mode);
    setTrendWeeks(!Number.isNaN(weeks) && weeks > 0 ? weeks : 5);
    setSelectedMassIds(m);
    setComparePrev(cmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // ✅ Mirror current UI state back into the URL (replace to avoid history spam)
  function setUrlFromState() {
    const p = new URLSearchParams(search.toString()); // start from current params
    if (selectedDateISO) p.set("date", selectedDateISO);
    else p.delete("date");

    if (trendMode) p.set("mode", trendMode);
    else p.delete("mode");

    if (trendWeeks) p.set("weeks", String(trendWeeks));
    else p.delete("weeks");

    if (selectedMassIds.length) p.set("m", selectedMassIds.join(","));
    else p.delete("m");

    if (comparePrev) p.set("cmp", "1");
    else p.delete("cmp");

    router.replace(`?${p.toString()}`);
  }

  useEffect(() => {
    setUrlFromState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateISO, trendMode, trendWeeks, selectedMassIds, comparePrev]);

  // Load orgId + timezone once
  useEffect(() => {
    (async () => {
      try {
        const org = await fetchOrgInfoBySlug(slug);
        setOrgId(org.id);
        setOrgTz(org.timezone);
      } catch (e: any) {
        setOrgErr(e?.message ?? "Failed to load organization.");
      }
    })();
  }, [slug]);

  // Load masses for this org/slug
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/org/${encodeURIComponent(slug)}/masses`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as Array<{ id: string; title: string }>;
        if (active) setMasses(data);
      } catch (e) {
        console.error("Failed to load masses:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  // Build query params shared by weekend + trend endpoints
  const commonParams = useMemo(() => {
    const p = new URLSearchParams();
    if (orgId) p.set("orgId", orgId);
    if (selectedMassIds.length) p.set("massIds", selectedMassIds.join(","));
    return p;
  }, [orgId, selectedMassIds]);

  // Weekend (current/selected)
  const weekendUrl = useMemo(() => {
    if (!orgId) return null;
    const params = new URLSearchParams(commonParams);
    if (selectedDateISO) params.set("date", selectedDateISO);
    return `/api/reports/weekend?${params.toString()}`;
  }, [orgId, selectedDateISO, commonParams]);

  const {
    data: weekend,
    error: weekendErr,
    isLoading: weekendLoading,
  } = useSWR<WeekendPayload>(weekendUrl, jsonFetcher, {
    revalidateOnFocus: false,
  });

  // Trend
  const trendUrl = useMemo(() => {
    if (!orgId) return null;
    const params = new URLSearchParams(commonParams);
    params.set("weeks", String(trendWeeks));
    params.set("mode", trendMode);
    return `/api/reports/trend?${params.toString()}`;
  }, [orgId, trendMode, trendWeeks, commonParams]);

  const {
    data: trend,
    error: trendErr,
    isLoading: trendLoading,
  } = useSWR<TrendPayload>(trendUrl, jsonFetcher, {
    revalidateOnFocus: false,
  });

  // Previous weekend overlay for the Weekend chart
  const compareWeekendUrl = useMemo(() => {
    if (!comparePrev || !weekend?.window.startISO || !orgTz || !orgId)
      return null;
    const prevISO = previousWeekendISO(weekend.window.startISO, orgTz);
    const params = new URLSearchParams(commonParams);
    params.set("date", prevISO);
    return `/api/reports/weekend?${params.toString()}`;
  }, [comparePrev, weekend?.window.startISO, orgTz, orgId, commonParams]);

  const {
    data: weekendCompare,
    error: weekendCompareErr,
    isLoading: weekendCompareLoading,
  } = useSWR<WeekendPayload>(compareWeekendUrl, jsonFetcher, {
    revalidateOnFocus: false,
  });

  // Guards
  if (orgErr) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="text-red-400 mt-3">
          Error loading organization: {orgErr}
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="opacity-70 mt-3">Loading organization…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>

      {/* Controls */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs block mb-1 opacity-80">Weekend Date</label>
            <input
              type="date"
              className="rounded-xl px-3 py-2 bg-white/10 border border-white/20"
              value={selectedDateISO ?? ""}
              onChange={(e) => setSelectedDateISO(e.target.value || undefined)}
            />
            <div className="text-[11px] opacity-60 mt-1">
              Pick any date; we’ll snap to that weekend (Sat 12pm reset).
            </div>
          </div>

          <div>
            <label className="text-xs block mb-1 opacity-80">Trend Mode</label>
            <select
              className="rounded-xl px-3 py-2 bg-white/10 border border-white/20"
              value={trendMode}
              onChange={(e) => setTrendMode(e.target.value as any)}
            >
              <option value="weekend_total">Weekend Total</option>
              <option value="per_mass">Per Mass</option>
            </select>
          </div>

          <div>
            <label className="text-xs block mb-1 opacity-80">Weeks</label>
            <input
              type="number"
              min={1}
              max={52}
              className="w-24 rounded-xl px-3 py-2 bg-white/10 border border-white/20"
              value={trendWeeks}
              onChange={(e) => setTrendWeeks(Number(e.target.value || 5))}
            />
          </div>

          {/* Mass Filter */}
          <div className="ml-auto">
            <label className="text-xs block mb-1 opacity-80">Mass Filters</label>
            <MassFilter
              masses={masses}
              value={selectedMassIds}
              onChange={setSelectedMassIds}
            />
          </div>

          {/* Compare toggle */}
          <div>
            <label className="text-xs block mb-1 opacity-80">Compare</label>
            <CompareToggle enabled={comparePrev} onChange={setComparePrev} />
          </div>
        </div>
      </GlassCard>

      {/* Most Recent Weekend */}
      <GlassCard className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            {weekend?.weekendLabel ?? "Most Recent Weekend"}
          </h2>
          <DownloadButtons
            orgId={orgId}
            weekendStartISO={weekend?.window.startISO}
            monthYear={
              weekend
                ? {
                    year: DateTime.fromISO(weekend.window.startISO).year,
                    month: DateTime.fromISO(weekend.window.startISO).month,
                  }
                : undefined
            }
            // forward filters/mode so your routes include them
            massIds={selectedMassIds}
            trendMode={trendMode}
          />
        </div>

        {weekendLoading && (
          <div className="opacity-70">Loading weekend data…</div>
        )}
        {weekendErr && (
          <div className="text-red-400">
            Error: {(weekendErr as any)?.message ?? String(weekendErr)}
          </div>
        )}

        {weekend && (
          <>
            <KpiRow
              total={weekend.kpis.total}
              avgPerMass={weekend.kpis.avgPerMass}
              maxService={weekend.kpis.maxService}
            />
            {/* Pass compare overlay if present */}
            <WeekendBar
              rows={weekend.masses}
              compareRows={
                comparePrev && weekendCompare ? weekendCompare.masses : undefined
              }
              compareLabel={
                comparePrev && weekendCompare
                  ? weekendCompare.weekendLabel
                  : undefined
              }
              loadingCompare={comparePrev && weekendCompareLoading}
              errorCompare={
                comparePrev && weekendCompareErr
                  ? String(
                      (weekendCompareErr as any)?.message ?? weekendCompareErr
                    )
                  : undefined
              }
            />
          </>
        )}
      </GlassCard>

      {/* Trend */}
      <GlassCard className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Attendance Trend</h2>
        </div>
        {trendLoading && <div className="opacity-70">Loading trend…</div>}
        {trendErr && (
          <div className="text-red-400">
            Error: {(trendErr as any)?.message ?? String(trendErr)}
          </div>
        )}
        {trend && <TrendLine payload={trend} />}
      </GlassCard>

      {/* Past Weeks */}
      <GlassCard className="p-4">
        <h2 className="text-lg font-medium mb-3">Past Weeks</h2>
        <WeekAccordion orgId={orgId} />
      </GlassCard>
    </div>
  );
}

