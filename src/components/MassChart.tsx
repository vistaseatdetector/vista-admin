"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export type MassDatum = { label: string; people: number };

export default function MassChart({ data, total }: { data: MassDatum[]; total: number }) {
  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-medium">Attendance by Mass</div>
        <div className="text-sm text-gray-700">Total: <span className="font-semibold">{total}</span></div>
      </div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis />
            <Tooltip formatter={(v: unknown) => [v as number | string, "People"]} />
            <Bar dataKey="people" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
