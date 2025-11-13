import { createClient } from "@/lib/supabase/server";

/**
 * Verifies the current request's user is a member of the org (by slug).
 * Returns { ok: true, org, role } when allowed, otherwise { ok: false, reason }.
 * Role is 'admin' for owner/admins; 'usher'/'viewer' for others.
 */
export async function requireOrgMember(slug: string) {
  // Development bypass - skip auth in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 requireOrgMember: Development bypass active for slug:', slug);
    return { 
      ok: true as const, 
      org: { 
        id: 'dev-org-id', 
        slug, 
        name: `Development Org (${slug})`,
        owner_id: 'dev-user-id' 
      }, 
      role: "admin" as const 
    };
  }

  const supabase = await createClient();

  // 1) Must be logged in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, reason: "unauth" };

  // 2) Use RLS to fetch the org + the caller's membership in one go.
  //    If the user is not a member, RLS will return 0 rows.
  const { data, error } = await supabase
    .from("orgs")
    .select(`
      id,
      slug,
      name,
      owner_id,
      org_members!inner (
        user_id,
        role
      )
    `)
    .eq("slug", slug)
    .eq("org_members.user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false as const, reason: "dberr", error };

  // If not found via membership, the user might still be the owner but not in org_members
  if (!data) {
    const { data: ownerOrg } = await supabase
      .from("orgs")
      .select("id, slug, name, owner_id")
      .eq("slug", slug)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!ownerOrg) return { ok: false as const, reason: "nomember" };
    return { ok: true as const, org: ownerOrg, role: "admin" as const };
  }

  const role = data.owner_id === user.id
    ? ("admin" as const)
    : (data.org_members?.[0]?.role ?? "viewer");
  return { ok: true as const, org: data, role };
}
