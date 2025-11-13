"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PendingRequestRow } from "@/lib/types";

type RequestsDialogProps = {
  open: boolean;
  orgId: string;
  orgName: string;
  onClose: () => void;
  onNotify: (message: string, variant: "success" | "error") => void;
};

export default function RequestsDialog({
  open,
  orgId,
  orgName,
  onClose,
  onNotify,
}: RequestsDialogProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<PendingRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: pendingError } = await supabase
      .from("usher_requests_with_name")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (pendingError) {
      setError(pendingError.message);
      setRequests([]);
    } else {
      const typed = (data ?? []) as PendingRequestRow[];
      setRequests(typed);
    }
    setLoading(false);
  }, [orgId, supabase]);

  useEffect(() => {
    if (open) {
      loadRequests();
    }
  }, [open, loadRequests]);

  if (!open) return null;

  async function handleApprove(request: PendingRequestRow) {
    setBusyId(request.id);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      onNotify(authError.message, "error");
      setBusyId(null);
      return;
    }

    const me = authData.user?.id;
    if (!me) {
      onNotify("Not signed in.", "error");
      setBusyId(null);
      return;
    }

    const { error: memberError } = await supabase
      .from("org_members")
      .upsert(
        [
          {
            org_id: request.org_id,
            user_id: request.user_id,
            role: "usher",
            added_by: me,
          },
        ],
        { onConflict: "org_id,user_id", ignoreDuplicates: false }
      );

    if (memberError) {
      onNotify(memberError.message, "error");
      setBusyId(null);
      return;
    }

    const { error: requestError } = await supabase
      .from("usher_requests")
      .update({ status: "approved" })
      .eq("id", request.id);

    if (requestError) {
      onNotify(requestError.message, "error");
      setBusyId(null);
      return;
    }

    setRequests((prev) => prev.filter((item) => item.id !== request.id));
    onNotify("Usher approved.", "success");
    setBusyId(null);
  }

  async function handleReject(request: PendingRequestRow) {
    setBusyId(request.id);

    const { error: requestError } = await supabase
      .from("usher_requests")
      .update({ status: "rejected" })
      .eq("id", request.id);

    if (requestError) {
      onNotify(requestError.message, "error");
      setBusyId(null);
      return;
    }

    setRequests((prev) => prev.filter((item) => item.id !== request.id));
    onNotify("Request rejected.", "success");
    setBusyId(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900/95 p-5 text-white shadow-xl">
        <header className="mb-4">
          <h2 className="text-lg font-semibold">Pending Usher Requests</h2>
          <p className="text-sm text-white/70">{orgName}</p>
        </header>

        {loading ? (
          <p className="text-white/80">Loading requests…</p>
        ) : error ? (
          <p className="text-rose-200">Failed to load requests: {error}</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-white/80">No pending requests.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => {
              const displayName =
                request.user_name ?? request.email ?? request.user_id;
              return (
                <li
                  key={request.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-white/90">
                        {displayName}
                      </div>
                      {request.email ? (
                        <div className="text-xs text-white/70">{request.email}</div>
                      ) : null}
                      <div className="text-xs text-white/60">
                        Requested at:{" "}
                        {(() => {
                          const requestedAt =
                            request.requested_at ?? request.created_at ?? null;
                          if (!requestedAt) return "—";
                          return new Date(requestedAt).toLocaleString();
                        })()}
                      </div>
                      <div className="text-xs text-white/40">
                        User ID: {request.user_id}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-xl border border-emerald-300/40 bg-emerald-200/20 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-200/30 disabled:opacity-60"
                        onClick={() => handleApprove(request)}
                        disabled={busyId === request.id}
                      >
                        Approve
                      </button>
                      <button
                        className="rounded-xl border border-rose-300/40 bg-rose-200/20 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-200/30 disabled:opacity-60"
                        onClick={() => handleReject(request)}
                        disabled={busyId === request.id}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex justify-end">
          <button
            className="rounded-xl border border-white/30 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
