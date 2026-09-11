"use client";

import { useState } from "react";
import { formatMetricValue, metricLabel } from "@/lib/progression";

export interface ProgressPoint {
  date: string;
  value: number;
  detail: string;
}

export interface ProgressPayload {
  exerciseId: string;
  name: string;
  slug: string;
  metric: "e1rm" | "reps" | "hold";
  sessions: number;
  best: ProgressPoint;
  latest: ProgressPoint;
  weeksFlat: number;
  daysSinceTrained: number;
  stalled: boolean;
  series: ProgressPoint[];
  nextStep: string | null;
}

/**
 * Am I doing more than I was?
 *
 * The one question this app could not answer. Everything else on this page is a
 * coverage measure — did you hit everything, how recently, how evenly, how much
 * per muscle — and coverage without progression produces maintenance rather
 * than the outcome the app is aimed at. A trainee doing 3 x 10 push-ups for
 * eight months has a perfectly flat stimulus, and the rest of this page reports
 * it as eight months of consistent volume, which is a true statement that reads
 * as praise.
 *
 * Per movement, because that is the level progression happens at, and the
 * metric is chosen per movement too: added load where there is load, best set
 * where the load is fixed, longest hold for a plank. A single number across a
 * catalogue of push-ups and deadlifts would be an average of incomparable
 * things.
 *
 * Stalled movements sort first and are the only ones the list marks. Nothing
 * here scolds — a stall is information, and for a fixed-load movement it is
 * often the signal to move up a rung rather than a failure to try.
 */
export function ProgressList({ progress }: { progress: ProgressPayload[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (progress.length === 0) {
    return (
      <p className="text-xs text-dim">
        Nothing to compare yet. Log reps, a weight or a hold time against the same movement a few
        times and its trend appears here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {progress.map((row) => {
        const open = openId === row.exerciseId;
        return (
          <li key={row.exerciseId} className="surface rounded-lg">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : row.exerciseId)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: row.stalled ? "var(--danger)" : "var(--strength)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block truncate text-xs text-dim">{summarise(row)}</span>
              </span>
              <span className="shrink-0 tabular-nums text-xs text-dim">
                {formatMetricValue(row.latest.value, row.metric)}
              </span>
            </button>

            {open && (
              <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-dim">
                  {metricLabel(row.metric)}, best set each day
                </p>
                <ul className="flex flex-col gap-1">
                  {/* Newest first, and only the last dozen: this is a check on
                      a trend, not an archive, and the day view already holds
                      every entry. */}
                  {[...row.series]
                    .reverse()
                    .slice(0, 12)
                    .map((point) => (
                      <li
                        key={point.date}
                        className="flex items-baseline justify-between gap-2 text-xs"
                      >
                        <span className="tabular-nums text-dim">{point.date}</span>
                        <span className="min-w-0 flex-1 truncate text-right">
                          {point.detail}
                          {point.value === row.best.value && (
                            <span className="ml-1.5 text-dim">best</span>
                          )}
                        </span>
                      </li>
                    ))}
                </ul>

                {row.stalled && row.nextStep && (
                  <p className="mt-2 text-xs text-dim">
                    A fixed-load movement cannot progress by adding weight. The catalogue&apos;s next
                    rung up from here is <strong>{titleise(row.nextStep)}</strong>.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One line saying what actually happened, never a bare percentage.
 *
 * "3 x 10 for 9 weeks, no change" is a sentence a person can act on. "−2%" is a
 * number they have to decode, and across six scattered snack sessions it would
 * mostly be decoding noise.
 */
function summarise(row: ProgressPayload): string {
  if (row.stalled) {
    return `${row.best.detail} for ${row.weeksFlat} weeks, no change`;
  }
  if (row.sessions === 1) return "first session logged";

  // The LATEST DAY has to be the best day, not merely tie it. `best` is the
  // first day the peak was reached, so a movement that has never improved ties
  // it on every session — and would read "best yet" right up until it crossed
  // the stall threshold, which is the exact false praise this feature exists to
  // remove.
  if (row.latest.date === row.best.date) return `best yet · ${row.sessions} sessions`;

  return `best ${row.best.detail}, ${row.weeksFlat === 0 ? "this week" : `${row.weeksFlat}w ago`}`;
}

/** "diamond-push-up" -> "Diamond push-up". The slug is the catalogue's key. */
function titleise(slug: string): string {
  const words = slug.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
