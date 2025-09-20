"use client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Org = { id: string; name: string; slug: string };

export default function OrgSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [current, setCurrent] = useState<string>("");

  useEffect(() => {
    (async () => {
      // load orgs where current user is a member
      const { data, error } = await supabase
        .from("orgs")
        .select("id,name,slug");
      if (!error && data) {
        setOrgs(data);
        // naive: detect current slug from URL /[org]/...
        const parts = pathname.split("/").filter(Boolean);
        const slug = parts[0] || "";
        setCurrent(slug);
      }
    })();
  }, [pathname, supabase]);

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-neutral-500">Org</label>
      <select
        className="rounded-lg border px-2 py-1 bg-white"
        value={current}
        onChange={(e) => {
          const nextSlug = e.target.value;
          setCurrent(nextSlug);
          router.push(`/${nextSlug}`);
        }}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.slug}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}
