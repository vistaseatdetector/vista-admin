import InviteForm from "@/components/Admin/InviteForm";
import { createClient } from "@/lib/supabase/server";

type Profile = { id: string; email: string | null; full_name: string | null };
type Member = { role: "admin" | "usher" | "viewer"; profiles: Profile | Profile[] | null };

export default async function MembersPage({ params }: { params: { org: string } }) {
  const supabase = createClient();

  // 1) Load org by slug
  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .select("id, name, slug")
    .eq("slug", params.org)
    .single();

  if (orgErr || !org) {
    return <div className="p-6">Org not found.</div>;
  }

  // 2) Load members + joined profile
  const { data, error } = await supabase
    .from("org_memberships")
    .select("role, profiles:profiles(id, email, full_name)")
    .eq("org_id", org.id);

  if (error) {
    return <div className="p-6 text-red-600">Error: {error.message}</div>;
  }

  // Cast and normalize profiles whether it's an object or an array
  const members = (data as unknown as Member[]) ?? [];
  const rows = members.map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      role: m.role,
      full_name: p?.full_name ?? "—",
      email: p?.email ?? "—",
    };
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Members — {org.name}</h1>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-medium">Current Members</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t">
                <td className="py-2">{r.full_name}</td>
                <td className="py-2">{r.email}</td>
                <td className="py-2">{r.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InviteForm orgId={org.id} />
    </div>
  );
}
