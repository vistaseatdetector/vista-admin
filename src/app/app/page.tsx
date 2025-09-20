"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RoleRow = { org_id: string; role: string; user_id?: string };
type Org = { id: string; name: string; slug: string };

export default function AppHomeClient() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState<Org[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: roles } = await supabase
        .from("user_org_roles")
        .select("org_id, role, user_id")
        .eq("user_id", user.id);

      if (!roles || roles.length === 0) { setOrgs([]); return; }

      const ids = roles.map(r => r.org_id);
      const { data: oData } = await supabase
        .from("orgs")
        .select("id, name, slug")
        .in("id", ids);

      setOrgs(oData ?? []);
    })();
  }, []);

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vista Admin</h1>
        <form action="/logout" method="post">
          <button className="border rounded px-3 py-1">Log out</button>
        </form>
      </header>

      {!orgs ? (
        <div>Loading…</div>
      ) : orgs.length === 0 ? (
        <div>No churches yet.</div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((o) => (
            <a key={o.id} href={`/app/org/${o.slug}`} className="border rounded-xl p-4 hover:bg-gray-50">
              <div className="text-lg font-medium">{o.name}</div>
              <div className="text-xs text-gray-500">Open to admins/viewers</div>
            </a>
          ))}
        </section>
      )}
    </main>
  );
}




