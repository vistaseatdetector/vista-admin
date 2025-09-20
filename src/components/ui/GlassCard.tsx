import { cn } from "@/lib/utils";

export default function GlassCard({
  className,
  children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "vista-card",                       // ⬅️ add this
        "rounded-2xl bg-white/6 border border-white/10",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_20px_rgba(0,0,0,0.25)]",
        "p-7 md:p-8",
        "overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}





