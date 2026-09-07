/**
 * How much of today is still to do. Pure functions, no database access, same
 * discipline as lib/scoring.ts and lib/cardio.ts.
 *
 * Every other number in this app is retrospective or weekly. Neither answers
 * the question a person actually has at 3pm — "is there anything left in me
 * that I owe today?" — and a weekly figure is the wrong shape for it: 42 of 60
 * effective sets is not an amount anyone can act on before bedtime.
 *
 * THE DAILY SHARE. Each side's target is a seventh of its own weekly guideline:
 * 60 effective sets and 600 MET-minutes become ~8.6 sets and ~86 MET-minutes a
 * day. Derived from those constants rather than written out, so the day view,
 * the balance marker, the calendar and the radar cannot drift apart about what
 * "on target" means.
 *
 * An even seventh is the right split *for this app specifically*. Spreading a
 * strength guideline evenly across seven days would be odd advice for someone
 * training in sessions — you cannot productively train everything daily — but
 * the whole premise here is scattered snacks, so an even daily share is the
 * app's own thesis rather than a simplification of someone else's.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not carry a surplus forward or a
 * shortfall back. A huge Tuesday does not buy Wednesday off, and an empty
 * Monday does not make Tuesday owe double. Both would be defensible; both would
 * also make today's number depend on days the user is no longer looking at,
 * which is exactly what makes a daily goal legible. The weekly picture is on
 * the stats page, where it belongs, and a rest day showing a shortfall is not
 * an accusation — the copy in the UI says so.
 */

import { CARDIO_TARGET_MET_MIN_PER_WEEK, FALLBACK_METS } from "./cardio";
import { STRENGTH_TARGET_EFFECTIVE_SETS_PER_WEEK } from "./balance";

export const DAYS_PER_WEEK = 7;

/** Effective sets that count as a full day of resistance work. */
export const STRENGTH_TARGET_PER_DAY = STRENGTH_TARGET_EFFECTIVE_SETS_PER_WEEK / DAYS_PER_WEEK;

/** MET-minutes that count as a full day of aerobic work. */
export const CARDIO_TARGET_MET_MIN_PER_DAY = CARDIO_TARGET_MET_MIN_PER_WEEK / DAYS_PER_WEEK;

export interface GoalSide {
  /** What today has actually earned, in that side's own unit. */
  done: number;
  /** A seventh of the weekly guideline. */
  target: number;
  /** How much is still owed. Zero once the target is met — never negative. */
  remaining: number;
  /**
   * Progress as a fraction of the target, CLAMPED to 1 for drawing an arc.
   * Use `overshoot` to tell "just finished" from "doubled it".
   */
  fraction: number;
  /** True once done >= target. */
  met: boolean;
  /** Unclamped progress, so a big day can still be reported honestly in text. */
  overshoot: number;
}

export interface DailyGoal {
  strength: GoalSide;
  cardio: GoalSide;
  /** Both sides met. The only state the UI congratulates. */
  complete: boolean;
  /** Neither side has anything logged — the "nothing yet today" opening state. */
  empty: boolean;
}

export function buildDailyGoal(input: {
  /** Today's effective sets, already scaled by (1 - cardioBias) upstream. */
  effectiveSets: number;
  /** Today's MET-minutes from logged entries. */
  metMinutes: number;
  /**
   * MET-minutes credited to today's step count, after the baseline and the
   * de-duplication against logged foot-based cardio. Counted here because the
   * balance marker counts it, and a day view that disagreed with the stats page
   * about whether a 14,000-step day was cardio would be the app arguing with
   * itself.
   */
  stepMetMinutes?: number;
}): DailyGoal {
  const strength = side(input.effectiveSets, STRENGTH_TARGET_PER_DAY);
  const cardio = side(
    input.metMinutes + (input.stepMetMinutes ?? 0),
    CARDIO_TARGET_MET_MIN_PER_DAY,
  );

  return {
    strength,
    cardio,
    complete: strength.met && cardio.met,
    empty: strength.done <= 0 && cardio.done <= 0,
  };
}

function side(doneRaw: number, target: number): GoalSide {
  const done = Number.isFinite(doneRaw) && doneRaw > 0 ? doneRaw : 0;
  const overshoot = target > 0 ? done / target : 0;

  return {
    done: round(done),
    target: round(target),
    remaining: round(Math.max(0, target - done)),
    fraction: Math.min(1, Math.max(0, overshoot)),
    met: done >= target,
    overshoot: round(overshoot),
  };
}

/**
 * Effective sets one hard set of a compound movement generates.
 *
 * Not a new assumption: it is the figure STRENGTH_TARGET_EFFECTIVE_SETS_PER_WEEK
 * is itself calibrated against (a set credits 1.0 / 0.5 / 0.25 across the
 * muscles it trains). Named here because "3.4 effective sets to go" is a unit
 * nobody can act on at the top of the stairs, and "about 2 sets" is.
 */
export const EFFECTIVE_SETS_PER_HARD_SET = 2.2;

/**
 * What is left, in something a person can actually go and do.
 *
 * Both are rough on purpose and the UI says "about". The point is to turn a
 * quantity into an action, not to add a third measurement — the honest units
 * stay next to them.
 */
export function remainingHardSets(goal: DailyGoal): number {
  return Math.max(0, Math.round(goal.strength.remaining / EFFECTIVE_SETS_PER_HARD_SET));
}

/** Minutes of ordinary vigorous effort that would close the cardio gap. */
export function remainingCardioMinutes(goal: DailyGoal): number {
  return Math.max(0, Math.round(goal.cardio.remaining / FALLBACK_METS));
}

/**
 * One line of encouragement, chosen from what is actually left.
 *
 * Written to be true on a rest day as well as a good one: this is a nudge on a
 * training log, not a streak the user can fail. Nothing here scolds, and
 * nothing claims a shortfall is a problem.
 */
export function goalHeadline(goal: DailyGoal): string {
  if (goal.complete) return "Both targets met today";
  if (goal.empty) return "The whole day is still ahead";
  if (goal.strength.met) return "Strength done — cardio still open";
  if (goal.cardio.met) return "Cardio done — strength still open";
  return "Part way there";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
