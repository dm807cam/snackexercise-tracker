/**
 * Cardio scoring. Pure functions, no database access, same discipline as
 * lib/scoring.ts.
 *
 * Effective sets cannot score a run. Log a 40-minute run as one set and the
 * radar claims it delivered leg volume; log it as forty and the body map goes
 * solid and "needs attention" stays quiet on legs for a fortnight. No set count
 * is honest about both effort and stimulus, because effective sets measure
 * stimulus *for growth* specifically.
 *
 * So cardio gets its own currency: MET-MINUTES, intensity times duration. It is
 * bodyweight-independent (unlike kilocalories, which would make a heavy person
 * look fitter at identical effort), it needs nothing the user has to rate by
 * hand (unlike session-RPE), and it has a published anchor — the WHO's weekly
 * target of 150 minutes moderate *or* 75 minutes vigorous lands on the same
 * number, ~600 MET-min, which is the tell that this is the right unit.
 *
 * Accuracy: MET-minutes are a plus-or-minus-twenty-percent instrument. That is
 * fine here because they are only ever used inside a ratio (see lib/balance.ts),
 * where a systematic bias moves the answer far less than it moves either number
 * alone.
 */

/** WHO's weekly aerobic target, expressed in MET-minutes. */
export const CARDIO_TARGET_MET_MIN_PER_WEEK = 600;

/** Used when a movement is aerobic but the catalogue has no METs for it. */
export const FALLBACK_METS = 6;

export interface CardioInput {
  sets: number;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  exercise: { cardioBias: number; mets: number | null; slug?: string };
}

// --- METs from pace --------------------------------------------------------

/**
 * ACSM metabolic equations. VO2 in ml/kg/min for a speed in metres/minute;
 * one MET is 3.5 ml/kg/min by definition.
 *
 * These run about 5-8% above the Compendium's table values at running speeds
 * (10 km/h gives 10.5 here against a tabulated 9.8). Preferred anyway, because
 * a continuous function of the pace the user actually ran beats a lookup that
 * rounds every run to the same three numbers.
 */
export function walkingMets(metresPerMinute: number): number {
  return (0.1 * metresPerMinute + 3.5) / 3.5;
}

export function runningMets(metresPerMinute: number): number {
  return (0.2 * metresPerMinute + 3.5) / 3.5;
}

/**
 * Cycling has no usable ACSM equation without power output, which nobody logs,
 * so it gets the Compendium's speed bands interpolated into a curve.
 */
export function cyclingMets(kmPerHour: number): number {
  const points: [number, number][] = [
    [0, 3],
    [16, 6],
    [19, 6.8],
    [22, 8],
    [25, 10],
    [30, 12],
    [35, 15.8],
  ];
  return interpolate(points, kmPerHour);
}

function interpolate(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];

  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x > x1) continue;
    const [x0, y0] = points[i - 1];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/** Movements whose pace is worth converting, and the equation that fits them. */
type PaceFamily = "foot" | "cycle";

const PACE_FAMILY: Record<string, PaceFamily> = {
  run: "foot",
  "treadmill-run": "foot",
  walk: "foot",
  hike: "foot",
  cycle: "cycle",
  "stationary-bike": "cycle",
};

export function paceFamilyFor(slug: string | undefined): PaceFamily | null {
  return slug ? (PACE_FAMILY[slug] ?? null) : null;
}

/**
 * METs from distance and duration. Walking and running are the same activity
 * at different speeds and want different equations; 6.4 km/h (~107 m/min) is
 * the conventional crossover.
 */
export function metsFromPace(
  family: PaceFamily,
  distanceM: number,
  durationSec: number,
): number | null {
  if (distanceM <= 0 || durationSec <= 0) return null;
  const metresPerMinute = distanceM / (durationSec / 60);

  if (family === "cycle") return cyclingMets((metresPerMinute * 60) / 1000);
  return metresPerMinute >= 107 ? runningMets(metresPerMinute) : walkingMets(metresPerMinute);
}

// --- METs from heart rate --------------------------------------------------

/**
 * Scale a movement's nominal METs by how hard the heart was actually working.
 *
 * %HRmax is used rather than heart-rate reserve because HRR needs a resting
 * heart rate the app does not have, and age-predicted HRmax (208 - 0.7 x age)
 * needs an age it also does not have. So this deliberately does not try to
 * compute an absolute intensity: it asks only "was this harder or easier than
 * the typical instance of this movement?", anchored on 150 bpm as typical and
 * clamped so a wrist-optical misread cannot triple a session's score.
 */
export function heartRateFactor(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 1;
  return clamp(bpm / 150, 0.6, 1.6);
}

// --- duration --------------------------------------------------------------

/**
 * Seconds of work, imputed when the user did not record any.
 *
 * "3 x 15 burpees" has a real aerobic cost and no duration. Three seconds a
 * rep, 45 seconds a set. Crude, and applied *only* to the cardio side — the
 * strength side already has an honest set count and does not need a guess.
 */
export function effectiveDurationSec(input: {
  sets: number;
  reps: number | null;
  durationSec: number | null;
}): number {
  if (input.durationSec != null && input.durationSec > 0) {
    return input.durationSec * Math.max(1, input.sets);
  }
  const sets = Math.max(1, input.sets);
  const perSet = input.reps != null && input.reps > 0 ? Math.min(input.reps * 3, 600) : 45;
  return sets * perSet;
}

