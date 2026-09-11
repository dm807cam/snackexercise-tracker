/**
 * What the app is aiming at. Pure functions, no database access, same
 * discipline as lib/scoring.ts and lib/volume.ts.
 *
 * Both weekly targets were fixed constants, and both encoded a choice the app
 * never admitted to making.
 *
 * CARDIO WAS THE GUIDELINE FLOOR. 600 MET-minutes is 150 min x 4 METs — the
 * LOWER bound of the WHO 2020 range, which is 150-300 min moderate or 75-150
 * vigorous, i.e. 600-1200 MET-min. The all-cause-mortality dose-response does
 * not plateau there:
 *
 *  - Arem et al. 2015, JAMA Intern Med (661,000 adults, pooled cohorts): 1-2x
 *    the minimum gives ~20% lower mortality; 3-5x it (~1350-2400 MET-min/wk)
 *    gives ~39%, with the curve flattening past that.
 *  - Lee et al. 2022, Circulation (~116,000 adults, 30 years): lowest mortality
 *    at 150-300 min/wk vigorous or 300-600 moderate — again ~1200-2400 MET-min
 *    — with no harm signal up to 4x the minimum.
 *
 * So for a user whose stated aim is longevity, closing a ring at 600 said "you
 * are done" at the point the returns are still steeply positive. Roughly half
 * the available benefit sat above the target.
 *
 * THE STRENGTH SIDE HAS THE OPPOSITE SHAPE, and the app was conflating two
 * goals with one number. ~27 hard sets a week is a HYPERTROPHY dose. The
 * resistance-training mortality curve is J-shaped and peaks low: Momma et al.
 * 2022, BJSM (systematic review and meta-analysis) found maximum all-cause
 * mortality benefit at ~30-60 min/wk of muscle-strengthening, attenuating and
 * crossing null beyond ~130-140 min/wk.
 *
 * That is NOT an argument for lowering the strength target — hypertrophy is a
 * stated goal of this app — which is exactly why the two claims are now
 * separated rather than averaged: the app says which target it is showing, and
 * a preset that raises cardio for longevity leaves strength where it is.
 */

/** A weekly dose for each side. The unit of both is stated in the field name. */
export interface Targets {
  /** MET-minutes a week. */
  cardioMetMinutesPerWeek: number;
  /** Hard sets a week — normalised for movement fan-out; see ADR 0016. */
  strengthHardSetsPerWeek: number;
}

/**
 * The WHO's aerobic minimum, and the point below which the app should not
 * describe anyone as meeting activity guidelines.
 *
 * Kept separate from the configurable target so that raising the target does
 * not move the floor: "you have met the public-health guideline" and "you have
 * met the goal you set" are two different sentences, and the app now says both.
 */
export const GUIDELINE_FLOOR_MET_MIN_PER_WEEK = 600;

/**
 * Effective sets one hard set generates, averaged across the catalogue.
 *
 * A property of the DRAWING SCALE only — it sets where the radar's cardio line
 * and the calendar's shading sit. Fixed rather than computed from the
 * catalogue, because the weightings are editable and a scale that moved when
 * someone adjusted a row would silently restate every past week. See ADR 0016.
 */
export const EFFECTIVE_SETS_PER_HARD_SET = 2.2;

export type TargetPreset = "guideline" | "longevity" | "custom";

/**
 * Meeting the activity guidelines, and nothing beyond them. The app's original
 * behaviour, kept as the default: a target nobody chose should be the one the
 * public-health bodies state, not one this app invented.
 */
export const GUIDELINE_TARGETS: Targets = {
  cardioMetMinutesPerWeek: GUIDELINE_FLOOR_MET_MIN_PER_WEEK,
  strengthHardSetsPerWeek: 27,
};

