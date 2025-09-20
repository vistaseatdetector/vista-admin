"use client";
import { useParams } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";

export default function WeeklyReport() {
  const { slug, from } = useParams<{ slug: string; from: string }>();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Week of {from}</h1>
      <GlassCard>Charts/tables for {slug} go here (we can wire this later).</GlassCard>
    </div>
  );
}