// --- the ladder ------------------------------------------------------------

/**
 * METs for one entry, best available evidence first:
 *
 *   1. heart rate  — measured, so it beats anything inferred
 *   2. pace        — computed from what was actually covered
 *   3. catalogue   — the movement's typical cost
 *   4. fallback    — 6 METs, generic vigorous effort
 */
export function metsForEntry(input: CardioInput): number {
  const base = input.exercise.mets ?? FALLBACK_METS;

  if (input.avgHeartRate != null && input.avgHeartRate > 0) {
    return clamp(base * heartRateFactor(input.avgHeartRate), 1, 23);
  }

  const family = paceFamilyFor(input.exercise.slug);
  if (family && input.distanceM != null && input.durationSec != null) {
    const paced = metsFromPace(family, input.distanceM, input.durationSec);
    if (paced != null) return clamp(paced, 1, 23);
  }

  return clamp(base, 1, 23);
}

/**
 * MET-minutes an entry contributes to the cardio side, already scaled by how
 * aerobic the movement is. A kettlebell swing at bias 0.4 gives 40% of its
 * MET-minutes here and keeps 60% of its effective sets on the strength side.
 */
export function entryMetMinutes(input: CardioInput): number {
  const bias = clamp(input.exercise.cardioBias ?? 0, 0, 1);
  if (bias <= 0) return 0;
  return (effectiveDurationSec(input) / 60) * metsForEntry(input) * bias;
}

// --- steps -----------------------------------------------------------------

export type StepsMode = "off" | "half" | "full";

export interface StepSettings {
  mode: StepsMode;
  /** Steps below this are ordinary living, not training. */
  baseline: number;
}

export const DEFAULT_STEP_BASELINE = 4000;
export const MIN_STEP_BASELINE = 3000;
/** Ordinary walking cadence, steps per minute. */
export const STEP_CADENCE = 110;
/** Walking above the baseline is moderate-intensity by definition (100+ spm). */
export const STEP_METS = 3.5;

export function stepWeightFor(mode: StepsMode): number {
  return mode === "off" ? 0 : mode === "half" ? 0.5 : 1;
}

/**
 * A personal step baseline: the 25th percentile of the user's own daily counts.
 *
 * A fixed default is wrong for both a desk worker and a nurse. Taking the
 * quiet quarter of someone's own days subtracts *their* incidental living,
 * whatever it happens to be, and self-calibrates if their life changes. Needs a
 * fortnight of data before it means anything; below that, the fixed default.
 */
export function personalStepBaseline(
  dailySteps: readonly number[],
  fallback = DEFAULT_STEP_BASELINE,
): number {
  const values = dailySteps.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (values.length < 14) return fallback;

  const index = Math.floor((values.length - 1) * 0.25);
  return Math.max(MIN_STEP_BASELINE, Math.round(values[index]));
}

/** Stride length in metres, for turning a logged distance back into steps. */
const STRIDE_WALKING = 0.75;
const STRIDE_RUNNING = 1.15;
const CADENCE_RUNNING = 165;

/**
 * Steps a logged foot-based session already accounts for.
 *
 * A logged 5 km run is also about 7,000 steps on the phone, and counting both
 * is counting the same run twice — which would drift a runner's balance marker
 * cardio-ward for a reason that is purely an artefact of the sensor.
 */
export function impliedStepsFromEntries(entries: readonly CardioInput[]): number {
  let steps = 0;
  for (const entry of entries) {
    if (paceFamilyFor(entry.exercise.slug) !== "foot") continue;

    if (entry.distanceM != null && entry.distanceM > 0) {
      const durationSec = entry.durationSec ?? 0;
      const running =
        durationSec > 0 && entry.distanceM / (durationSec / 60) >= 107;
      steps += entry.distanceM / (running ? STRIDE_RUNNING : STRIDE_WALKING);
      continue;
    }

    const minutes = effectiveDurationSec(entry) / 60;
    const cadence = entry.exercise.slug === "walk" ? STEP_CADENCE : CADENCE_RUNNING;
    steps += minutes * cadence;
  }
  return steps;
}

/**
 * MET-minutes credited to a day's step count.
 *
 * Three corrections before a single step counts, because steps are the part
 * most likely to produce a number the user does not believe:
 *
 *  - subtract the baseline, so walking to the kitchen is not training;
 *  - subtract steps already logged as cardio, so a run is not counted twice;
 *  - apply the mode's discount. The WHO would count these minutes in full and
 *    for health that is right, but the question on the stats page is not "am I
 *    meeting activity guidelines", it is "is my *training* cardio or strength",
 *    and low-intensity ambulation is activity rather than training. Half by
 *    default; the user can say otherwise.
 */
export function stepMetMinutes(
  steps: number | null | undefined,
  settings: StepSettings,
  alreadyLoggedSteps = 0,
): number {
  if (steps == null || !Number.isFinite(steps) || steps <= 0) return 0;

  const weight = stepWeightFor(settings.mode);
  if (weight <= 0) return 0;

  const credited = Math.max(0, steps - settings.baseline - alreadyLoggedSteps);
  return (credited / STEP_CADENCE) * STEP_METS * weight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
