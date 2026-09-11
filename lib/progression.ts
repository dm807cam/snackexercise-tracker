/**
 * Whether you are doing more than you were. Pure functions, no database access,
 * same discipline as lib/scoring.ts and lib/volume.ts.
 *
 * Every other measure in this app is a COVERAGE measure: did you hit everything,
 * how recently, how well spread, how much per muscle. Coverage without
 * progression produces maintenance, and progressive overload — sustained
 * mechanical tension above what the tissue is already adapted to — is the
 * mechanistically necessary condition for continued hypertrophy. It is the
 * organising principle of the ACSM progression model (Ratamess et al. 2009) and
 * of every hypertrophy review since.
 *
 * The snack format makes this more urgent than it would be in a session app:
 *
 *  - BODYWEIGHT MOVEMENTS DOMINATE. Push-ups, pull-ups, squats, planks — the
 *    things you can do at the top of the stairs. Their load is fixed by
 *    definition, so progression has to come from reps, tempo, range or a harder
 *    variation, none of which a tonnage figure can see.
 *  - THERE IS NO SESSION STRUCTURE to carry an implicit plan. In a programme
 *    app, progression is encoded in the programme. Here nothing encodes it, so
 *    if the app does not surface it, nothing does.
 *
 * The data to do this has been sitting in SetEntry all along: reps, weightKg,
 * durationSec, exerciseId. Nothing read it as a time series. `totalTonnage`
 * summed a window into one scalar and showed it as "Moved: N kg" — a figure
 * that moves with how much you logged, not with how strong you got, and which
 * is simply zero for a pure-calisthenics user.
 *
 * THE METRIC IS CHOSEN PER MOVEMENT, because one metric cannot serve all three
 * shapes. See `metricFor`.
 */

import { type LocalDate, daysBetween } from "./dates";

/** Which progression signal a movement's history supports. */
export type ProgressionMetric = "e1rm" | "reps" | "hold";

export interface ProgressionEntry {
  localDate: LocalDate;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
}

/**
 * Reps beyond which an estimated 1RM stops being an estimate.
 *
 * Epley is fitted on low-rep work and drifts upward badly past about a dozen:
 * a set of 30 bodyweight-ish reps would come out as twice the load actually
 * handled. Capping the exponent rather than discarding the set keeps a
 * high-rep entry on the chart without letting it invent a personal best.
 */
export const E1RM_REP_CAP = 12;

/**
 * Estimated one-rep max, Epley: `w x (1 + reps / 30)`.
 *
 * Epley rather than Brzycki because Brzycki's `36 / (37 - reps)` is undefined at
 * 37 reps and absurd well before it, and this app has no rep ceiling — someone
 * logs "50 bodyweight squats" and means it.
 */
export function estimatedOneRepMax(weightKg: number, reps: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  return weightKg * (1 + Math.min(reps, E1RM_REP_CAP) / 30);
}

/**
 * The progression signal this movement's history can support.
 *
 * Load first where it exists, because added weight is the least ambiguous
 * evidence of overload. Otherwise reps, which is how a fixed-load movement
 * progresses. Otherwise duration, for holds and carries. Null when the history
 * carries no numbers at all — "did some pull-ups" is a perfectly good log entry
 * and simply cannot be a progression series.
 */
export function metricFor(entries: readonly ProgressionEntry[]): ProgressionMetric | null {
  if (entries.some((e) => (e.weightKg ?? 0) > 0 && (e.reps ?? 0) > 0)) return "e1rm";
  if (entries.some((e) => (e.reps ?? 0) > 0)) return "reps";
  if (entries.some((e) => (e.durationSec ?? 0) > 0)) return "hold";
  return null;
}

/**
 * One entry's value on a given metric, or null where it does not carry one.
 *
 * BEST SET, not volume. A day's total reps rises when you simply do more sets,
 * which is volume and is already measured elsewhere; the best single set is
 * what has to move for the tissue to see a load it is not adapted to.
 */
export function entryValue(entry: ProgressionEntry, metric: ProgressionMetric): number | null {
  if (metric === "e1rm") {
    if (!((entry.weightKg ?? 0) > 0 && (entry.reps ?? 0) > 0)) return null;
    return round1(estimatedOneRepMax(entry.weightKg!, entry.reps!));
  }
  if (metric === "reps") {
    return (entry.reps ?? 0) > 0 ? entry.reps! : null;
  }
  return (entry.durationSec ?? 0) > 0 ? entry.durationSec! : null;
}

export interface ProgressionPoint {
  date: LocalDate;
  /** Best single set that day, on the movement's metric. */
  value: number;
  /** How that day's best set was actually logged — "3 x 10", "60 kg x 5". */
  detail: string;
}

/** One point per day the movement was trained, ascending, best set of the day. */
export function progressionSeries(
  entries: readonly ProgressionEntry[],
  metric: ProgressionMetric,
): ProgressionPoint[] {
  const best = new Map<LocalDate, { value: number; entry: ProgressionEntry }>();

  for (const entry of entries) {
    const value = entryValue(entry, metric);
    if (value == null) continue;

    const current = best.get(entry.localDate);
    if (!current || value > current.value) best.set(entry.localDate, { value, entry });
  }

  return [...best.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value, entry }]) => ({ date, value, detail: describeSet(entry, metric) }));
}

/** Sessions a movement needs before "no change" means anything. */
export const MIN_SESSIONS_FOR_STALL = 6;
/** Weeks a best has to stand, with training in between, to count as stalled. */
export const STALL_WEEKS = 4;

