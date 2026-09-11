/**
 * How hard, not just how much. Pure functions, no database access, same
 * discipline as lib/cardio.ts and lib/targets.ts.
 *
 * MET-minutes are a pure volume currency: intensity times duration, collapsed
 * into one product. By construction 150 min at 4 METs and 37.5 min at 16 METs
 * are the same 600 MET-min — same point on the balance marker, same ring
 * closed, same shading on the calendar. Nowhere in this app was a minute of
 * hard effort distinguishable from four minutes of strolling.
 *
 * That is exactly where MET-minutes stop being a valid instrument for the goal
 * the app states:
 *
 *  - CARDIORESPIRATORY FITNESS is the dominant predictor, not activity volume.
 *    Mandsager et al. 2018, JAMA Netw Open (122,007 treadmill-tested patients):
 *    the adjusted mortality gradient across CRF quintiles exceeds that of
 *    smoking, diabetes or hypertension, with no observed upper limit of
 *    benefit. CRF responds to intensity far more than to accumulated
 *    low-intensity minutes.
 *  - THE VIGOROUS FRACTION carries independent benefit. Wang et al. 2021, JAMA
 *    Intern Med (403,681 adults): at MATCHED total volume, a higher proportion
 *    of vigorous activity was associated with lower all-cause mortality.
 *  - VERY SHORT VIGOROUS BOUTS count, which is this app's own format.
 *    Stamatakis et al. 2022, Nature Medicine: 3-4 bouts of ~1-2 minutes of
 *    vigorous incidental activity a day (VILPA) associated with substantially
 *    lower all-cause and cardiovascular mortality in non-exercisers.
 *
 * A user doing four stair-sprints a day is doing something with strong evidence
 * behind it, and the app scored them as ~40 MET-min and an open ring.
 *
 * THE BLOCKING PROBLEM WAS THAT THE APP COULD NOT CLASSIFY INTENSITY. It had no
 * age and no resting heart rate, so `heartRateFactor` anchored on a fixed 150
 * bpm — "typical" for everyone. For a 25-year-old (HRmax ~190 by Tanaka) that
 * is ~79%, moderate-to-vigorous; for a 60-year-old (~166) it is ~90%, hard.
 * Same factor of 1.0 for both. The fix is two numbers, entered once.
 */

import type { LocalDate } from "./dates";

export interface Physiology {
  /** Year of birth, for age-predicted HRmax. Null when the user has not said. */
  birthYear: number | null;
  /** Resting heart rate in bpm, for heart-rate reserve. Null when not known. */
  restingHr: number | null;
}

export const UNKNOWN_PHYSIOLOGY: Physiology = { birthYear: null, restingHr: null };

export const MIN_BIRTH_YEAR = 1900;
export const MIN_RESTING_HR = 30;
export const MAX_RESTING_HR = 120;

/**
 * Age-predicted maximum heart rate, Tanaka et al. 2001: 208 - 0.7 x age.
 *
 * Tanaka rather than the familiar 220 - age, which was never derived from data
 * and is badly biased at both ends of the age range — it under-predicts for
 * older adults by around ten beats, which is the direction that matters here,
 * since under-predicting HRmax makes every effort look harder than it was.
 */
export function maxHeartRate(age: number): number {
  return 208 - 0.7 * age;
}

/** Age in whole years, or null when the birth year is unknown or implausible. */
export function ageFrom(birthYear: number | null | undefined, today: LocalDate): number | null {
  if (birthYear == null || !Number.isFinite(birthYear)) return null;

  const thisYear = Number(today.slice(0, 4));
  const age = thisYear - birthYear;
  return age >= 10 && age <= 120 ? age : null;
}

/**
 * Relative intensity, 0..1, on the best scale the app has the inputs for.
 *
 * KARVONEN (heart-rate reserve) when a resting heart rate is known, because it
 * accounts for the fact that two people at 130 bpm are not working equally hard
 * if one of them sits at 45 and the other at 75. %HRmax when only age is known.
 * Null when neither is, which is the app's state until the user says.
 */
