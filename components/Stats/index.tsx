"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { axisLabel } from "@/lib/muscles";
import { formatSets } from "@/lib/format";
import { MuscleRadar } from "./MuscleRadar";
import { BalanceGradient, type BalancePayload } from "./BalanceGradient";

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
  total: number;
  daysSinceTrained: number | null;
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
  };
  balance: BalancePayload;
  daysSinceCardio: number | null;
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

  const ranked = [...stats.axes].sort((a, b) => b.perWeek - a.perWeek);
  const maxPerWeek = Math.max(1, ...ranked.map((a) => a.perWeek));
  const neglected = [...stats.axes]
    .filter((a) => a.daysSinceTrained === null || a.daysSinceTrained >= 5)
    .sort((a, b) => (b.daysSinceTrained ?? 9999) - (a.daysSinceTrained ?? 9999));

  const showCardioRow = stats.daysSinceCardio === null || stats.daysSinceCardio >= 5;

  return (
    <div className="pb-4">
      <header className="pt-4 pb-3">
        <h1 className="text-lg font-semibold">Coverage</h1>
        <p className="text-xs text-dim">
          Effective sets per week — normalised so the windows are comparable.
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

        <MuscleRadar data={stats.axes} showPrevious={showPrevious} />

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

        {(neglected.length > 0 || showCardioRow) && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Needs attention</h2>
            <p className="mb-2 text-xs text-dim">
              Longest since you last trained these — the point of tracking snacks.
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
              {neglected.slice(0, 6).map((stat) => (
                <li
                  key={stat.axis}
                  className="surface flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                >
                  <span>{axisLabel(stat.axis)}</span>
                  <span className="tabular-nums text-dim">
                    {stat.daysSinceTrained === null
                      ? "never"
                      : stat.daysSinceTrained === 0
                        ? "today"
                        : `${stat.daysSinceTrained}d ago`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">All muscle groups</h2>
          <ul className="flex flex-col gap-2">
            {ranked.map((stat) => {
              const width = (stat.perWeek / maxPerWeek) * 100;
              const delta = stat.perWeek - stat.previousPerWeek;
              return (
                <li key={stat.axis}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>{axisLabel(stat.axis)}</span>
                    <span className="tabular-nums text-dim">
                      {formatSets(stat.perWeek)}/wk
                      {Math.abs(delta) >= 0.5 && (
                        <span
                          className="ml-1.5"
                          style={{ color: delta > 0 ? "var(--accent)" : "var(--text-dim)" }}
                        >
                          {delta > 0 ? "▲" : "▼"}
                          {formatSets(Math.abs(delta))}
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${width}%`,
                        background: "var(--accent)",
                        transition: "width 250ms ease",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface rounded-lg px-3 py-3 text-center">
      <dt className="text-[11px] uppercase tracking-wide text-dim">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
