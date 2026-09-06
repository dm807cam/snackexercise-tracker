/**
 * Aggregation maths. Pure functions, no database access, so they can be unit
 * tested directly and reused by the day view, calendar and stats page alike.
 *
 * The primary metric is EFFECTIVE SETS: each logged set contributes its
 * ExerciseMuscle.weight (1.0 primary / 0.5 secondary / 0.25 stabiliser) to that
 * muscle. It is the standard way of counting hypertrophy volume, and crucially
 * it still works when you did not record a weight — which, logging snacks
 * one-handed on the way back upstairs, is most of the time.
 *
 * Tonnage (sets x reps x kg) is computed alongside as a secondary number, and is
 * simply absent for entries with no weight rather than guessed at.
 */

import { AXES, type AxisSlug, MUSCLE_SLUGS, type MuscleSlug, axisForMuscle } from "./muscles";
import { type LocalDate, daysBetween } from "./dates";

export interface ScoredEntry {
  id: string;
  performedAt: Date;
  localDate: LocalDate;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  exercise: {
    id: string;
    name: string;
    muscles: { muscle: string; weight: number }[];
  };
}

export type MuscleTotals = Record<MuscleSlug, number>;
export type AxisTotals = Record<AxisSlug, number>;

export function emptyMuscleTotals(): MuscleTotals {
  return Object.fromEntries(MUSCLE_SLUGS.map((m) => [m, 0])) as MuscleTotals;
}

export function emptyAxisTotals(): AxisTotals {
  return Object.fromEntries(AXES.map((a) => [a.slug, 0])) as AxisTotals;
}

/** Effective sets per muscle across the given entries. */
export function muscleEffectiveSets(entries: readonly ScoredEntry[]): MuscleTotals {
  const totals = emptyMuscleTotals();
  for (const entry of entries) {
    const sets = entry.sets > 0 ? entry.sets : 1;
    for (const { muscle, weight } of entry.exercise.muscles) {
      if (muscle in totals) totals[muscle as MuscleSlug] += sets * weight;
    }
  }
  return totals;
}

/** Roll fine-grained muscle totals up to the 12 radar axes. */
export function rollUpToAxes(muscles: MuscleTotals): AxisTotals {
  const totals = emptyAxisTotals();
  for (const [muscle, value] of Object.entries(muscles)) {
    const axis = axisForMuscle(muscle);
    if (axis) totals[axis] += value;
  }
  return totals;
}

/** Tonnage in kg. Entries without a recorded weight contribute nothing. */
export function totalTonnage(entries: readonly ScoredEntry[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.weightKg == null || e.reps == null) continue;
    total += (e.sets > 0 ? e.sets : 1) * e.reps * e.weightKg;
  }
  return total;
}

export function totalSets(entries: readonly ScoredEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.sets > 0 ? e.sets : 1), 0);
}

export function totalReps(entries: readonly ScoredEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + (e.reps == null ? 0 : (e.sets > 0 ? e.sets : 1) * e.reps),
    0,
  );
}

export interface DaySummary {
  date: LocalDate;
  entryCount: number;
  sets: number;
  reps: number;
  tonnageKg: number;
  muscles: MuscleTotals;
}

export function summariseDay(date: LocalDate, entries: readonly ScoredEntry[]): DaySummary {
  return {
    date,
    entryCount: entries.length,
    sets: totalSets(entries),
    reps: totalReps(entries),
    tonnageKg: totalTonnage(entries),
    muscles: muscleEffectiveSets(entries),
  };
}

/** Total effective sets across every muscle — the calendar's per-day intensity. */
export function totalEffectiveSets(muscles: MuscleTotals): number {
  return Object.values(muscles).reduce((a, b) => a + b, 0);
}

export interface AxisStat {
  axis: AxisSlug;
  /** Effective sets per week, so windows of different lengths are comparable. */
  perWeek: number;
  /** Same measure over the equivalent preceding window, for the trend overlay. */
  previousPerWeek: number;
  /** Raw effective sets inside the window. */
  total: number;
  /** Days since this axis was last trained; null if never (within the data). */
  daysSinceTrained: number | null;
}

export interface StatsResult {
  windowDays: number;
  start: LocalDate;
  end: LocalDate;
  axes: AxisStat[];
  totals: { sets: number; reps: number; tonnageKg: number; activeDays: number };
}

/**
 * Normalise to effective sets per week. Without this a 180-day window always
 * dwarfs a 7-day one and the radar tells you nothing about how hard you are
 * currently training.
 */
export function perWeek(total: number, windowDays: number): number {
  if (windowDays <= 0) return 0;
  return (total / windowDays) * 7;
}

export function buildStats(params: {
  windowDays: number;
  start: LocalDate;
  end: LocalDate;
  current: readonly ScoredEntry[];
  previous: readonly ScoredEntry[];
  /** Every entry ever, used only for "days since last trained". */
  lastTrained: ReadonlyMap<AxisSlug, LocalDate>;
  today: LocalDate;
}): StatsResult {
  const { windowDays, start, end, current, previous, lastTrained, today } = params;

  const currentAxes = rollUpToAxes(muscleEffectiveSets(current));
  const previousAxes = rollUpToAxes(muscleEffectiveSets(previous));

  const axes: AxisStat[] = AXES.map(({ slug }) => {
    const last = lastTrained.get(slug);
    return {
      axis: slug,
      total: round(currentAxes[slug]),
      perWeek: round(perWeek(currentAxes[slug], windowDays)),
      previousPerWeek: round(perWeek(previousAxes[slug], windowDays)),
      daysSinceTrained: last ? Math.max(0, daysBetween(last, today)) : null,
    };
  });

  return {
    windowDays,
    start,
    end,
    axes,
    totals: {
      sets: totalSets(current),
      reps: totalReps(current),
      tonnageKg: round(totalTonnage(current)),
      activeDays: new Set(current.map((e) => e.localDate)).size,
    },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Map a muscle's effective sets onto 0..1 for shading the body map. Uses a
 * square-root ramp so that the difference between "not trained" and "trained a
 * bit" is visible, rather than being swamped by a single huge day.
 */
export function shadeIntensity(value: number, reference: number): number {
  if (value <= 0 || reference <= 0) return 0;
  return Math.min(1, Math.sqrt(value / reference));
}
