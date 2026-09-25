/**
 * How ready each muscle is to be trained again, right now. Pure.
 *
 * Everything else in the app asks what is NEEDED — what has waited longest,
 * what is furthest below its weekly target. That is the right question for the
 * week and the wrong one for the next ten minutes: if you did three hard sets
 * of push-ups an hour ago, chest is still "needed" by every weekly measure and
 * is also the last thing to train now. Snack training works by coming back to
 * the same muscles often, but not by hammering them hour after hour.
 *
 * THE MODEL. Every recent set leaves fatigue on the muscles it trained, in
 * effective sets (the same currency as the body map), decaying exponentially:
 *
 *     F_m(now) = Σ effectiveSets_m(set) · 2^(-hoursAgo / HALF_LIFE)
 *
 *     readiness_m = max(FLOOR, 1 - F_m / TOLERANCE)
 *
 * With a sixteen-hour half-life and a tolerance of six effective sets, three
 * hard sets an hour ago leave a muscle about half ready; the same three sets
 * yesterday evening leave it about three-quarters ready by lunch; a heavy
 * session two days ago has all but cleared. That matches the 24-48 hour
 * recovery window of the resistance-training literature at snack-sized volumes,
 * without pretending to a precision nobody has.
 *
 * It is a MULTIPLIER on need, never a veto, and it never reaches zero: "you
 * trained this recently" is a reason to prefer something else, not a rule. If
 * the only thing that fits a hotel room is push-ups, the planner proposes
 * push-ups.
 *
 * Cardio gets its own, faster-clearing version: a vigorous bout an hour ago
 * makes another one less appealing, but aerobic work recovers in hours.
 */

import { effortMultiplier } from "../effort";

export const MUSCLE_HALF_LIFE_HOURS = 16;
/** Effective sets of recent work at which a muscle counts as fully fatigued. */
export const MUSCLE_TOLERANCE_SETS = 6;
export const READINESS_FLOOR = 0.2;

export const CARDIO_HALF_LIFE_HOURS = 4;
/** MET-minutes of recent aerobic work at which cardio counts as fully fatigued. */
export const CARDIO_TOLERANCE_MET_MIN = 150;
export const CARDIO_READINESS_FLOOR = 0.3;

/** Past this, a set's contribution is negligible and not worth summing. */
const LOOKBACK_HOURS = 72;

export interface RecentWork {
  performedAtMs: number;
  sets: number;
  effort?: string | null;
  cardioBias: number;
  muscles: readonly { muscle: string; weight: number }[];
  /** This entry's MET-minutes, as lib/cardio.ts computes them. */
  metMinutes: number;
}

function decay(hoursAgo: number, halfLife: number): number {
  return Math.pow(2, -Math.max(0, hoursAgo) / halfLife);
}

/** Decayed fatigue per muscle, in effective sets. */
export function muscleFatigue(recent: readonly RecentWork[], nowMs: number): Map<string, number> {
  const fatigue = new Map<string, number>();
  for (const work of recent) {
    const hoursAgo = (nowMs - work.performedAtMs) / 3_600_000;
    if (hoursAgo > LOOKBACK_HOURS || hoursAgo < -1) continue;
    const strength = 1 - Math.min(1, Math.max(0, work.cardioBias));
    if (strength <= 0) continue;
    const sets = work.sets > 0 ? work.sets : 1;
    const weight = sets * strength * effortMultiplier(work.effort) * decay(hoursAgo, MUSCLE_HALF_LIFE_HOURS);
    for (const { muscle, weight: share } of work.muscles) {
      fatigue.set(muscle, (fatigue.get(muscle) ?? 0) + weight * share);
    }
  }
  return fatigue;
}

export function muscleReadiness(fatigue: ReadonlyMap<string, number>, muscle: string): number {
  const load = fatigue.get(muscle) ?? 0;
  return Math.max(READINESS_FLOOR, 1 - load / MUSCLE_TOLERANCE_SETS);
}

export function cardioReadiness(recent: readonly RecentWork[], nowMs: number): number {
  let load = 0;
  for (const work of recent) {
    const hoursAgo = (nowMs - work.performedAtMs) / 3_600_000;
    if (hoursAgo > LOOKBACK_HOURS || hoursAgo < -1) continue;
    load += work.metMinutes * decay(hoursAgo, CARDIO_HALF_LIFE_HOURS);
  }
  return Math.max(CARDIO_READINESS_FLOOR, 1 - load / CARDIO_TOLERANCE_MET_MIN);
}
