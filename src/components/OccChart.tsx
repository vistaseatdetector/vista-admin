"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export type OccPoint = { t: string; people: number };

export default function OccChart({ data }: { data: OccPoint[] }) {
  // data expects ISO time in t, integer in people
  return (
    <div className="border rounded-xl p-4">
      <div className="font-medium mb-2">Attendance (last 24h)</div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <XAxis
              dataKey="t"
              tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              minTickGap={30}
            />
            <YAxis />
            <Tooltip
              labelFormatter={(v) => new Date(v).toLocaleString()}
              formatter={(val: unknown) => [val as number | string, "People"]}
            />
            <Line type="monotone" dataKey="people" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