export function relativeIntensity(
  bpm: number,
  physiology: Physiology,
  today: LocalDate,
): { value: number; scale: "hrr" | "hrmax" } | null {
  const age = ageFrom(physiology.birthYear, today);
  if (age == null) return null;

  const hrMax = maxHeartRate(age);
  if (hrMax <= 0) return null;

  const resting = physiology.restingHr;
  if (resting != null && Number.isFinite(resting) && resting > 0 && hrMax > resting) {
    return { value: (bpm - resting) / (hrMax - resting), scale: "hrr" };
  }
  return { value: bpm / hrMax, scale: "hrmax" };
}

/**
 * ACSM's intensity bands.
 *
 * Moderate is 64-76% HRmax or 40-59% HRR; vigorous is >= 77% HRmax or >= 60%
 * HRR. On the metabolic scale, moderate is 3-5.9 METs and vigorous >= 6.
 */
export const VIGOROUS_HRMAX = 0.77;
export const MODERATE_HRMAX = 0.64;
export const VIGOROUS_HRR = 0.6;
export const MODERATE_HRR = 0.4;
export const VIGOROUS_METS = 6;
export const MODERATE_METS = 3;

/**
 * The relative intensity a typical instance of a movement is performed at, used
 * as the anchor the heart-rate factor scales around.
 *
 * The midpoint of ACSM's moderate band on each scale. It replaces the old fixed
 * 150 bpm, which was a single absolute number standing in for "typical" across
 * every age — ~79% of a 25-year-old's maximum and ~90% of a 60-year-old's.
 */
export const REFERENCE_HRMAX = 0.7;
export const REFERENCE_HRR = 0.5;

export type Intensity = "light" | "moderate" | "vigorous";

/**
 * How hard one entry was.
 *
 * Heart rate first where there is one and the app knows enough to read it,
 * because it is measured; METs otherwise, which is the movement's typical cost
 * and is what the app has always had. The order matters: a "vigorous" movement
 * performed gently is not vigorous, and only the heart rate can say so.
 */
export function classifyIntensity(
  entry: { mets: number; avgHeartRate: number | null },
  physiology: Physiology,
  today: LocalDate,
): Intensity {
  if (entry.avgHeartRate != null && entry.avgHeartRate > 0) {
    const relative = relativeIntensity(entry.avgHeartRate, physiology, today);
    if (relative) {
      const vigorous = relative.scale === "hrr" ? VIGOROUS_HRR : VIGOROUS_HRMAX;
      const moderate = relative.scale === "hrr" ? MODERATE_HRR : MODERATE_HRMAX;

      if (relative.value >= vigorous) return "vigorous";
      return relative.value >= moderate ? "moderate" : "light";
    }
  }

  if (entry.mets >= VIGOROUS_METS) return "vigorous";
  return entry.mets >= MODERATE_METS ? "moderate" : "light";
}

/**
 * Scale a movement's nominal METs by how hard the heart was actually working.
 *
 * Returns null when the app cannot place the reading on a personal scale, so
 * the caller can fall back to the old fixed anchor rather than silently
 * restating a history logged before the user entered an age.
 *
 * The clamp is kept: a wrist-optical sensor that latches onto a cadence can
 * read 170 during a walk, and no correction should be allowed to triple a
 * session's score on one bad reading.
 */
export function personalHeartRateFactor(
  bpm: number,
  physiology: Physiology,
  today: LocalDate,
  clampMin = 0.6,
  clampMax = 1.6,
): number | null {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;

  const relative = relativeIntensity(bpm, physiology, today);
  if (!relative) return null;

  const reference = relative.scale === "hrr" ? REFERENCE_HRR : REFERENCE_HRMAX;
  const factor = relative.value / reference;

  return Math.min(clampMax, Math.max(clampMin, factor));
}