export interface ProgressionTrend {
  /** Days the movement was trained, within the window. */
  sessions: number;
  /** Best day in the window, and the first date it was reached. */
  best: ProgressionPoint;
  /** Most recent day. */
  latest: ProgressionPoint;
  /** Whole weeks the best has stood without being beaten. */
  weeksFlat: number;
  /**
   * True when the movement has been trained often enough, for long enough,
   * without the best set moving. "Push-up: 3 x 10 for 9 weeks, no change" is a
   * single sentence that does more for this app's goal than most of the charts
   * on the stats page.
   */
  stalled: boolean;
}

/**
 * Read a series as a trend.
 *
 * Deliberately anchored on the BEST rather than on a fitted slope. A regression
 * through six scattered snack sessions is mostly noise, and "your best has not
 * moved in nine weeks" is both more robust and more actionable than a gradient.
 */
export function progressionTrend(series: readonly ProgressionPoint[]): ProgressionTrend | null {
  if (series.length === 0) return null;

  let best = series[0];
  for (const point of series) {
    // Strictly greater, so `best` is the FIRST day the peak was reached — which
    // is what "how long has it stood" has to be measured from.
    if (point.value > best.value) best = point;
  }

  const latest = series[series.length - 1];
  const weeksFlat = Math.floor(Math.max(0, daysBetween(best.date, latest.date)) / 7);

  return {
    sessions: series.length,
    best,
    latest,
    weeksFlat,
    stalled: series.length >= MIN_SESSIONS_FOR_STALL && weeksFlat >= STALL_WEEKS,
  };
}

/** Everything a caller needs about one movement's progression. */
export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  slug: string;
  metric: ProgressionMetric;
  sessions: number;
  best: ProgressionPoint;
  latest: ProgressionPoint;
  weeksFlat: number;
  stalled: boolean;
  /** Full per-day series, oldest first, for the sparkline and the history list. */
  series: ProgressionPoint[];
  /** The next rung up the ladder, when the catalogue has one. */
  nextStep: string | null;
}

export function buildExerciseProgress(exercise: {
  id: string;
  name: string;
  slug: string;
  entries: readonly ProgressionEntry[];
}): ExerciseProgress | null {
  const metric = metricFor(exercise.entries);
  if (!metric) return null;

  const series = progressionSeries(exercise.entries, metric);
  const trend = progressionTrend(series);
  if (!trend) return null;

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    metric,
    sessions: trend.sessions,
    best: trend.best,
    latest: trend.latest,
    weeksFlat: trend.weeksFlat,
    stalled: trend.stalled,
    series,
    nextStep: nextRung(exercise.slug),
  };
}

/**
 * Harder variations, keyed on catalogue slug.
 *
 * The catalogue already contains these ladders implicitly — push-up, diamond
 * push-up and dip are all in it, in that order of difficulty — and making the
 * relation explicit is what lets the suggestion bar say something useful when a
 * movement has stopped moving. A fixed-load movement cannot progress by adding
 * weight, so the next rung IS the progression.
 *
 * Kept here rather than in the database because it is a property of the
 * movements themselves, not of the user's copy of them: a slug is stable, the
 * ladder does not vary per person, and putting it in a column would mean a
 * migration and a seed pass to express something that is simply true.
 * A custom movement has no rung, which is correct — the app has no idea what
 * "Dennis's odd shoulder thing" is harder than.
 */
const LADDER: Record<string, string> = {
  // Push
  "push-up": "diamond-push-up",
  "diamond-push-up": "dip",
  "pike-push-up": "handstand-hold",
  // Pull
  "inverted-row": "chin-up",
  "chin-up": "pull-up",
  // Legs
  "bodyweight-squat": "split-squat",
  "split-squat": "bulgarian-split-squat",
  "bulgarian-split-squat": "pistol-squat",
  "glute-bridge": "hip-thrust",
  "lunge": "bulgarian-split-squat",
  "step-up": "bulgarian-split-squat",
  // Core
  "sit-up": "hanging-leg-raise",
  "plank": "hollow-hold",
  "hollow-hold": "ab-wheel-rollout",
  "side-plank": "russian-twist",
  // Grip
  "dead-hang": "pull-up",
  "calf-raise": "standing-calf-raise",
};

export function nextRung(slug: string): string | null {
  return LADDER[slug] ?? null;
}

/** "3 x 10", "60 kg x 5", "2m 30s" — how a day's best set was actually logged. */
export function describeSet(entry: ProgressionEntry, metric: ProgressionMetric): string {
  const sets = entry.sets > 0 ? entry.sets : 1;

  if (metric === "hold") {
    const seconds = entry.durationSec ?? 0;
    const mins = Math.floor(seconds / 60);
    const rem = Math.round(seconds % 60);
    const duration = mins === 0 ? `${rem}s` : rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
    return sets > 1 ? `${sets} x ${duration}` : duration;
  }

  const reps = entry.reps ?? 0;
  if (metric === "e1rm") {
    return `${trimNumber(entry.weightKg ?? 0)} kg x ${reps}`;
  }
  return sets > 1 ? `${sets} x ${reps}` : `${reps} reps`;
}

/** How the metric's values should be read. */
export function metricLabel(metric: ProgressionMetric): string {
  if (metric === "e1rm") return "est. 1RM";
  if (metric === "reps") return "best set";
  return "longest hold";
}

export function formatMetricValue(value: number, metric: ProgressionMetric): string {
  if (metric === "e1rm") return `${trimNumber(value)} kg`;
  if (metric === "reps") return `${Math.round(value)} reps`;

  const mins = Math.floor(value / 60);
  const rem = Math.round(value % 60);
  if (mins === 0) return `${rem}s`;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
