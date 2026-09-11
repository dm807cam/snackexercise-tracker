"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { axisLabel } from "@/lib/muscles";
import { formatSets } from "@/lib/format";
import { isBelowTargetVolume } from "@/lib/volume";
import { VIGOROUS_TARGET_MINUTES_PER_WEEK } from "@/lib/intensity";
import { MuscleRadar } from "./MuscleRadar";
import { ProgressList, type ProgressPayload } from "./ProgressList";
import { BalanceGradient, type BalancePayload } from "./BalanceGradient";
import { SpacingCard, type SpacingPayload } from "./SpacingCard";

const WINDOWS = [7, 30, 60, 90, 180] as const;
const WINDOW_LABELS: Record<number, string> = {
  7: "7d",
  30: "30d",
  60: "60d",
  90: "90d",
  180: "6mo",
};

export interface AxisStat {
  axis: string;
  perWeek: number;
  previousPerWeek: number;
  /** Aerobic load on the same axis, on the effective-set scale. Never summed with perWeek. */
  cardioPerWeek: number;
  previousCardioPerWeek: number;
  total: number;
  cardioTotal: number;
  daysSinceTrained: number | null;
  /** What this axis should be getting per week — absolute, see lib/volume.ts. */
  targetPerWeek: number;
  upperPerWeek: number;
}

export interface StatsPayload {
  windowDays: number;
  start: string;
  end: string;
  axes: AxisStat[];
  totals: {
    sets: number;
    reps: number;
    tonnageKg: number;
    activeDays: number;
    daysWithSteps: number;
    /** How much of the window's volume carries an effort rating. */
    effort: {
      labelled: number;
      unlabelled: number;
      easy: number;
      hard: number;
      failure: number;
      labelledFraction: number;
    };
  };
  balance: BalancePayload;
  daysSinceCardio: number | null;
  spacing: SpacingPayload;
  /** Hard sets per muscle per week the targets above are built from. */
  perMuscleTarget: number;
  /** Per-movement progression, over its own longer window. */
  progress: ProgressPayload[];
  /** The weekly doses this window was measured against. */
  targets: { cardioMetMinutesPerWeek: number; strengthHardSetsPerWeek: number };
  /** How much of the window was hard, kept apart from how much there was. */
  intensity: {
    vigorousMinutes: number;
    vigorousMetMinutes: number;
    vigorousBouts: number;
    vigorousMinutesPerWeek: number;
    vigorousBoutsPerDay: number;
    daysSinceVigorous: number | null;
    personalised: boolean;
  };
}

/**
 * The displayed percentage, which is also what the line's own visibility is
 * decided on. Rounding in one place and gating on the raw fraction in another
 * let the line render "80% rated" while claiming to disappear at 80%.
 */
function ratedPercent(fraction: number): number {
  return Math.round(fraction * 100);
}

