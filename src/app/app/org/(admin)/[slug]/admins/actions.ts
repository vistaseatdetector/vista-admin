'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { revalidatePath } from 'next/cache';

async function serverClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (key: string) => cookieStore.get(key)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}

// If your API route derives invitedBy from cookies (recommended), you can drop invitedBy from the body.
// Keeping it is fine too — the route will just ignore it.
export async function inviteAdminAction(input: {
  orgId: string;
  email: string;
  name?: string;
  role?: 'admin' | 'member';
}) {
  const supa = await serverClient();
  const { data: me } = await supa.auth.getUser();
  if (!me?.user?.id) throw new Error('Not authenticated');

  const url = new URL('/api/admins/invite', getBaseUrl());

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      orgId: input.orgId,
      email: input.email,
      name: input.name ?? null,
      role: input.role ?? 'admin',
      // invitedBy: me.user.id, // optional if your route reads cookies
    }),
  });

  const text = await res.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}

  if (!res.ok) {
    const msg = payload?.error || `Invite failed (${res.status}) ${text || ''}`;
    throw new Error(msg);
  }
  revalidatePath('/app');
}

// ✅ NEW: delete by composite key (org_id + user_id)
export async function removeAdminByUserId(userId: string, orgId: string) {
  const supa = await serverClient();
  const { error } = await supa
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/app');
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}