/**
 * WHO's weekly vigorous minimum, the vigorous-only route to the guideline.
 *
 * 75 minutes. Reported alongside the total rather than folded into it, for the
 * same reason cardio is a second series beside strength: two qualities, never
 * summed. Volume can be met entirely with strolling, and the evidence above
 * says the vigorous fraction carries benefit of its own at matched volume.
 */
export const VIGOROUS_TARGET_MINUTES_PER_WEEK = 75;

/**
 * Vigorous bouts a day that the VILPA work associates with lower mortality.
 *
 * Three, of one to two minutes. Counted as BOUTS rather than as minutes because
 * that is how the finding is stated and because this app's whole format is the
 * short effort a minutes-based target rounds away — four stair-sprints is about
 * four minutes, which against a 75-minute weekly target looks like nothing.
 */
export const VILPA_BOUTS_PER_DAY = 3;

export interface IntensitySummary {
  /** Minutes of vigorous effort in the window. */
  vigorousMinutes: number;
  /** Their MET-minutes — a second series, never added to the cardio total. */
  vigorousMetMinutes: number;
  /** Separate vigorous efforts, however short. The VILPA format. */
  vigorousBouts: number;
  /** Per week, so windows of different lengths are comparable. */
  vigorousMinutesPerWeek: number;
  vigorousBoutsPerDay: number;
  /** Days since the last vigorous effort; null if there has never been one. */
  daysSinceVigorous: number | null;
  /** True once the app has enough to read a heart rate on a personal scale. */
  personalised: boolean;
}

/** Nothing vigorous, and no way to read a heart rate personally. */
export function emptyIntensity(): IntensitySummary {
  return {
    vigorousMinutes: 0,
    vigorousMetMinutes: 0,
    vigorousBouts: 0,
    vigorousMinutesPerWeek: 0,
    vigorousBoutsPerDay: 0,
    daysSinceVigorous: null,
    personalised: false,
  };
}

/**
 * Roll a window's entries up into the vigorous picture.
 *
 * `metMinutesFor` and `minutesFor` are injected so this file stays free of the
 * MET maths, the same way lib/scoring.ts stays free of it.
 */
export function summariseIntensity<T>(params: {
  entries: readonly T[];
  windowDays: number;
  physiology: Physiology;
  today: LocalDate;
  classify: (entry: T) => Intensity;
  metMinutesFor: (entry: T) => number;
  minutesFor: (entry: T) => number;
  dateOf: (entry: T) => LocalDate;
  daysBetween: (from: LocalDate, to: LocalDate) => number;
}): IntensitySummary {
  const { entries, windowDays, physiology, today, classify } = params;

  let vigorousMinutes = 0;
  let vigorousMetMinutes = 0;
  let vigorousBouts = 0;
  let lastVigorous: LocalDate | null = null;

  for (const entry of entries) {
    if (classify(entry) !== "vigorous") continue;

    const metMinutes = params.metMinutesFor(entry);
    // Strength work has no MET-minutes — cardioBias scales them to zero — and
    // counting it here would report a heavy set of squats as vigorous cardio.
    if (metMinutes <= 0) continue;

    vigorousMinutes += params.minutesFor(entry);
    vigorousMetMinutes += metMinutes;
    vigorousBouts += 1;

    const date = params.dateOf(entry);
    if (!lastVigorous || date > lastVigorous) lastVigorous = date;
  }

  const weeks = windowDays > 0 ? windowDays / 7 : 1;
  const days = windowDays > 0 ? windowDays : 1;

  return {
    vigorousMinutes: round1(vigorousMinutes),
    vigorousMetMinutes: Math.round(vigorousMetMinutes),
    vigorousBouts,
    vigorousMinutesPerWeek: round1(vigorousMinutes / weeks),
    vigorousBoutsPerDay: round2(vigorousBouts / days),
    daysSinceVigorous: lastVigorous
      ? Math.max(0, params.daysBetween(lastVigorous, today))
      : null,
    personalised: ageFrom(physiology.birthYear, today) != null,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