export function StatsView({ initial }: { initial: StatsPayload }) {
  const [windowDays, setWindowDays] = useState(initial.windowDays);
  const [stats, setStats] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [showPrevious, setShowPrevious] = useState(true);

  useEffect(() => {
    if (windowDays === stats.windowDays) return;
    let cancelled = false;
    setLoading(true);

    api<StatsPayload>(`/api/stats?window=${windowDays}`)
      .then((fresh) => {
        if (!cancelled) setStats(fresh);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [windowDays, stats.windowDays]);

  // Ranked by the taller of its two bars, so an axis that only ever sees cardio
  // is not filed at the bottom of a list it visibly appears in.
  const ranked = [...stats.axes].sort(
    (a, b) => Math.max(b.perWeek, b.cardioPerWeek) - Math.max(a.perWeek, a.cardioPerWeek),
  );
  const maxPerWeek = Math.max(
    1,
    ...ranked.map((a) => Math.max(a.perWeek, a.cardioPerWeek)),
  );
  // Two reasons an axis needs attention, not one. Staleness was the only one,
  // so an axis trained every day at a trivial dose could never appear here
  // however far below a useful volume it was — the failure mode the whole
  // absolute reference exists to catch.
  const stale = (a: AxisStat) => a.daysSinceTrained === null || a.daysSinceTrained >= 5;
  const thin = (a: AxisStat) => isBelowTargetVolume(a.perWeek, a.targetPerWeek);

  const neglected = [...stats.axes]
    .filter((a) => stale(a) || thin(a))
    // Staleness first, since nothing beats not having trained it at all; among
    // equally recent axes the thinnest against its own target comes first.
    .sort(
      (a, b) =>
        (b.daysSinceTrained ?? 9999) - (a.daysSinceTrained ?? 9999) ||
        a.perWeek / Math.max(1, a.targetPerWeek) - b.perWeek / Math.max(1, b.targetPerWeek),
    );

  const showCardioRow = stats.daysSinceCardio === null || stats.daysSinceCardio >= 5;
  const stalled = stats.progress.filter((p) => p.stalled);
  // "No vigorous effort in eleven days" is a row the app simply could not write
  // before it could classify intensity at all.
  const showVigorousRow =
    stats.intensity.daysSinceVigorous === null || stats.intensity.daysSinceVigorous >= 7;

  return (
    <div className="pb-4">
      <header className="pt-4 pb-3">
        <h1 className="text-lg font-semibold">Coverage</h1>
        <p className="text-xs text-dim">
          Strength and cardio per week, per muscle group — normalised so the windows are
          comparable.
        </p>
      </header>

      <div
        className="mb-4 grid grid-cols-5 gap-1 rounded-lg p-1"
        style={{ background: "var(--surface-2)" }}
        role="tablist"
        aria-label="Time window"
      >
        {WINDOWS.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={windowDays === value}
            type="button"
            onClick={() => setWindowDays(value)}
            className="tap rounded-md py-2 text-sm font-medium transition-colors"
            style={{
              background: windowDays === value ? "var(--surface)" : "transparent",
              color: windowDays === value ? "var(--text)" : "var(--text-dim)",
            }}
          >
            {WINDOW_LABELS[value]}
          </button>
        ))}
      </div>

      <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 150ms ease" }}>
        <BalanceGradient balance={stats.balance} />

        <MuscleRadar
          data={stats.axes}
          showPrevious={showPrevious}
          perMuscleTarget={stats.perMuscleTarget}
          targets={stats.targets}
        />

        <label className="mt-1 flex items-center justify-center gap-2 text-xs text-dim">
          <input
            type="checkbox"
            checked={showPrevious}
            onChange={(e) => setShowPrevious(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Compare with the previous {stats.windowDays} days
        </label>

        <dl className="mt-4 grid grid-cols-4 gap-2">
          <Stat label="Active days" value={`${stats.totals.activeDays}/${stats.windowDays}`} />
          <Stat label="Sets" value={String(stats.totals.sets)} />
          <Stat
            label="Moved"
            value={
              stats.totals.tonnageKg > 0
                ? `${Math.round(stats.totals.tonnageKg).toLocaleString()} kg`
                : "—"
            }
          />
          {/* Steps are reported beside active days rather than folded into
              them: a 14,000-step day with nothing logged is not a training day,
              but it is not nothing either. */}
          <Stat
            label="Steps"
            value={
              stats.balance.detail.totalSteps > 0
                ? compact(Math.round(stats.balance.detail.totalSteps / Math.max(1, stats.totals.daysWithSteps)))
                : "—"
            }
          />
        </dl>

        {/*
          Effective sets above count an unrated set as a hard one, which is the
          right default but is still an assumption — and one that flatters a
          user who never trains near failure. Saying how much of the volume was
          actually rated is what keeps that honest. Once most sets carry a
          rating the line stops being worth the space, so it goes away.
        */}
        {stats.totals.effort.unlabelled > 0 && ratedPercent(stats.totals.effort.labelledFraction) < 80 && (
          <p className="mt-2 text-xs text-dim">
            {stats.totals.effort.labelled === 0
              ? "No sets rated for effort — all of them count as hard sets. Tap Effort when you log one and the volume above starts reflecting how close to failure you actually went."
              : `${ratedPercent(stats.totals.effort.labelledFraction)}% of sets rated for effort; the rest count as hard sets.`}
          </p>
        )}

        {/*
          The vigorous fraction, beside the total rather than folded into it.
          MET-minutes collapse intensity and duration into one product, so 150
          minutes of strolling and 37 minutes of hard running are the same
          number — and at MATCHED volume a higher vigorous proportion is
          associated with lower mortality (Wang 2021). Bouts are shown as well
          as minutes because this app's format is the short effort a
          minutes-based target rounds away (VILPA, Stamatakis 2022).
        */}
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">How hard, not just how much</h2>
          <dl className="grid grid-cols-3 gap-2">
            <Stat
              label="Vigorous/wk"
              value={
                stats.intensity.vigorousMinutesPerWeek > 0
                  ? `${Math.round(stats.intensity.vigorousMinutesPerWeek)} min`
                  : "—"
              }
            />
            <Stat label="Of a target" value={`${VIGOROUS_TARGET_MINUTES_PER_WEEK} min`} />
            <Stat
              label="Hard bouts/day"
              value={
                stats.intensity.vigorousBouts > 0
                  ? stats.intensity.vigorousBoutsPerDay.toFixed(1)
                  : "—"
              }
            />
          </dl>
          <p className="mt-2 text-xs text-dim">
            {stats.intensity.personalised
              ? "Read against your own predicted maximum heart rate. "
              : "Add your year of birth in Settings and heart rates are read against your own maximum rather than a fixed 150 bpm. "}
            Short efforts count: three vigorous bouts a day of a minute or two is the pattern the
            VILPA work associates with lower mortality, and it is worth far more than the four
            minutes it adds to the total.
          </p>
        </section>

        {(neglected.length > 0 || showCardioRow || stalled.length > 0 || showVigorousRow) && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Needs attention</h2>
            <p className="mb-2 text-xs text-dim">
              Longest since you last trained these, furthest below {stats.perMuscleTarget} hard sets
              per muscle per week, or stopped moving.
            </p>
            <ul className="flex flex-col gap-2">
              {/* Cardio has no radar spoke — the radar is muscle coverage — but
                  "you have not done any cardio in nine days" is exactly the
                  question this app exists to answer, so it earns a row here. */}
              {showCardioRow && (
                <li className="surface flex items-center justify-between rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: "var(--cardio)" }}
                    />
                    Cardio
                  </span>
                  <span className="tabular-nums text-dim">
                    {stats.daysSinceCardio === null
                      ? "never"
                      : `${stats.daysSinceCardio}d ago`}
                  </span>
                </li>
              )}
              {/* A stalled movement is the third reason something needs
                  attention, and the only one that is about a specific
                  movement rather than a muscle group. Capped at two so the
                  list stays a list rather than becoming the page. */}
              {showVigorousRow && (
                <li className="surface flex items-center justify-between rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: "var(--cardio)" }}
                    />
                    Vigorous effort
                  </span>
                  <span className="tabular-nums text-dim">
                    {stats.intensity.daysSinceVigorous === null
                      ? "never"
                      : `${stats.intensity.daysSinceVigorous}d ago`}
                  </span>
                </li>
              )}
              {stalled.slice(0, 2).map((row) => (
                <li
                  key={row.exerciseId}
                  className="surface flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--danger)" }}
                    />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-dim">
                    {row.weeksFlat}w flat
                  </span>
                </li>
              ))}
              {neglected.slice(0, 6).map((stat) => (
                <li
                  key={stat.axis}
                  className="surface flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                >
                  {/* Matching the cardio row's dot: without one on every row the
                      cardio dot reads as decoration rather than as "this row is
                      the other quality". */}
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: "var(--strength)" }}
                    />
                    {axisLabel(stat.axis)}
                  </span>
                  {/* An axis can be here for either reason, so the row says
                      which. "today" beside a row in this list is otherwise
                      simply confusing. */}
                  <span className="tabular-nums text-dim">
                    {stale(stat)
                      ? stat.daysSinceTrained === null
                        ? "never"
                        : `${stat.daysSinceTrained}d ago`
                      : `${formatSets(stat.perWeek)} of ${formatSets(stat.targetPerWeek)}/wk`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Getting stronger?</h2>
          {/* Deliberately not scoped to the window tabs above. A stall is
              defined in weeks of unchanged best, so a seven-day view could
              never show one, and a progression signal that disappeared when
              you looked at a shorter window would be worse than none. */}
          <p className="mb-2 text-xs text-dim">
            Best set per movement over the last six months, whichever window is selected above. Tap
            one for its history.
          </p>
          <ProgressList progress={stats.progress} />
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">All muscle groups</h2>
          <ul className="flex flex-col gap-2">
            {ranked.map((stat) => {
              const delta = stat.perWeek - stat.previousPerWeek;
              return (
                <li key={stat.axis}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>{axisLabel(stat.axis)}</span>
                    <span className="tabular-nums text-dim">
                      {formatSets(stat.perWeek)}/wk
                      {stat.cardioPerWeek > 0 && (
                        <span className="ml-1.5" style={{ color: "var(--cardio)" }}>
                          +{formatSets(stat.cardioPerWeek)}
                        </span>
                      )}
                      {/* The trend belongs to the strength series, so it wears
                          the strength colour. It used to wear the accent, which
                          is now the cardio orange — putting "+1.8 cardio" and
                          "up 1.2 on strength" side by side in one colour. */}
                      {Math.abs(delta) >= 0.5 && (
                        <span
                          className="ml-1.5"
                          style={{ color: delta > 0 ? "var(--strength)" : "var(--text-dim)" }}
                        >
                          {delta > 0 ? "▲" : "▼"}
                          {formatSets(Math.abs(delta))}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Two bars, one under the other, rather than one stacked bar:
                      stacking would read as a total, and these two numbers are
                      in different currencies and must never be added. */}
                  <Bar
                    value={stat.perWeek}
                    max={maxPerWeek}
                    color="var(--strength)"
                    label={`${axisLabel(stat.axis)} strength`}
                  />
                  {stat.cardioPerWeek > 0 && (
                    <Bar
                      value={stat.cardioPerWeek}
                      max={maxPerWeek}
                      color="var(--cardio)"
                      label={`${axisLabel(stat.axis)} cardio`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <SpacingCard spacing={stats.spacing} />

        {stats.totals.sets === 0 && (
          <p className="mt-6 text-center text-sm text-dim">
            Nothing logged in this window yet.
          </p>
        )}
      </div>
    </div>
  );
}

/** 8,432 -> "8.4k". Four stat tiles on a phone have no room for the full number. */
function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function Bar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  return (
    <div
      className="mt-1 h-2 overflow-hidden rounded-full"
      style={{ background: "var(--surface-2)" }}
      role="img"
      aria-label={`${label}: ${formatSets(value)} per week`}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, (value / max) * 100)}%`,
          background: color,
          transition: "width 250ms ease",
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface rounded-lg px-3 py-3 text-center">
      <dt className="text-[11px] uppercase tracking-wide text-dim">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
