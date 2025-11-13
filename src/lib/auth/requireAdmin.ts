import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminForOrg(orgSlug: string) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect(`/login?to=/app/org/${encodeURIComponent(orgSlug)}`);
  }

  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (orgErr || !org) {
    redirect("/onboarding");
  }

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", session!.user.id)
    .maybeSingle();

  const isAdmin =
    membership && (membership.role === "owner" || membership.role === "admin");
  if (!isAdmin) {
    redirect(`/not-an-admin?org=${encodeURIComponent(orgSlug)}`);
  }

  return { orgId: org.id, userId: session!.user.id };
}

