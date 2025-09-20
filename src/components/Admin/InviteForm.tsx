"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function InviteForm({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "usher" | "viewer">("viewer");
  const [link, setLink] = useState<string>("");

  async function createInvite() {
    setLink("");
    const token = crypto.randomUUID();

    const { data, error } = await supabase
      .from("org_invitations")
      .insert({ org_id: orgId, email, role, token })
      .select("token")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    const acceptUrl = `${window.location.origin}/accept-invite/${data!.token}`;
    setLink(acceptUrl);
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-medium">Invite someone</h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-sm text-neutral-500">Email</label>
          <input
            type="email"
            className="w-full rounded-lg border px-3 py-2"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-500">Role</label>
          <select
            className="rounded-lg border px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="viewer">viewer</option>
            <option value="usher">usher</option>
            <option value="admin">admin</option>
          </select>
        </div>

        <button
          onClick={createInvite}
          className="rounded-2xl border px-4 py-2 shadow-sm"
        >
          Create invite link
        </button>
      </div>

      {link && (
        <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm">
          Invite link created. Share it with the invitee:
          <div className="mt-1 break-all">{link}</div>
          <button
            onClick={() => navigator.clipboard.writeText(link)}
            className="mt-2 rounded-lg border px-3 py-1 text-xs"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

