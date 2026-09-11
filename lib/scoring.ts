/**
 * Aggregation maths. Pure functions, no database access, so they can be unit
 * tested directly and reused by the day view, calendar and stats page alike.
 *
 * The primary metric is EFFECTIVE SETS: each logged set contributes its
 * ExerciseMuscle.weight (1.0 primary / 0.5 secondary / 0.25 stabiliser) to that
 * muscle, scaled by how close to failure it was. It is the standard way of
 * counting hypertrophy volume, and crucially it still works when you did not
 * record a weight — which, logging snacks one-handed on the way back upstairs,
 * is most of the time.
 *
 * Effort is the one input that genuinely gates the stimulus, so it scales the
 * credit; see lib/effort.ts, which also explains why a set nobody rated still
 * counts in full.
 *
 * Tonnage (sets x reps x kg) is computed alongside as a secondary number, and is
 * simply absent for entries with no weight rather than guessed at.
 *
 * Cardio is scored elsewhere, in lib/cardio.ts, in MET-minutes. The only thing
 * it does here is scale itself out: every effective set is multiplied by
 * (1 - cardioBias), so a run adds nothing to the effective-set total, the body
 * map fill or "days since last trained". Those answer a question about
 * hypertrophy stimulus, and a run does not supply one.
 *
 * Cardio is not therefore invisible. It travels as a SECOND CHANNEL in the same
 * per-muscle shape — an outline on the body map, its own line on the radar — so
 * that a 10 km run shows up on the calves it actually loaded. The two channels
 * are computed separately, coloured separately and never summed.
 */

import { AXES, type AxisSlug, MUSCLE_SLUGS, type MuscleSlug, axisForMuscle } from "./muscles";
import { type LocalDate, daysBetween } from "./dates";
// Type-only: lib/balance.ts imports the scoring maths, so a value import here
// would close the cycle. The balance itself is computed by the caller.
import type { BalanceResult } from "./balance";
import type { SpacingSummary } from "./spacing";
import { effortBreakdown, effortMultiplier, type EffortBreakdown } from "./effort";

