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

import { personalHeartRateFactor, type Physiology } from "./intensity";
import type { LocalDate } from "./dates";

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

/**
 * What the app knows about whose heart rate it is reading, and when "now" is.
 *
 * Optional throughout: every function that takes it works without it, on the
 * fixed anchor, which is what the app did before anyone could enter an age.
 */
export interface IntensityContext {
  physiology: Physiology;
  today: LocalDate;
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

/**
 * Plausible speeds in metres/minute, used ONLY to turn a distance into a
 * duration when the user logged the first and not the second. Never fed back
 * into the MET calculation — an assumed pace must not masquerade as a measured
 * one, so a distance-only entry still scores at its catalogue METs.
 */
const ASSUMED_SPEED: Record<string, number> = {
  run: 167, // 10 km/h
  "treadmill-run": 167,
  walk: 83, // 5 km/h
  hike: 67, // 4 km/h
  cycle: 333, // 20 km/h
  "stationary-bike": 333,
  swim: 33, // 2 km/h
  "row-erg": 200,
};

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
 * Scale a movement's nominal METs by how hard the heart was actually working,
 * with no idea whose heart it is.
 *
 * The fallback, kept for exactly one case: the user has not told the app their
 * age. It cannot compute an absolute intensity, so it asks only "was this
 * harder or easier than the typical instance of this movement?", anchored on
 * 150 bpm as typical and clamped so a wrist-optical misread cannot triple a
 * session's score.
 *
 * 150 bpm is a poor stand-in for "typical" — it is ~79% of a 25-year-old's
 * predicted maximum and ~90% of a 60-year-old's, so the same reading means very
 * different things and this returns 1.0 for both. `personalHeartRateFactor` in
 * lib/intensity.ts replaces it as soon as there is a birth year to work with;
 * this one stays so that entering an age IMPROVES the estimate rather than
 * silently restating every heart rate logged before.
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
  distanceM?: number | null;
  exercise?: { slug?: string };
}): number {
  const sets = Math.max(1, input.sets);

  if (input.durationSec != null && input.durationSec > 0) {
    return input.durationSec * sets;
  }

  // "I ran 10k" with no time on it. Falling through to 45 seconds a set would
  // score a 10 km run at 7 MET-minutes while still subtracting 13,000 steps
  // from the day's walking credit — logging the run would make the cardio dose
  // go DOWN. Estimate the time from the distance instead.
  if (input.distanceM != null && input.distanceM > 0) {
    const speed = ASSUMED_SPEED[input.exercise?.slug ?? ""];
    if (speed) return Math.round((input.distanceM / speed) * 60) * sets;
  }

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
export function metsForEntry(input: CardioInput, context?: IntensityContext): number {
  const base = input.exercise.mets ?? FALLBACK_METS;

  if (input.avgHeartRate != null && input.avgHeartRate > 0) {
    // Read on the user's own scale when the app has one, and on the old fixed
    // anchor when it does not — so entering an age improves the estimate rather
    // than restating every heart rate already logged.
    const personal = context
      ? personalHeartRateFactor(input.avgHeartRate, context.physiology, context.today)
      : null;
    const factor = personal ?? heartRateFactor(input.avgHeartRate);
    return clamp(base * factor, 1, 23);
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
export function entryMetMinutes(input: CardioInput, context?: IntensityContext): number {
  const bias = clamp(input.exercise.cardioBias ?? 0, 0, 1);
  if (bias <= 0) return 0;
  return (effectiveDurationSec(input) / 60) * metsForEntry(input, context) * bias;
}

/** Minutes of work an entry represents, for the vigorous-minutes target. */
export function entryMinutes(input: CardioInput): number {
  return effectiveDurationSec(input) / 60;
}

// --- steps -----------------------------------------------------------------

export type StepsMode = "off" | "half" | "full";

export interface StepSettings {
  mode: StepsMode;
  /** Steps below this are ordinary living, not training. */
  baseline: number;
}

/** A day's walking, as the phone reports it. */
export interface DayWalking {
  steps: number | null | undefined;
  /**
   * Minutes the phone counted as brisk or active, when it reports them.
   *
   * The only thing that lets the app tell 6,000 extra slow steps from 6,000
   * extra brisk ones — which, under a single flat MET rate, scored identically.
   */
  activeMinutes?: number | null;
}

export const DEFAULT_STEP_BASELINE = 4000;
export const MIN_STEP_BASELINE = 3000;
/** Ordinary walking cadence, steps per minute. */
export const STEP_CADENCE = 110;

/**
 * Brisk walking — the Compendium's "moderate pace", and what the 100+ spm
 * cadence threshold (Tudor-Locke et al. 2018) actually describes.
 *
 * Reserved for minutes the PHONE calls active. That threshold is about
 * instantaneous cadence during a walking bout; it says nothing about a daily
 * step total, and crediting a whole day's surplus at this rate assumed the
 * surplus was all purposeful brisk walking.
 */
export const STEP_METS_BRISK = 3.5;

/**
 * Everything else above the baseline: kitchen, corridor, shop.
 *
 * The Compendium's slow-pace walking. Steps arriving as one daily number from
 * a phone are overwhelmingly accumulated well under 100 spm, so this is the
 * honest default and 3.5 is what a day EARNS by reporting active minutes.
 */
export const STEP_METS_INCIDENTAL = 2.8;

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

    // Distance is per set, the same way durationSec is: 6 x 400 m repeats cover
    // 2.4 km, and crediting one 400 m would leave five reps' worth of steps
    // double-counted against the day.
    const sets = Math.max(1, entry.sets);

    if (entry.distanceM != null && entry.distanceM > 0) {
      const durationSec = entry.durationSec ?? 0;
      const running =
        durationSec > 0 && entry.distanceM / (durationSec / 60) >= 107;
      steps += (entry.distanceM * sets) / (running ? STRIDE_RUNNING : STRIDE_WALKING);
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
  /** Minutes the phone called active, when it reports them. */
  activeMinutes?: number | null,
): number {
  if (steps == null || !Number.isFinite(steps) || steps <= 0) return 0;

  const weight = stepWeightFor(settings.mode);
  if (weight <= 0) return 0;

  const credited = Math.max(0, steps - settings.baseline - alreadyLoggedSteps);
  if (credited <= 0) return 0;

  const creditedMinutes = credited / STEP_CADENCE;

  // Brisk minutes are the ones the phone actually observed at pace; the rest
  // is incidental ambulation. Capped at the credited minutes so a day whose
  // active minutes exceed its surplus steps cannot earn more than it walked.
  const brisk =
    activeMinutes != null && Number.isFinite(activeMinutes) && activeMinutes > 0
      ? Math.min(creditedMinutes, activeMinutes)
      : 0;
  const incidental = creditedMinutes - brisk;

  return (brisk * STEP_METS_BRISK + incidental * STEP_METS_INCIDENTAL) * weight;
}

/**
 * Steps that would supply a given number of MET-minutes, at the incidental
 * rate and above the baseline.
 *
 * Exists so Settings can state the thing the "half weight" control actually
 * controls. "Half weight" does not communicate "about 12,000 steps closes half
 * your cardio ring" to anyone, and that is the fact the setting decides.
 */
export function stepsForMetMinutes(metMinutes: number, settings: StepSettings): number | null {
  const weight = stepWeightFor(settings.mode);
  if (weight <= 0 || metMinutes <= 0) return null;

  const steps = (metMinutes / (STEP_METS_INCIDENTAL * weight)) * STEP_CADENCE;
  return Math.round(settings.baseline + steps);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
