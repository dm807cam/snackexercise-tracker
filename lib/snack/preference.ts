/**
 * What the user actually does when a movement is proposed. Pure.
 *
 * A planner that ignores its own track record proposes the same burpees every
 * time and gets skipped every time. This one keeps score per movement — done,
 * skipped, swapped for something else — and reads the score as a Beta-Bernoulli
 * posterior on "will they do it if I ask":
 *
 *     alpha = PRIOR_DONE + done
 *     beta  = PRIOR_NOT  + SKIP_WEIGHT · skipped + SWAP_WEIGHT · swapped
 *
 * A swap counts most against a movement: the user looked at it and asked for
 * anything else. A skip counts least, because "not now" is as often about the
 * moment — a phone call, a meeting overrunning — as about the movement.
 *
 * The prior is Beta(4, 2): optimistic (a movement in the catalogue is probably
 * fine) and confident enough that one early skip does not bury a movement.
 *
 * The planner does not use the posterior MEAN; it SAMPLES from it (Thompson
 * sampling). The mean would never propose a movement nobody has an opinion
 * about yet ahead of a known-good one, and so would never find out whether the
 * user likes it. Sampling tries uncertain movements in proportion to how likely
 * they are to be good, and settles down on its own as evidence accumulates —
 * the textbook answer to explore-versus-exploit, and far better studied than
 * any hand-tuned "try something new every fifth time". The draw is seeded
 * (lib/snack/random.ts), so a plan is still reproducible.
 *
 * The result scales utility between PREFERENCE_MIN and PREFERENCE_MAX — a
 * quarter either way, deliberately narrower than the gap between a group that
 * has waited a week and one trained yesterday, so habit breaks ties between
 * comparable needs and never overrides what is actually overdue. It shifts
 * choices; it never removes a movement. Only "never suggest this"
 * (`blocked`) does that, because only the user gets to say never.
 */

import { sampleBeta } from "./random";

export interface PreferenceStats {
  done: number;
  skipped: number;
  swapped: number;
  blocked: boolean;
}

export const PRIOR_DONE = 4;
export const PRIOR_NOT = 2;
export const SKIP_WEIGHT = 0.5;
export const SWAP_WEIGHT = 1.5;
export const PREFERENCE_MIN = 0.75;
export const PREFERENCE_MAX = 1.25;

export function posterior(stats: PreferenceStats | undefined): { alpha: number; beta: number } {
  return {
    alpha: PRIOR_DONE + Math.max(0, stats?.done ?? 0),
    beta:
      PRIOR_NOT +
      SKIP_WEIGHT * Math.max(0, stats?.skipped ?? 0) +
      SWAP_WEIGHT * Math.max(0, stats?.swapped ?? 0),
  };
}

/** Posterior mean — for display ("you usually do these"), not for choosing. */
export function preferenceMean(stats: PreferenceStats | undefined): number {
  const { alpha, beta } = posterior(stats);
  return alpha / (alpha + beta);
}

/**
 * One Thompson draw, mapped onto the utility multiplier — or, with `explore`
 * off, the posterior mean, for a caller that wants the planner's settled
 * opinion rather than its exploration.
 */
export function preferenceFactor(
  stats: PreferenceStats | undefined,
  random: () => number,
  explore = true,
): number {
  const { alpha, beta } = posterior(stats);
  const p = explore ? sampleBeta(alpha, beta, random) : alpha / (alpha + beta);
  return PREFERENCE_MIN + (PREFERENCE_MAX - PREFERENCE_MIN) * p;
}
