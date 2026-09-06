"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { axisShortLabel } from "@/lib/muscles";

export interface RadarDatum {
  axis: string;
  perWeek: number;
  previousPerWeek: number;
}

export function MuscleRadar({ data, showPrevious }: { data: RadarDatum[]; showPrevious: boolean }) {
  const shaped = data.map((d) => ({
    label: axisShortLabel(d.axis),
    current: d.perWeek,
    previous: d.previousPerWeek,
  }));

  // Share one scale between both series, otherwise the overlay would be
  // normalised separately and the comparison would be meaningless.
  const max = Math.max(1, ...shaped.map((d) => Math.max(d.current, showPrevious ? d.previous : 0)));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={shaped} outerRadius="78%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: "var(--text-dim)", fontSize: 10 }}
          />
          <PolarRadiusAxis domain={[0, max]} tick={false} axisLine={false} />

          {showPrevious && (
            <Radar
              name="Previous period"
              dataKey="previous"
              stroke="var(--text-dim)"
              strokeDasharray="3 3"
              fill="var(--text-dim)"
              fillOpacity={0.08}
              isAnimationActive={false}
            />
          )}
          <Radar
            name="This period"
            dataKey="current"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="var(--accent)"
            fillOpacity={0.28}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
