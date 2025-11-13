"use client";
import { useMemo, useState } from "react";

type Mass = { id: string; title: string };

export default function MassFilter({
  masses,
  value,
  onChange,
}: {
  masses: Mass[];
  value: string[];              // selected massIds (empty => all)
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = value.length === 0;
  const label = useMemo(() => {
    if (allSelected) return "All Masses";
    if (value.length === 1) {
      const one = masses.find(m => m.id === value[0]);
      return one?.title ?? "1 selected";
    }
    return `${value.length} selected`;
  }, [allSelected, value, masses]);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  }

  function selectAll() { onChange([]); }

  return (
    <div className="relative inline-block">
      <button
        className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 backdrop-blur-md"
        onClick={() => setOpen(o => !o)}
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-20 mt-2 min-w-[260px] rounded-xl border border-white/10 bg-neutral-900/90 p-2 backdrop-blur-md shadow-xl">
          <button
            className={`w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 ${allSelected ? "opacity-80" : ""}`}
            onClick={selectAll}
          >
            All Masses
          </button>
          <div className="my-2 h-px bg-white/10" />
          <div className="max-h-64 overflow-auto pr-1">
            {masses.map(m => {
              const checked = value.includes(m.id);
              return (
                <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-white"
                    checked={checked}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="truncate">{m.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
