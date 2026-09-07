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
  cardioPerWeek: number;
  previousCardioPerWeek: number;
}

/**
 * Muscle coverage, in two colours.
 *
 * BLUE is resistance work in effective sets per week. ORANGE is the aerobic
 * load the same muscles absorbed, converted onto the same scale by the
 * guideline exchange rate in lib/balance.ts (600 MET-minutes of cardio and 60
 * effective sets of strength are each one guideline-week, so ten MET-minutes
 * plot as far out as one effective set).
 *
 * The two are drawn as separate lines and never stacked or summed. That is the
 * whole point: a 10 km run genuinely loads the calves and quads, and a chart
 * that draws nothing after one is lying by omission — but the load is aerobic,
 * not hypertrophic, and a single blended line would make the radar unable to
 * answer either question. Same reasoning as the body map's cardio outline, and
 * the same colours as the balance gradient above it, so the page uses one
 * vocabulary throughout.
 *
 * The previous-period overlay is a single dashed outline of the two combined.
 * Four lines on twelve spokes is not a chart anyone can read, and the question
 * the overlay answers — "am I doing more or less than I was" — is about total
 * training rather than about either quality alone.
 */
export function MuscleRadar({ data, showPrevious }: { data: RadarDatum[]; showPrevious: boolean }) {
  const shaped = data.map((d) => ({
    label: axisShortLabel(d.axis),
    current: d.perWeek,
    cardio: d.cardioPerWeek,
    previous: d.previousPerWeek + d.previousCardioPerWeek,
  }));

  // One scale for every series, otherwise each would be normalised separately
  // and no comparison on the chart would mean anything.
  const max = Math.max(
    1,
    ...shaped.map((d) => Math.max(d.current, d.cardio, showPrevious ? d.previous : 0)),
  );

  const hasCardio = shaped.some((d) => d.cardio > 0);

  return (
    <div>
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
              name="Strength"
              dataKey="current"
              stroke="var(--strength)"
              strokeWidth={2}
              fill="var(--strength)"
              fillOpacity={0.24}
              isAnimationActive={false}
            />
            {/* Drawn second so the thinner cardio line is never hidden under
                the strength fill on an axis they both reach. */}
            <Radar
              name="Cardio"
              dataKey="cardio"
              stroke="var(--cardio)"
              strokeWidth={2}
              fill="var(--cardio)"
              fillOpacity={0.14}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-dim">
        <Key color="var(--strength)" label="Strength" />
        <Key color="var(--cardio)" label="Cardio" />
        {showPrevious && <Key color="var(--text-dim)" label="Previous, both" dashed />}
      </div>

      {hasCardio && (
        <p className="mt-1 text-center text-[11px] leading-snug text-dim">
          Both lines are on the effective-set scale — 10 cardio MET-minutes reach as far as one
          effective set, the same exchange rate the balance bar uses. They are never added together.
        </p>
      )}
    </div>
  );
}

function Key({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-0.5 w-4 rounded-full"
        style={
          dashed
            ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)` }
            : { background: color }
        }
      />
      {label}
    </span>
  );
}
