"use client";

export type TrendMode = "weekend_total" | "per_mass";

export function TrendModeToggle({
  mode,
  onChange,
}: {
  mode: TrendMode;
  onChange: (m: TrendMode) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/15 overflow-hidden">
      {(["weekend_total", "per_mass"] as TrendMode[]).map(m => (
        <button
          key={m}
          className={`px-3 py-2 text-sm ${mode === m ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
          onClick={() => onChange(m)}
        >
          {m === "weekend_total" ? "All Masses Total" : "Per Mass Lines"}
        </button>
      ))}
    </div>
  );
}

export function CompareToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10">
      <input
        type="checkbox"
        className="accent-white"
        checked={enabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span>Compare vs previous weekend</span>
    </label>
  );
}
