"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InviteDialogProps = {
  open: boolean;
  orgId: string;
  orgName: string;
  role: "admin" | "usher";
  onClose: () => void;
  onSuccess: (message: string) => void;
};

export default function InviteDialog({
  open,
  orgId,
  orgName,
  role,
  onClose,
  onSuccess,
}: InviteDialogProps) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Email is required.");
      return;
    }

    setLoading(true);
    try {
      const { error: rpcError } = await (supabase as any).rpc("invite_user", {
        p_org: orgId,
        p_email: trimmed,
        p_role: role,
      });
      if (rpcError) throw new Error(rpcError.message);

      setEmail("");
      onSuccess(`Invite sent to ${trimmed}.`);
      onClose();
    } catch (inviteError) {
      const message =
        inviteError instanceof Error
          ? inviteError.message
          : "Failed to send invite.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 p-5 text-white shadow-xl">
        <header className="mb-4">
          <h2 className="text-lg font-semibold">
            Invite {role === "admin" ? "Admin" : "Usher"}
          </h2>
          <p className="text-sm text-white/70">
            {orgName}
          </p>
        </header>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-white/80">
            Email
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-white/40"
              placeholder="person@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          {error ? <p className="text-sm text-rose-200">{error}</p> : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-white/30 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-white/90 px-3 py-1.5 text-sm font-semibold text-gray-900 transition hover:bg-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
