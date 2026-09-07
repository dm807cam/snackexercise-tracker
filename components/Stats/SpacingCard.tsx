"use client";

import { formatGap, spacingLabel } from "@/lib/spacing";

export interface SpacingPayload {
  score: number | null;
  ratedDays: number;
  boutsPerDay: number;
  longestGapMin: number | null;
  byHour: number[];
  best: { date: string; score: number } | null;
  worst: { date: string; score: number } | null;
  window: { startHour: number; endHour: number };
}

/**
 * How well the window's training was spread through each day.
 *
 * A headline number and one chart, because the score alone is not
 * interpretable — 0.42 means nothing until you can see that every bar is
 * stacked in the same two evening hours. The histogram is the evidence; the
 * score is the summary.
 *
 * One series, so one colour and no legend: the heading names it. The hours
 * outside the active window are drawn faintly rather than hidden, so a 06:00
 * run is visibly early rather than mysteriously absent.
 */
export function SpacingCard({ spacing }: { spacing: SpacingPayload }) {
  const max = Math.max(1, ...spacing.byHour);
  const total = spacing.byHour.reduce((a, b) => a + b, 0);
  const percent = spacing.score == null ? null : Math.round(spacing.score * 100);

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
          : `${spacingLabel(spacing.score)} — ${spacing.boutsPerDay} ${
              spacing.boutsPerDay === 1 ? "bout" : "bouts"
            } on a typical logged day, longest quiet stretch ${
              spacing.longestGapMin == null ? "—" : formatGap(spacing.longestGapMin)
            }.`}
      </p>

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
        Scored against a day broken up every couple of hours between{" "}
        {String(spacing.window.startHour).padStart(2, "0")}:00 and{" "}
        {String(spacing.window.endHour).padStart(2, "0")}:00, so both how often and how evenly you
        trained count. Entries within a quarter of an hour of each other are one bout.
      </p>
    </section>
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
