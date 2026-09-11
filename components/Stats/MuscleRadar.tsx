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
import { UPPER_BAND_MULTIPLE, radarScale } from "@/lib/volume";

export interface RadarDatum {
  axis: string;
  perWeek: number;
  previousPerWeek: number;
  cardioPerWeek: number;
  previousCardioPerWeek: number;
  /** Effective sets a week this axis should carry. An absolute reference. */
  targetPerWeek: number;
  /** Top of the band, where the dose-response has clearly flattened. */
  upperPerWeek: number;
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
 *
 * THE TARGET BAND is the one thing here that comes from outside the user's own
 * log: the per-muscle hypertrophy target from lib/volume.ts, times the number
 * of muscles each spoke rolls up. Without it the chart scaled every spoke by
 * the largest spoke, so someone doing one easy set per group per day saw a
 * large, even, fully-inflated polygon at a fifth of a useful dose. The polygon
 * now has something outside itself to be read against.
 *
 * It is a BAND rather than a line because the evidence is a band — ~10 hard
 * sets per muscle per week where the dose-response is clear, continuing with
 * diminishing returns to ~20. A single ring would claim a precision the
 * meta-regressions do not have. The upper edge is drawn only once the scale
 * reaches it; the copy names the number either way.
 *
 * The band is lumpy rather than circular, and that is correct: chest is one
 * muscle and wants ~10 a week, shoulders is front, side and rear delts and
 * wants ~30. One literature number, honestly projected onto twelve spokes of
 * different sizes.
 */
export function MuscleRadar({
  data,
  showPrevious,
  perMuscleTarget,
}: {
  data: RadarDatum[];
  showPrevious: boolean;
  /** Hard sets per muscle per week the band is built from, for the legend. */
  perMuscleTarget: number;
}) {
  const shaped = data.map((d) => ({
    label: axisShortLabel(d.axis),
    current: d.perWeek,
    cardio: d.cardioPerWeek,
    previous: d.previousPerWeek + d.previousCardioPerWeek,
    target: d.targetPerWeek,
    upper: d.upperPerWeek,
  }));

  // One scale for every series, otherwise each would be normalised separately
  // and no comparison on the chart would mean anything.
  //
  // The target is part of that scale, which is the point: the radius no longer
  // shrinks to fit a thin week, so an under-trained log draws a small polygon
  // inside a large reference instead of a full one. Auto-scaling survives only
  // for the case it was right for — a user already past the target, whose own
  // volume then sets the outer ring.
  //
  // The upper bound is deliberately NOT part of the scale: including it would
  // halve every real polygon to make room for a line most people never reach.
  // It is drawn only when the radius already reaches it — see `radarScale`,
  // which explains why anything drawn has to fit.
  const { max, showUpper } = radarScale(
    shaped.flatMap((d) => [d.current, d.cardio, d.target, showPrevious ? d.previous : 0]),
    shaped.map((d) => d.upper),
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

            {/*
              Two outlines rather than a filled band between them: recharts
              cannot stack radar series, and a fill on the outer bound would
              wash the whole chart including everything inside the target.
              Unfilled also keeps the reference recessive, which is right — it
              is a backdrop, not a thirteenth series competing with the data.
              Drawn first so the real polygons sit on top.

              SOLID, not dashed, though both are grey. Dashed grey is already
              the previous-period overlay, and two dashed grey outlines on one
              chart would be indistinguishable. A solid thin grey ring reads as
              what it is: a gridline placed at a radius that means something,
              which is why it sits in the same family as PolarGrid rather than
              in the data's vocabulary.
            */}
            <Radar
              name="Target"
              dataKey="target"
              stroke="var(--text-dim)"
              strokeWidth={1.5}
              strokeOpacity={0.85}
              fill="none"
              fillOpacity={0}
              isAnimationActive={false}
            />
            {showUpper && (
              <Radar
                name="Upper bound"
                dataKey="upper"
                stroke="var(--text-dim)"
                strokeWidth={1}
                strokeOpacity={0.35}
                fill="none"
                fillOpacity={0}
                isAnimationActive={false}
              />
            )}

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
        <Key color="var(--text-dim)" label={`Target (${perMuscleTarget}/muscle/wk)`} />
        {showPrevious && <Key color="var(--text-dim)" label="Previous, both" dashed />}
      </div>

      <p className="mt-1 text-center text-[11px] leading-snug text-dim">
        The grey ring is {perMuscleTarget} hard sets per muscle per week, where the hypertrophy
        dose–response is established. A spoke inside it is short of that dose however even the shape
        looks; it flattens by about {perMuscleTarget * UPPER_BAND_MULTIPLE}
        {showUpper ? ", the fainter ring outside" : ""}.
        {hasCardio &&
          " Both lines are on the effective-set scale — 10 cardio MET-minutes reach as far as one effective set, the same exchange rate the balance bar uses. They are never added together."}
      </p>
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
