'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/components/ui/GlassCard';

type MemberRow = {
  user_id: string;
  role: 'admin' | 'member';
  name: string | null;
  email: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'member';
  created_at: string;
};

// 👇 set to your actual invites table name
const INVITES_TABLE = 'org_invitations'; // or 'org_invites'

export default function OrgAdminsPage() {
  const { slug } = useParams<{ slug: string }>();
  const supa = useMemo(() => createClient(), []);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);

      // 1) org id by slug
      const { data: org, error: orgErr } = await supa
        .from('orgs')
        .select('id')
        .eq('slug', slug)
        .single();

      if (orgErr || !org) {
        if (alive) setLoading(false);
        return;
      }
      if (!alive) return;
      setOrgId(org.id);

      // 2) admins (NO 'id' column here)
      const { data: members, error: memErr } = await supa
        .from('org_members')
        .select(`
          user_id, role,
          profiles: user_id ( full_name, email )
        `)
        .eq('org_id', org.id)
        .eq('role', 'admin');

      if (!alive) return;

      if (!memErr && members) {
        setAdmins(
          (members as any[]).map((m) => ({
            user_id: m.user_id,
            role: m.role,
            name: m.profiles?.full_name ?? null,
            email: m.profiles?.email ?? null,
          }))
        );
      } else {
        setAdmins([]);
      }

      // 3) pending invites
      const { data: inv } = await supa
        .from(INVITES_TABLE)
        .select('id, email, name, role, created_at')
        .eq('org_id', org.id)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!alive) return;
      setInvites((inv ?? []) as InviteRow[]);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [slug, supa]);

  async function refreshInvites(currentOrgId: string) {
    const { data: inv } = await supa
      .from(INVITES_TABLE)
      .select('id, email, name, role, created_at')
      .eq('org_id', currentOrgId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    setInvites((inv ?? []) as InviteRow[]);
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSending(true);
    try {
      // get inviter server-side (API reads cookies)
      const res = await fetch('/api/admins/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgId,
          email: form.email.trim(),
          name: form.name.trim() || null,
          role: 'admin',
        }),
      });

      const text = await res.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) {
        throw new Error(payload?.error || `Invite failed (${res.status}) ${text || ''}`);
      }

      setForm({ name: '', email: '' });
      await refreshInvites(orgId);
    } catch (err: any) {
      alert(err?.message ?? 'Failed to invite');
    } finally {
      setSending(false);
    }
  }

  async function onRemove(userId: string) {
    if (!orgId) return;
    if (!confirm('Remove this admin?')) return;
    try {
      // delete by composite key (org_id, user_id)
      const { error } = await supa
        .from('org_members')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      setAdmins((a) => a.filter((x) => x.user_id !== userId));
    } catch (err: any) {
      alert(err?.message ?? 'Failed to remove');
    }
  }

  return (
    <div className="p-4 space-y-6">
      <GlassCard className="p-5">
        <h2 className="text-xl font-semibold mb-3">Administrators</h2>
        {loading ? (
          <div>Loading…</div>
        ) : admins.length === 0 ? (
          <div className="text-sm opacity-70">No admins yet.</div>
        ) : (
          <ul className="divide-y divide-white/10">
            {admins.map((a) => (
              <li key={a.user_id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.name ?? '(no name)'}</div>
                  <div className="text-sm opacity-80">{a.email ?? '—'}</div>
                </div>
                <button
                  onClick={() => onRemove(a.user_id)}
                  className="text-sm px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="text-lg font-semibold mb-3">Invite an Admin</h3>
        <form onSubmit={onInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Full name (optional)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-xl bg-white/10 px-3 py-2 outline-none"
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded-xl bg-white/10 px-3 py-2 outline-none"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send Invite'}
          </button>
        </form>

        {invites.length > 0 && (
          <div className="mt-6">
            <div className="text-sm font-medium mb-2">Pending Invites</div>
            <ul className="text-sm space-y-2">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between">
                  <div>
                    <div>{i.name ?? '(no name)'}</div>
                    <div className="opacity-80">{i.email}</div>
                  </div>
                  <span className="text-xs opacity-70 uppercase">{i.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

