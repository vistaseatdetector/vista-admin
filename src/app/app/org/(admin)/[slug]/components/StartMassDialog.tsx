"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { useCurrentMass } from "@/contexts/CurrentMassContext";

type NextOccurrence = {
  id: string;
  mass_id: string;
  mass_name: string | null;
  scheduled_starts_at: string;
  scheduled_ends_at: string;
};

type Props = {
  orgId: string;
  nextOccurrence: NextOccurrence | null;
};

type MassOption = {
  id: string;
  name: string | null;
};

export default function StartMassDialog({ orgId, nextOccurrence }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { refresh } = useCurrentMass();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"scheduled" | "adhoc" | null>(null);
  const [masses, setMasses] = useState<MassOption[]>([]);
  const [selectedMassId, setSelectedMassId] = useState<string>("");
  const [newMassName, setNewMassName] = useState<string>("");

  // Load Mass templates for the adhoc option when the dialog opens
  useEffect(() => {
    const loadMasses = async () => {
      const { data, error } = await supabase
        .from("masses")
        .select("id, name")
        .eq("org_id", orgId)
        .order("name", { ascending: true });

      if (error) {
        console.error("[StartMassDialog] loadMasses error:", error);
        setMasses([]);
        setSelectedMassId("");
        return;
      }

      const rows = (data as any) ?? [];
      setMasses(rows);
      setSelectedMassId((prev) => (prev ? prev : rows[0]?.id ?? ""));
    };

    if (open) {
      loadMasses();
    }
  }, [open, orgId, supabase]);

  const handleStartScheduled = async () => {
    if (!nextOccurrence) return;

    setLoading("scheduled");
    try {
      const { error } = await supabase.rpc("start_mass_occurrence", {
        p_mass_id: nextOccurrence.mass_id,
        p_schedule_id: nextOccurrence.id,
        p_started_by: null,
      });

      if (error) {
        console.error("[StartMassDialog] start scheduled error:", error);
        alert(error.message || "Failed to start scheduled Mass.");
        return;
      }

      await refresh();
      // extra nudge in case of eventual consistency
      setTimeout(() => {
        refresh().catch(() => {});
      }, 500);
      setOpen(false);
    } catch (err: any) {
      console.error("[StartMassDialog] scheduled handler error:", err);
      alert(err.message || "Unexpected error starting scheduled Mass.");
    } finally {
      setLoading(null);
    }
  };

  const handleStartAdhoc = async () => {
    if (!selectedMassId) {
      alert("Please select a Mass.");
      return;
    }

    setLoading("adhoc");
    try {
      const { error } = await supabase.rpc("start_mass_occurrence", {
        p_mass_id: selectedMassId,
        p_schedule_id: null,
        p_started_by: null,
      });

      if (error) {
        console.error("[StartMassDialog] start adhoc error:", error);
        alert(error.message || "Failed to start Mass.");
        return;
      }

      await refresh();
      setTimeout(() => {
        refresh().catch(() => {});
      }, 500);
      setOpen(false);
    } catch (err: any) {
      console.error("[StartMassDialog] adhoc handler error:", err);
      alert(err.message || "Unexpected error starting Mass.");
    } finally {
      setLoading(null);
    }
  };

  const handleCreateAndStart = async () => {
    const name = newMassName.trim();
    if (!name) {
      alert("Please enter a Mass name.");
      return;
    }

    setLoading("adhoc");
    try {
      // Build minimal required fields for a valid Mass template
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const startHH = pad(now.getHours());
      const startMM = pad(now.getMinutes());
      const startSS = pad(now.getSeconds());
      const endDate = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
      const endHH = pad(endDate.getHours());
      const endMM = pad(endDate.getMinutes());
      const endSS = pad(endDate.getSeconds());

      const weekday = now.getDay(); // 0..6
      const start_time = `${startHH}:${startMM}:${startSS}`;
      const end_time = `${endHH}:${endMM}:${endSS}`;

      const { data: inserted, error: insertError } = await supabase
        .from("masses")
        .insert({
          org_id: orgId,
          // location not required; leave null if schema allows
          location_id: null,
          name,
          weekday,
          start_time,
          end_time,
          starts_at: now.toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error("[StartMassDialog] create mass error:", insertError);
        alert(insertError?.message || "Failed to create Mass template.");
        setLoading(null);
        return;
      }

      const newId = (inserted as any).id as string;
      const { error } = await supabase.rpc("start_mass_occurrence", {
        p_mass_id: newId,
        p_schedule_id: null,
        p_started_by: null,
      });

      if (error) {
        console.error("[StartMassDialog] start newly-created error:", error);
        alert(error.message || "Failed to start Mass.");
        setLoading(null);
        return;
      }

      await refresh();
      setTimeout(() => {
        refresh().catch(() => {});
      }, 500);
      setOpen(false);
    } catch (err: any) {
      console.error("[StartMassDialog] create-and-start handler error:", err);
      alert(err.message || "Unexpected error creating/starting Mass.");
    } finally {
      setLoading(null);
    }
  };

  const formattedScheduledTime =
    nextOccurrence &&
    new Date(nextOccurrence.scheduled_starts_at).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center px-4 py-2 rounded-xl
                   bg-blue-500/80 hover:bg-blue-500 transition-colors
                   text-sm font-medium text-white
                   border border-blue-300/50 shadow-[0_10px_30px_rgba(59,130,246,0.35)]
                   backdrop-blur-lg"
      >
        Start Mass
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 2147483647 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm" />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-base font-semibold">Start Mass</h3>
              <button
                onClick={() => !loading && setOpen(false)}
                className="text-white/70 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Scheduled Mass option */}
              <div className="rounded-xl border border-blue-400/40 bg-blue-500/10 p-4">
                <div className="text-xs font-semibold uppercase text-blue-200/80">
                  Scheduled Mass
                </div>
                {nextOccurrence ? (
                  <>
                    <div className="mt-1 text-lg font-semibold">
                      {nextOccurrence.mass_name || "Unnamed Mass"}
                    </div>
                    <div className="text-sm text-blue-100/80">
                      {formattedScheduledTime}
                    </div>
                    <button
                      type="button"
                      onClick={handleStartScheduled}
                      disabled={loading === "scheduled"}
                      className="mt-3 inline-flex items-center justify-center px-3 py-1.5 rounded-lg
                                 bg-blue-500/80 hover:bg-blue-500 transition-colors text-xs font-medium
                                 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loading === "scheduled" ? "Starting…" : "Start scheduled Mass"}
                    </button>
                  </>
                ) : (
                  <div className="mt-1 text-sm text-blue-100/80">No upcoming scheduled Mass found.</div>
                )}
              </div>

              {/* Ad hoc Mass option */}
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase text-white/70">
                  Start new Mass now
                </div>
                {masses.length > 0 && (
                  <>
                    <label className="block text-xs text-white/60">Choose Mass</label>
                    <select
                      value={selectedMassId}
                      onChange={(e) => setSelectedMassId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/25 bg-black/30 px-3 py-2 text-sm text-white focus:border-white/50 focus:outline-none"
                    >
                      {masses.map((m) => (
                        <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                          {m.name?.trim() || m.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleStartAdhoc}
                      disabled={loading === "adhoc" || !selectedMassId}
                      className="mt-3 inline-flex items-center justify-center px-3 py-1.5 rounded-lg
                                 bg-emerald-500/80 hover:bg-emerald-500 transition-colors text-xs font-medium
                                 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loading === "adhoc" ? "Starting…" : "Start selected Mass now"}
                    </button>
                    <div className="my-3 h-px bg-white/10" />
                  </>
                )}

                {/* Create and start a new Mass immediately */}
                <label className="block text-xs text-white/60">Create and start a new Mass</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    placeholder="Mass name"
                    value={newMassName}
                    onChange={(e) => setNewMassName(e.target.value)}
                    className="flex-1 rounded-lg border border-white/25 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCreateAndStart}
                    disabled={loading === "adhoc"}
                    className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-xs font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading === "adhoc" ? "Starting…" : "Create & Start"}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}