export interface ScoredEntry {
  id: string;
  performedAt: Date;
  localDate: LocalDate;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  /** "easy" | "hard" | "failure"; null or absent is "not recorded". */
  effort?: string | null;
  exercise: {
    id: string;
    name: string;
    /** 0..1; absent is 0, which is what every pre-cardio movement is. */
    cardioBias?: number;
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

/**
 * How much of a movement counts as resistance work. A pure cardio movement is
 * 0, so its (deliberately thin) muscle mapping contributes nothing anywhere
 * effective sets are used; a burpee at 0.5 contributes half, which is about
 * right for what a burpee actually does to a chest.
 */
export function strengthWeight(exercise: { cardioBias?: number }): number {
  return 1 - Math.min(1, Math.max(0, exercise.cardioBias ?? 0));
}

/** Effective sets per muscle across the given entries. */
export function muscleEffectiveSets(entries: readonly ScoredEntry[]): MuscleTotals {
  const totals = emptyMuscleTotals();
  for (const entry of entries) {
    const sets = entry.sets > 0 ? entry.sets : 1;
    const strength = strengthWeight(entry.exercise);
    if (strength <= 0) continue;

    const effort = effortMultiplier(entry.effort);
    for (const { muscle, weight } of entry.exercise.muscles) {
      if (muscle in totals) totals[muscle as MuscleSlug] += sets * weight * strength * effort;
    }
  }
  return totals;
}

/**
 * Muscles a day's cardio touched, in MET-minutes, kept apart from effective
 * sets on purpose.
 *
 * The body map means "resistance work" and must go on meaning that — but a
 * figure showing nothing at all after a 10 km run is its own kind of lie. So
 * cardio gets a second, visually distinct channel (an outline, not a fill) and
 * the two are never added together.
 */
export function muscleCardioLoad<T extends ScoredEntry>(
  entries: readonly T[],
  /** Injected so this file stays free of the MET maths, and testable alone. */
  metMinutesFor: (entry: T) => number,
): MuscleTotals {
  const totals = emptyMuscleTotals();
  for (const entry of entries) {
    const bias = Math.min(1, Math.max(0, entry.exercise.cardioBias ?? 0));
    if (bias <= 0) continue;

    const metMinutes = metMinutesFor(entry);
    if (metMinutes <= 0) continue;

    for (const { muscle, weight } of entry.exercise.muscles) {
      if (muscle in totals) totals[muscle as MuscleSlug] += metMinutes * weight;
    }
  }
  return totals;
}

/** Total effective sets one entry contributes to the strength side. */
export function entryEffectiveSets(entry: ScoredEntry): number {
  const sets = entry.sets > 0 ? entry.sets : 1;
  const strength = strengthWeight(entry.exercise);
  if (strength <= 0) return 0;

  const effort = effortMultiplier(entry.effort);
  return entry.exercise.muscles.reduce((sum, m) => sum + sets * m.weight * strength * effort, 0);
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
  /**
   * The cardio this axis absorbed, per week, on the effective-set scale.
   *
   * A SECOND SERIES, never added to `perWeek`. A run really does load the
   * calves, and a radar that draws nothing after one is as misleading as a body
   * map that does — but the load is aerobic, not hypertrophic, so it gets its
   * own colour and its own line, exactly as it gets its own outline on the body
   * map. The conversion is lib/balance.ts's guideline exchange rate, applied by
   * the caller; see MET_MIN_PER_EFFECTIVE_SET.
   */
  cardioPerWeek: number;
  previousCardioPerWeek: number;
  /** Raw effective sets inside the window. */
  total: number;
  /** Cardio load inside the window, same units as `cardioPerWeek`. */
  cardioTotal: number;
  /** Days since this axis was last trained; null if never (within the data). */
  daysSinceTrained: number | null;
}

export interface StatsResult {
  windowDays: number;
  start: LocalDate;
  end: LocalDate;
  axes: AxisStat[];
  totals: {
    sets: number;
    reps: number;
    tonnageKg: number;
    /**
     * Days with a logged entry. Deliberately not "days you moved": a 14,000-step
     * day with nothing logged is an active day by any reasonable reading, but
     * this is a training log, and quietly redefining its oldest number would
     * make every streak in the app's history mean something different.
     */
    activeDays: number;
    /** Days in the window that carry a step count, reported separately. */
    daysWithSteps: number;
    /**
     * How many of the window's sets were rated for effort.
     *
     * Reported because the effective-set total above counts an unrated set as a
     * hard one. That is the right default (see lib/effort.ts) but it is an
     * assumption, and an assumption the user cannot see is one the app is
     * making on their behalf.
     */
    effort: EffortBreakdown;
  };
  balance: BalanceResult;
  /** Days since any cardio was logged; null if never. */
  daysSinceCardio: number | null;
  /** How well the window's training was spread through each day. */
  spacing: SpacingSummary;
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

export function buildStats<T extends ScoredEntry>(params: {
  windowDays: number;
  start: LocalDate;
  end: LocalDate;
  current: readonly T[];
  previous: readonly T[];
  /** Every entry ever, used only for "days since last trained". */
  lastTrained: ReadonlyMap<AxisSlug, LocalDate>;
  today: LocalDate;
  balance: BalanceResult;
  /** Most recent day carrying any cardio, over the whole log. */
  lastCardio: LocalDate | null;
  daysWithSteps: number;
  spacing: SpacingSummary;
  /**
   * One entry's aerobic load, already on the effective-set scale. Injected so
   * this file stays free of both the MET maths and the exchange rate — and so
   * importing lib/balance.ts for a value here, which would close an import
   * cycle, never becomes necessary.
   */
  cardioLoadFor: (entry: T) => number;
}): StatsResult {
  const {
    windowDays,
    start,
    end,
    current,
    previous,
    lastTrained,
    today,
    balance,
    lastCardio,
    daysWithSteps,
    spacing,
    cardioLoadFor,
  } = params;

  const currentAxes = rollUpToAxes(muscleEffectiveSets(current));
  const previousAxes = rollUpToAxes(muscleEffectiveSets(previous));
  const currentCardio = rollUpToAxes(muscleCardioLoad(current, cardioLoadFor));
  const previousCardio = rollUpToAxes(muscleCardioLoad(previous, cardioLoadFor));

  const axes: AxisStat[] = AXES.map(({ slug }) => {
    const last = lastTrained.get(slug);
    return {
      axis: slug,
      total: round(currentAxes[slug]),
      perWeek: round(perWeek(currentAxes[slug], windowDays)),
      previousPerWeek: round(perWeek(previousAxes[slug], windowDays)),
      cardioTotal: round(currentCardio[slug]),
      cardioPerWeek: round(perWeek(currentCardio[slug], windowDays)),
      previousCardioPerWeek: round(perWeek(previousCardio[slug], windowDays)),
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
      daysWithSteps,
      effort: effortBreakdown(current),
    },
    balance,
    daysSinceCardio: lastCardio ? Math.max(0, daysBetween(lastCardio, today)) : null,
    spacing,
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