/**
 * The mortality optimum, for a user who says that is what they are after.
 *
 * 1200 MET-min is the top of the WHO range and the bottom of the band Arem and
 * Lee both put the lowest mortality in. Deliberately not 2400, the top of that
 * band: a target four times the guideline is one most people will simply fail,
 * and the evidence for the extra is thinner than for the first doubling.
 *
 * STRENGTH IS UNCHANGED, and that is the point of separating the two claims.
 * The mortality-optimal resistance dose is LOWER than this (Momma 2022, ~30-60
 * min/wk), so a "longevity" preset that moved strength would have to lower it —
 * away from the hypertrophy dose the app exists to serve. Raising cardio and
 * leaving strength alone is the only combination that serves both goals, and
 * the Settings copy says so.
 */
export const LONGEVITY_TARGETS: Targets = {
  cardioMetMinutesPerWeek: 1200,
  strengthHardSetsPerWeek: GUIDELINE_TARGETS.strengthHardSetsPerWeek,
};

export const MIN_CARDIO_TARGET = 150;
export const MAX_CARDIO_TARGET = 4000;
export const MIN_STRENGTH_TARGET = 4;
export const MAX_STRENGTH_TARGET = 100;

export function presetTargets(preset: TargetPreset): Targets {
  return preset === "longevity" ? LONGEVITY_TARGETS : GUIDELINE_TARGETS;
}

/** Clamp to something the rings and the marker can actually be drawn against. */
export function normaliseTargets(input: Partial<Targets> | null | undefined): Targets {
  return {
    cardioMetMinutesPerWeek: clampNumber(
      input?.cardioMetMinutesPerWeek,
      GUIDELINE_TARGETS.cardioMetMinutesPerWeek,
      MIN_CARDIO_TARGET,
      MAX_CARDIO_TARGET,
    ),
    strengthHardSetsPerWeek: clampNumber(
      input?.strengthHardSetsPerWeek,
      GUIDELINE_TARGETS.strengthHardSetsPerWeek,
      MIN_STRENGTH_TARGET,
      MAX_STRENGTH_TARGET,
    ),
  };
}

/** Which preset a pair of targets corresponds to, for showing the picker's state. */
export function presetFor(targets: Targets): TargetPreset {
  if (sameTargets(targets, GUIDELINE_TARGETS)) return "guideline";
  if (sameTargets(targets, LONGEVITY_TARGETS)) return "longevity";
  return "custom";
}

function sameTargets(a: Targets, b: Targets): boolean {
  return (
    Math.round(a.cardioMetMinutesPerWeek) === Math.round(b.cardioMetMinutesPerWeek) &&
    Math.round(a.strengthHardSetsPerWeek) === Math.round(b.strengthHardSetsPerWeek)
  );
}

/**
 * MET-minutes that carry the same fraction of a weekly target as one effective
 * set — the app's one exchange rate between the two currencies.
 *
 * DERIVED FROM THE TARGETS, not invented beside them, which is what makes a
 * chart able to put both qualities on one radial scale without ADDING them.
 *
 * It therefore MOVES when the cardio target moves, and that coupling is
 * deliberate rather than an oversight: the rate means "an equal share of each
 * side's week", so raising the cardio target really does make a given run a
 * smaller share of it. The visible consequence is that the radar's cardio line
 * and the calendar's shading redraw when the target changes — past days
 * included. They are answering "how much of your current target was that",
 * which is a question whose answer is supposed to change when the target does.
 */
export function metMinutesPerEffectiveSet(targets: Targets): number {
  const strengthOnDrawingScale = targets.strengthHardSetsPerWeek * EFFECTIVE_SETS_PER_HARD_SET;
  if (strengthOnDrawingScale <= 0) return 1;
  return targets.cardioMetMinutesPerWeek / strengthOnDrawingScale;
}

/** MET-minutes expressed on the effective-set scale. Never added to real sets. */
export function effectiveSetEquivalents(metMinutes: number, targets: Targets): number {
  return metMinutes / metMinutesPerEffectiveSet(targets);
}

function clampNumber(
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
