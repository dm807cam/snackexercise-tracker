/**
 * How much volume a muscle group should be getting. Pure functions, no database
 * access, same discipline as lib/scoring.ts and lib/effort.ts.
 *
 * Everything else in this app measured a muscle group against the user's OWN
 * best-served group. The radar scaled each spoke by the largest spoke; the
 * suggestion ranked deficit against the busiest axis. Both are purely relative,
 * and neither knows what enough is.
 *
 * The consequence was a chart that congratulated the wrong person. Someone
 * doing one easy set per group per day saw a large, even, fully-inflated
 * polygon — their own maximum defined the outer ring — a deficit of zero on
 * every axis, and no "needs attention" rows, at roughly a fifth of the volume
 * associated with meaningful hypertrophy. The inverse held too: 30 sets on
 * chest and 8 on hamstrings scored hamstrings as badly deficient, because the
 * yardstick was chest rather than what hamstrings actually need.
 *
 * THE REFERENCE. Per-muscle weekly volume is the unit the hypertrophy
 * literature states its targets in, and it has a usable range:
 *
 *  - ~10 hard sets per muscle per week is where the dose-response is clearly
 *    established (Schoenfeld, Ogborn & Krieger 2017, J Sports Sci, dose-response
 *    meta-regression);
 *  - gains continue to ~20 with diminishing returns, and later work supports
 *    benefit beyond that for trained lifters (Baz-Valle et al. 2022 systematic
 *    review; Pelland et al. 2024).
 *
 * So it is a BAND, not a line, and the app draws it as one. Anything else would
 * claim a precision the meta-regressions do not have.
 *
 * The unit is this app's per-muscle effective sets, which is a weighted hard-set
 * count for that muscle — a set credits 1.0 where it is the primary mover, 0.5
 * secondary, 0.25 stabiliser — and that is the same thing the literature counts.
 * Note this is the PER-MUSCLE vector, not the scalar dose of ADR 0016: summing
 * across muscles is what needed normalising, and comparing one muscle's volume
 * to a per-muscle target does not sum anything.
 */

import { MUSCLES, type AxisSlug } from "./muscles";

/** Hard sets per muscle per week where the dose-response is clearly established. */
export const PER_MUSCLE_TARGET_SETS_PER_WEEK = 10;

/**
 * The top of the band, as a multiple of the target.
 *
 * Two rather than a second absolute constant so that moving the target in
 * Settings moves the whole band with it, rather than leaving a user who set a
 * target of 16 with an "upper bound" below their own goal.
 */
export const UPPER_BAND_MULTIPLE = 2;

export const MIN_PER_MUSCLE_TARGET = 4;
export const MAX_PER_MUSCLE_TARGET = 40;

/** Muscles that roll up into each radar axis. */
const MUSCLE_COUNT_BY_AXIS = MUSCLES.reduce<Record<string, number>>((counts, muscle) => {
  counts[muscle.axis] = (counts[muscle.axis] ?? 0) + 1;
  return counts;
}, {});

/**
 * The weekly volume one radar axis should carry.
 *
 * An axis is a rollup of one to three muscles, and its value is their SUM, so
 * its target is the per-muscle target times how many muscles it contains. Chest
 * is one muscle and wants ~10; shoulders is front, side and rear delts and
 * wants ~30. The axis target is therefore met exactly when every muscle in it
 * is at the per-muscle target — which is the only reading that keeps one
 * literature number meaning the same thing on all twelve spokes.
 *
 * It does mean an axis can reach its target lopsidedly: 30 on lats and nothing
 * on lower back reads as a full back spoke. That is a property of rolling three
 * muscles into one spoke at all, which the body map is there to show, and it is
 * not made worse by having a target.
 */
export function axisVolumeTarget(
  axis: AxisSlug,
  perMuscleTarget = PER_MUSCLE_TARGET_SETS_PER_WEEK,
): number {
  return (MUSCLE_COUNT_BY_AXIS[axis] ?? 1) * perMuscleTarget;
}

/** Clamp a user-supplied target to something a chart can be drawn against. */
export function normalisePerMuscleTarget(
  value: number | null | undefined,
  fallback = PER_MUSCLE_TARGET_SETS_PER_WEEK,
): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(MAX_PER_MUSCLE_TARGET, Math.max(MIN_PER_MUSCLE_TARGET, Math.round(value)));
}

/**
 * How short of target an axis is, 0..1, on an ABSOLUTE scale.
 *
 * 0 once the target is reached — not once the user's busiest axis is matched.
 * That is the whole difference: under the old relative form, a user training
 * everything equally badly had a deficit of zero everywhere and the app had
 * nothing to suggest but staleness.
 */
export function volumeDeficit(perWeek: number, target: number): number {
  if (!Number.isFinite(perWeek) || !Number.isFinite(target) || target <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - perWeek / target));
}

/** Below this share of its target, an axis is worth naming on the stats page. */
export const ATTENTION_VOLUME_FRACTION = 0.6;

/**
 * True when an axis carries so little volume it should be called out, even
 * though it was trained recently.
 *
 * The gap this closes: "needs attention" was ordered purely by staleness, so an
 * axis touched every day by one stabiliser credit could never appear in it,
 * however far below a useful dose it was.
 */
export function isBelowTargetVolume(perWeek: number, target: number): boolean {
  if (target <= 0) return false;
  return perWeek < target * ATTENTION_VOLUME_FRACTION;
}
