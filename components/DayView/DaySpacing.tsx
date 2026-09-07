"use client";

import { formatGap, spacingLabel } from "@/lib/spacing";

export interface DaySpacingPayload {
  score: number | null;
  bouts: number;
  longestGapMin: number | null;
  boutMinutes: number[];
  window: { startMin: number; endMin: number };
}

/**
 * Where the day's snacks actually landed, drawn as the day itself.
 *
 * A timeline rather than a number, because "0.42" is not something anyone
 * looks at and changes their afternoon over, whereas four marks bunched at the
 * right-hand end is. The score sits beside it as the summary the stats page
 * aggregates.
 *
 * Nothing is shown at all on a day with nothing logged: an empty rest day is
 * not a badly spread one, and scoring it would turn this into a second, worse
 * version of the entry count.
 */
export function DaySpacing({ spacing }: { spacing: DaySpacingPayload }) {
  if (spacing.score == null || spacing.bouts === 0) return null;

  const span = spacing.window.endMin - spacing.window.startMin;
  if (span <= 0) return null;

  const percent = Math.round(spacing.score * 100);

  return (
    <section className="surface mb-3 rounded-xl px-4 py-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">Spread through the day</span>
        <span className="tabular-nums" style={{ color: "var(--timing)" }}>
          {percent}%
        </span>
      </div>

      <div
        className="relative mt-2 h-6"
        role="img"
        aria-label={`${spacing.bouts} ${
          spacing.bouts === 1 ? "bout" : "bouts"
        } today, spread score ${percent} per cent${
          spacing.longestGapMin == null
            ? ""
            : `, longest gap ${formatGap(spacing.longestGapMin)}`
        }.`}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ background: "var(--surface-2)" }}
        />
        {spacing.boutMinutes.map((minute, index) => (
          <span
            key={`${minute}-${index}`}
            aria-hidden
            className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${((minute - spacing.window.startMin) / span) * 100}%`,
              background: "var(--timing)",
            }}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] tabular-nums text-dim">
        <span>{clock(spacing.window.startMin)}</span>
        <span>
          {spacingLabel(spacing.score)}
          {spacing.longestGapMin != null && ` · longest gap ${formatGap(spacing.longestGapMin)}`}
        </span>
        <span>{clock(spacing.window.endMin)}</span>
      </div>
    </section>
  );
}

function clock(minutes: number): string {
  // Not wrapped at 24: an active window ending at midnight is the end of this
  // day, and printing "00:00" would put the timeline's right-hand edge before
  // its left one — and disagree with the stats card, which says 24:00.
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
