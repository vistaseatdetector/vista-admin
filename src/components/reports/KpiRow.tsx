"use client";

type Props = {
  total: number;
  avgPerMass: number;
  maxService: { label: string; headcount: number } | null;
  className?: string;
};

export default function KpiRow({ total, avgPerMass, maxService, className }: Props) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${className ?? ""}`}>
      <div className="rounded-2xl p-4 backdrop-blur-md bg-white/10 border border-white/15">
        <div className="text-xs opacity-80">Total Weekend Attendance</div>
        <div className="text-2xl font-semibold">{total.toLocaleString()}</div>
      </div>
      <div className="rounded-2xl p-4 backdrop-blur-md bg-white/10 border border-white/15">
        <div className="text-xs opacity-80">Avg per Mass</div>
        <div className="text-2xl font-semibold">{avgPerMass}</div>
      </div>
      <div className="rounded-2xl p-4 backdrop-blur-md bg-white/10 border border-white/15">
        <div className="text-xs opacity-80">Peak Service</div>
        <div className="text-sm">
          {maxService ? (
            <>
              <div className="font-medium">{maxService.label}</div>
              <div className="opacity-80">{maxService.headcount.toLocaleString()} attendees</div>
            </>
          ) : <span className="opacity-60">—</span>}
        </div>
      </div>
    </div>
  );
}
