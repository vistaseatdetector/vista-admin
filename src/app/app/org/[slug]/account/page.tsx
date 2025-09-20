"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GlassCard from "@/components/ui/GlassCard";





type OrgRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  bg_url: string | null;
  accent_color: string | null;
  profile_url: string | null;
};

export default function AccountPage() {
  const { slug } = useParams<{ slug: string }>();
  const supabase = createClient();
  const [row, setRow] = useState<OrgRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("orgs").select("*").eq("slug", slug).maybeSingle();
      setRow((data as any) ?? null);
    })();
  }, [slug, supabase]);

  async function upload(column: keyof OrgRow, file: File) {
    if (!row) return;
    const key = `${row.id}/${column}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("branding").upload(key, file, { upsert: true });
    if (upErr) return alert(upErr.message);
    const { data: pub } = await supabase.storage.from("branding").getPublicUrl(key);
    await supabase.from("orgs").update({ [column]: pub.publicUrl }).eq("id", row.id);
    setRow({ ...row, [column]: pub.publicUrl });
  }

  async function saveAccent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!row) return;
    const color = new FormData(e.currentTarget).get("accent")?.toString() || null;
    await supabase.from("orgs").update({ accent_color: color }).eq("id", row.id);
    setRow({ ...row, accent_color: color });
  }

  if (!row) return <div className="p-4">Loading…</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Profile & Appearance</h1>

      <GlassCard>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="font-semibold mb-2">Logo</div>
            {row.logo_url && <img src={row.logo_url} alt="logo" className="h-12 mb-3" />}
            <input type="file" accept="image/*" onChange={(e)=> e.target.files && upload("logo_url", e.target.files[0])}/>
          </div>

          <div>
            <div className="font-semibold mb-2">Background image (Analytics)</div>
            {row.bg_url && <img src={row.bg_url} alt="bg" className="h-20 w-full object-cover rounded mb-3" />}
            <input type="file" accept="image/*" onChange={(e)=> e.target.files && upload("bg_url", e.target.files[0])}/>
          </div>

          <div>
            <div className="font-semibold mb-2">Profile picture</div>
            {row.profile_url && <img src={row.profile_url} alt="profile" className="h-16 w-16 rounded-full mb-3" />}
            <input type="file" accept="image/*" onChange={(e)=> e.target.files && upload("profile_url", e.target.files[0])}/>
          </div>

          <div>
            <div className="font-semibold mb-2">Accent color</div>
            <form onSubmit={saveAccent} className="flex items-center gap-3">
              <input type="color" name="accent" defaultValue={row.accent_color ?? "#56a3b2"} className="h-10 w-16"/>
              <button className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15">Save</button>
            </form>
          </div>

          <div className="md:col-span-2">
            <div className="font-semibold mb-2">Theme</div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15"
                onClick={()=>document.documentElement.classList.remove("light")}>Dark</button>
              <button className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15"
                onClick={()=>document.documentElement.classList.add("light")}>Light</button>
            </div>
            <p className="text-xs text-white/60 mt-2">For a full theme switcher later we can add <code>next-themes</code>.</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
