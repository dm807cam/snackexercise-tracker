"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonths,
  formatMonthLabel,
  monthGrid,
  parseLocalDate,
  WEEKDAY_INITIALS,
  type LocalDate,
} from "@/lib/dates";
import { api } from "@/lib/client";
import { shadeIntensity } from "@/lib/scoring";
import { metMinutesPerEffectiveSet, type Targets } from "@/lib/targets";
import type { DayLoad } from "@/lib/queries";

export function CalendarView({
  initialMonth,
  initialLoad,
  today,
  targets,
}: {
  initialMonth: LocalDate;
  /** Each day's strength and cardio load, keyed by "YYYY-MM-DD". */
  initialLoad: Record<string, DayLoad>;
  today: LocalDate;
  /**
   * The weekly doses the stored loads were converted against. Needed to turn
   * the cardio figure back into MET-minutes for the label, and carried rather
   * than imported because the rate moves with the user's cardio target.
   */
  targets: Targets;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [load, setLoad] = useState(initialLoad);
  const [loading, setLoading] = useState(false);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const currentMonth = parseLocalDate(month).getMonth();

  // A fixed reference keeps shading comparable across months, so a quiet month
  // looks quiet instead of re-normalising to its own busiest day.
  const reference = 14;

  async function changeMonth(delta: number) {
    const next = addMonths(month, delta);
    setMonth(next);
    setLoading(true);
    try {
      const grid = monthGrid(next).flat();
      const result = await api<{ load: Record<string, DayLoad> }>(
        `/api/calendar?start=${grid[0]}&end=${grid[grid.length - 1]}`,
      );
      setLoad((current) => ({ ...current, ...result.load }));
    } finally {
      setLoading(false);
    }
  }

  // Streaks, active days and the month total count the whole dose: a day of
  // running is a day you trained. Only the colouring splits the two apart.
  const totalFor = (date: string) => load[date]?.total ?? 0;

  const monthDays = weeks.flat().filter((d) => parseLocalDate(d).getMonth() === currentMonth);
  const activeDays = monthDays.filter((d) => totalFor(d) > 0).length;
  const monthTotal = monthDays.reduce((sum, d) => sum + totalFor(d), 0);

  // Current streak counts back from today (or the month's last day when
  // viewing a past month), so it reads as "days in a row up to here".
  const upTo = monthDays.filter((d) => d <= today);
  let streak = 0;
  for (let i = upTo.length - 1; i >= 0; i--) {
    if (totalFor(upTo[i]) > 0) streak += 1;
    else break;
  }

  let longestGap = 0;
  let running = 0;
  for (const d of upTo) {
    if (totalFor(d) > 0) running = 0;
    else longestGap = Math.max(longestGap, ++running);
  }

  return (
    <div>
      <header className="flex items-center gap-2 pt-4 pb-3">
        <NavButton label="Previous month" direction="left" onClick={() => changeMonth(-1)} />
        <div className="flex-1 text-center">
          <h1 className="text-lg font-semibold">{formatMonthLabel(month)}</h1>
          <p className="text-xs text-dim">
            {activeDays} active {activeDays === 1 ? "day" : "days"}
            {monthTotal > 0 && ` · ${Math.round(monthTotal)} effective sets`}
          </p>
        </div>
        <NavButton label="Next month" direction="right" onClick={() => changeMonth(1)} />
      </header>

      <div
        className="grid grid-cols-7 gap-1 pb-2 text-center text-[11px] font-medium text-dim"
        aria-hidden
      >
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i}>{initial}</span>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        style={{ opacity: loading ? 0.55 : 1, transition: "opacity 150ms ease" }}
      >
        {weeks.flat().map((date) => {
          const inMonth = parseLocalDate(date).getMonth() === currentMonth;
          const day = load[date];
          const intensity = shadeIntensity(day?.strength ?? 0, reference);
          const cardioIntensity = shadeIntensity(day?.cardio ?? 0, reference);
          const isToday = date === today;
          const isFuture = date > today;

          return (
            <Link
              key={date}
              href={`/day/${date}`}
              prefetch={false}
              aria-label={`${date}: ${describe(day, targets)}`}
              className="relative grid aspect-square place-items-center rounded-lg text-sm tabular-nums transition-transform active:scale-95"
              style={{
                // Keyed on the wash, not on the total: a cardio-only day has
                // no wash to sit on, and leaving it transparent dropped it to
                // the page background where it read as a rest day.
                background:
                  intensity > 0 ? "transparent" : inMonth ? "var(--surface)" : "transparent",
                // Today's ring is the text colour, not the accent: the accent
                // is the cardio orange, and a cell already uses that to mean
                // "this day carried cardio".
                border: isToday
                  ? "1.5px solid var(--text)"
                  : `1px solid ${inMonth ? "var(--border)" : "transparent"}`,
                color: inMonth ? "var(--text)" : "var(--text-dim)",
                opacity: isFuture ? 0.35 : inMonth ? 1 : 0.45,
              }}
            >
              {/* Strength washes the cell; cardio rings it. Same convention as
                  the body map, so a square and a muscle are read the same way,
                  and a running day is never mistaken for a lifting one. */}
              {intensity > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-lg"
                  style={{ background: "var(--strength)", opacity: intensity * 0.85 }}
                />
              )}
              {cardioIntensity > 0 && (
                <span
                  aria-hidden
                  // Inset by a pixel so today's own ring, which sits on the
                  // cell edge, cannot swallow it on a day that carried both.
                  className="absolute inset-[1.5px] rounded-[7px]"
                  style={{
                    border: `${(1 + cardioIntensity).toFixed(1)}px solid var(--cardio)`,
                    opacity: 0.45 + cardioIntensity * 0.55,
                  }}
                />
              )}
              <span className="relative z-10 font-medium">{parseLocalDate(date).getDate()}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-center gap-1.5 text-xs text-dim">
        <span className="flex items-center gap-2">
          <span>Lighter</span>
          <span className="flex gap-1">
            {[0.15, 0.35, 0.6, 0.85].map((opacity) => (
              <span
                key={opacity}
                className="h-3.5 w-3.5 rounded"
                style={{ background: "var(--strength)", opacity }}
              />
            ))}
          </span>
          <span>Harder</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3.5 w-3.5 rounded"
            style={{ border: "1.5px solid var(--cardio)" }}
          />
          Ringed days carried cardio
        </span>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">This month</h2>
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Active" value={`${activeDays}/${monthDays.length}`} />
          <Stat label="Sets" value={monthTotal > 0 ? String(Math.round(monthTotal)) : "—"} />
          <Stat
            label="Streak"
            value={streak > 0 ? `${streak}d` : "—"}
          />
        </dl>
        {longestGap > 1 && (
          <p className="mt-2 text-center text-xs text-dim">
            Longest gap this month: {longestGap} days
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={() => router.push(`/day/${today}`)}
        className="tap mx-auto mt-6 block rounded-full px-4 py-2 text-sm font-medium"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        Go to today
      </button>
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

/** Both channels in words, so the split is never carried by colour alone. */
function describe(day: DayLoad | undefined, targets: Targets): string {
  if (!day || day.total <= 0) return "nothing logged";

  const parts: string[] = [];
  if (day.strength > 0) parts.push(`${Math.round(day.strength)} effective sets`);
  // Back into the unit the user would recognise from the day page and the
  // balance bar; the stored figure is on the effective-set scale.
  if (day.cardio > 0) {
    parts.push(
      `${Math.round(day.cardio * metMinutesPerEffectiveSet(targets))} cardio MET-minutes`,
    );
  }
  return parts.join(", ");
}

function NavButton({
  label,
  direction,
  onClick,
}: {
  label: string;
  direction: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tap grid place-items-center rounded-full border transition-transform active:scale-95"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}
