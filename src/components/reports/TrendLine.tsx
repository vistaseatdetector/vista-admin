"use client";

import { TrendPayload } from "@/types/reports";
import { DateTime } from "luxon";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "@/components/charts/RechartsClient";

type Props = { payload: TrendPayload };
type SeriesRow = { x: string } & Record<string, number | string>;

export default function TrendLine({ payload }: Props) {
  if (payload.mode === "weekend_total") {
    const data = payload.points.map(p => ({
      x: DateTime.fromISO(p.weekend_start_local, { zone: payload.orgTimezone }).toFormat("LLL d"),
      total: p.total,
    }));
    return (
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="total" dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  } else {
    // per_mass: group by mass_title into series
    const groups = new Map<string, SeriesRow>();
    const titles = new Set<string>();

    for (const p of payload.points) {
      const x = DateTime.fromISO(p.weekend_start_local, { zone: payload.orgTimezone }).toFormat("LLL d");
      const key = x;
      titles.add(p.mass_title ?? p.mass_id);
      if (!groups.has(key)) groups.set(key, { x });
      const row = groups.get(key)!;
      row[p.mass_title ?? p.mass_id] = p.total;
    }

    const data = Array.from(groups.values());

    return (
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis />
            <Tooltip />
            <Legend />
            {Array.from(titles).map((t) => (
              <Line key={t} type="monotone" dataKey={t} dot />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
}
