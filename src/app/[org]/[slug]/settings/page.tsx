"use client";
import { useParams } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";

export default function SettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const base = `/app/org/${slug}`;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <GlassCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <a className="rounded-2xl border border-white/15 bg-white/5 p-4 hover:bg-white/10" href={`${base}/masses`}>
            <div className="font-medium">Mass Schedule</div>
            <div className="text-sm text-white/70">Add/edit times and locations</div>
          </a>
          <a className="rounded-2xl border border-white/15 bg-white/5 p-4 hover:bg-white/10" href={`${base}/admins`}>
            <div className="font-medium">Administrators</div>
            <div className="text-sm text-white/70">Invite/remove admins</div>
          </a>
          <a className="rounded-2xl border border-white/15 bg-white/5 p-4 hover:bg-white/10" href={`${base}/streams`}>
            <div className="font-medium">Cameras / Streams</div>
            <div className="text-sm text-white/70">Add HLS streams</div>
          </a>
        </div>
      </GlassCard>
    </div>
  );
}
