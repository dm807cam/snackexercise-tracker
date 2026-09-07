"use client";

import { formatSets } from "@/lib/format";
import {
  goalHeadline,
  remainingCardioMinutes,
  remainingHardSets,
  type DailyGoal,
} from "@/lib/daily-goal";

/**
 * What is still left of today, drawn as two closing rings.
 *
 * Everything else on this page is a record of what happened. This is the one
 * thing that looks forward, which is why it is a ring and not another bar: an
 * arc has an obvious unfinished part, and closing it is a thing a person wants
 * to do. Two concentric rings rather than two separate dials, because the two
 * doses are the same day and are read together.
 *
 * The rings carry the app's two colours and nothing else — outer is strength,
 * inner is cardio, exactly as on the body map, the radar and the calendar. Both
 * are also named and numbered beside the figure, so the chart is never the only
 * way to read it.
 *
 * The wording never scolds. A shortfall on a rest day is not a failure and the
 * copy does not imply it is; the app has no streak to break.
 */
export function TodayGoal({ goal }: { goal: DailyGoal }) {
  const sets = remainingHardSets(goal);
  const minutes = remainingCardioMinutes(goal);

  return (
    <section className="surface mb-3 flex items-center gap-4 rounded-xl px-4 py-3">
      <Rings goal={goal} />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{goalHeadline(goal)}</p>

        <dl className="mt-1.5 flex flex-col gap-1 text-xs">
          <Row
            colour="var(--strength)"
            label="Strength"
            met={goal.strength.met}
            value={
              goal.strength.met
                ? `${formatSets(goal.strength.done)} of ${formatSets(goal.strength.target)} sets`
                : `${formatSets(goal.strength.remaining)} sets to go`
            }
            hint={goal.strength.met ? null : sets > 0 ? `about ${sets} more` : "almost there"}
          />
          <Row
            colour="var(--cardio)"
            label="Cardio"
            met={goal.cardio.met}
            value={
              goal.cardio.met
                ? `${Math.round(goal.cardio.done)} of ${Math.round(goal.cardio.target)} MET-min`
                : `${Math.round(goal.cardio.remaining)} MET-min to go`
            }
            hint={
              goal.cardio.met ? null : minutes > 0 ? `about ${minutes} min` : "almost there"
            }
          />
        </dl>
      </div>
    </section>
  );
}

/**
 * Two arcs on one circle. Stroke-dashoffset rather than a path, because an arc
 * drawn as a dashed circle stays a perfect circle at every fraction and needs
 * no trigonometry to place.
 */
function Rings({ goal }: { goal: DailyGoal }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-[76px] w-[76px] shrink-0"
      role="img"
      aria-label={describe(goal)}
    >
      {/* Rotated so both rings start and close at twelve o'clock. */}
      <g transform="rotate(-90 50 50)">
        <Ring radius={42} fraction={goal.strength.fraction} colour="var(--strength)" />
        <Ring radius={28} fraction={goal.cardio.fraction} colour="var(--cardio)" />
      </g>
    </svg>
  );
}

function Ring({
  radius,
  fraction,
  colour,
}: {
  radius: number;
  fraction: number;
  colour: string;
}) {
  const circumference = 2 * Math.PI * radius;

  return (
    <>
      {/* A recessive track, so an empty ring still reads as a ring with
          something to fill rather than as a missing element. */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="var(--surface-2)"
        strokeWidth="9"
      />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth="9"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        // A round cap on a zero-length arc draws a stray dot on the track.
        strokeLinecap={fraction > 0.01 ? "round" : "butt"}
        style={{ transition: "stroke-dashoffset 400ms ease" }}
      />
    </>
  );
}

function Row({
  colour,
  label,
  value,
  hint,
  met,
}: {
  colour: string;
  label: string;
  value: string;
  hint: string | null;
  met: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="flex shrink-0 items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colour }} />
        {label}
        {met && (
          <span aria-hidden style={{ color: colour }}>
            ✓
          </span>
        )}
      </dt>
      {/* The honest unit and the actionable translation are stacked rather than
          run together: beside a 76px ring on a phone there is not room for both
          on one line, and truncating the half that tells you what to go and do
          would defeat the point of having it. */}
      <dd className="min-w-0 text-right tabular-nums text-dim">
        <span className="block">{value}</span>
        {hint && <span className="block text-[11px] opacity-70">{hint}</span>}
      </dd>
    </div>
  );
}

function describe(goal: DailyGoal): string {
  const strength = goal.strength.met
    ? "strength target met"
    : `${formatSets(goal.strength.remaining)} effective sets still to go`;
  const cardio = goal.cardio.met
    ? "cardio target met"
    : `${Math.round(goal.cardio.remaining)} MET-minutes still to go`;
  return `Today's targets: ${strength}; ${cardio}.`;
}
