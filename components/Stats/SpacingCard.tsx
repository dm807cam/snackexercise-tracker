"use client";

import { formatBoutLength, formatGap, mergeWindowFor, spacingLabel } from "@/lib/spacing";

export interface SpacingPayload {
  score: number | null;
  ratedDays: number;
  boutsPerDay: number;
  longestGapMin: number | null;
  medianBoutMinutes: number | null;
  timedBouts: number;
  totalBouts: number;
  byHour: number[];
  best: { date: string; score: number } | null;
  worst: { date: string; score: number } | null;
  window: { startHour: number; endHour: number };
  targetBouts: number;
}

/**
 * How well the window's training was spread through each day.
 *
 * A headline number and one chart, because the score alone is not
 * interpretable — 0.42 means nothing until you can see that every bar is
 * stacked in the same two evening hours. The histogram is the evidence; the
 * score is the summary.
 *
 * THREE FIGURES, NOT ONE. The percentage is the composite, and composites hide
 * what moved them. The longest quiet stretch is promoted to sit beside it
 * because prolonged unbroken sitting is the thing the observational work
 * actually implicates, and because "7h 40m" is a fact a user can act on in a
 * way that "42%" is not. Typical snack length sits with them, unscored, for
 * the reason lib/spacing.ts gives.
 *
 * One series, so one colour and no legend: the heading names it. The hours
 * outside the active window are drawn faintly rather than hidden, so a 06:00
 * run is visibly early rather than mysteriously absent.
 */
export function SpacingCard({ spacing }: { spacing: SpacingPayload }) {
  const max = Math.max(1, ...spacing.byHour);
  const total = spacing.byHour.reduce((a, b) => a + b, 0);
  const percent = spacing.score == null ? null : Math.round(spacing.score * 100);
  const mergeMin = mergeWindowFor(spacing.targetBouts, spacing.window);

  return (
    <section className="surface mt-6 rounded-xl px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Spread through the day</h2>
        <span className="text-sm font-medium tabular-nums" style={{ color: "var(--timing)" }}>
          {percent == null ? "—" : `${percent}%`}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-dim">
        {spacing.score == null
          ? "Nothing logged in this window."
          : `${spacingLabel(spacing.score)} — ${spacing.boutsPerDay} of ${spacing.targetBouts} ${
              spacing.targetBouts === 1 ? "snack" : "snacks"
            } on a typical logged day.`}
      </p>

      {spacing.score != null && (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <Figure
            term="Longest quiet stretch"
            value={spacing.longestGapMin == null ? "—" : formatGap(spacing.longestGapMin)}
            note="Average of each day's longest unbroken gap, window edges included."
          />
          <Figure
            term="Typical snack"
            value={
              spacing.medianBoutMinutes == null
                ? "—"
                : formatBoutLength(spacing.medianBoutMinutes)
            }
            note={
              spacing.medianBoutMinutes == null
                ? "Nothing logged in this window recorded a length, so there is nothing to say."
                : spacing.timedBouts === spacing.totalBouts
                  ? `Median across all ${spacing.totalBouts}. Reported, not scored.`
                  : `Median of the ${spacing.timedBouts} of ${spacing.totalBouts} that recorded a length. Reported, not scored.`
            }
          />
        </dl>
      )}

      {total > 0 && (
        <>
          <div
            className="mt-3 flex h-20 items-end gap-[2px]"
            role="img"
            aria-label={hourChartLabel(spacing)}
          >
            {spacing.byHour.map((count, hour) => {
              const inWindow = hour >= spacing.window.startHour && hour < spacing.window.endHour;
              return (
                <div key={hour} className="flex h-full flex-1 items-end">
                  <div
                    // A visible stub at zero: an empty hour is a fact about the
                    // day, and a bar of no height reads as a rendering gap.
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(2, (count / max) * 100)}%`,
                      background: count > 0 ? "var(--timing)" : "var(--surface-2)",
                      opacity: count > 0 ? (inWindow ? 1 : 0.45) : 1,
                    }}
                    title={`${String(hour).padStart(2, "0")}:00 — ${count} ${
                      count === 1 ? "bout" : "bouts"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-dim">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </>
      )}

      <p className="mt-2 text-[11px] leading-snug text-dim">
        Scored against {spacing.targetBouts} {spacing.targetBouts === 1 ? "snack" : "snacks"} spread
        evenly between {String(spacing.window.startHour).padStart(2, "0")}:00 and{" "}
        {String(spacing.window.endHour).padStart(2, "0")}:00, so both how often and how evenly you
        trained count. Entries within {mergeMin} minutes of each other are one snack. Both numbers
        are yours to set.
      </p>
    </section>
  );
}

function Figure({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
      <dt className="text-[11px] text-dim">{term}</dt>
      <dd className="text-base font-medium tabular-nums" style={{ color: "var(--timing)" }}>
        {value}
      </dd>
      <dd className="mt-0.5 text-[10px] leading-snug text-dim">{note}</dd>
    </div>
  );
}

function hourChartLabel(spacing: SpacingPayload): string {
  const busiest = spacing.byHour.reduce(
    (best, count, hour) => (count > best.count ? { hour, count } : best),
    { hour: 0, count: 0 },
  );
  return (
    `Bouts by hour of day. Busiest hour ${String(busiest.hour).padStart(2, "0")}:00 with ` +
    `${busiest.count} of ${spacing.byHour.reduce((a, b) => a + b, 0)} bouts.`
  );
}
