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
 * ~27 hard sets and 600 MET-minutes become ~3.9 sets and ~86 MET-minutes a day.
 * Derived from those constants rather than written out, so the day view, the
 * balance marker, the calendar and the radar cannot drift apart about what "on
 * target" means.
 *
 * HARD SETS, NOT EFFECTIVE SETS. Effective sets fan out across every muscle a
 * movement trains, so summing them into one number made the ring close four
 * times faster on deadlifts than on triceps extensions at identical effort.
 * The per-muscle vector is still the right measure for the body map and the
 * radar; a single scalar dose is not, so this side counts hard sets. It also
 * means the target no longer moves when the muscle weightings are edited in
 * Settings.
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
import { STRENGTH_TARGET_HARD_SETS_PER_WEEK } from "./balance";

export const DAYS_PER_WEEK = 7;

/** Hard sets that count as a full day of resistance work. */
export const STRENGTH_TARGET_PER_DAY = STRENGTH_TARGET_HARD_SETS_PER_WEEK / DAYS_PER_WEEK;

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
  /**
   * Today's hard sets — sets scaled by how aerobic the movement is and how
   * close to failure they were, but NOT by how many muscles each one fans out
   * across. See lib/scoring.ts's `entryHardSets`.
   */
  hardSets: number;
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
  const strength = side(input.hardSets, STRENGTH_TARGET_PER_DAY);
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

  // `met` follows the ROUNDED remainder, not the raw one, so the three things
  // the UI shows can never contradict each other. Deciding it on the unrounded
  // values meant a day 0.04 sets short displayed "0 sets to go" beside an
  // unticked label and an unclosed ring — three statements, two of them wrong.
  // Calling 99.8% of a rough guideline "met" is the cheaper error.
  const remaining = round(Math.max(0, target - done));
  const met = remaining <= 0;

  return {
    done: round(done),
    target: round(target),
    remaining,
    fraction: met ? 1 : Math.min(1, Math.max(0, overshoot)),
    met,
    overshoot: round(overshoot),
  };
}

/**
 * Minutes of ordinary vigorous effort that would close the cardio gap.
 *
 * The strength side no longer needs a companion to this. It used to divide the
 * remainder by an assumed 2.2 effective sets per hard set to turn it into
 * something actionable, which was right on average and wrong by a factor of two
 * in both directions for real movements — "about 3 more sets" after a deadlift
 * session meant about 1, and after arm work about 6. Now that the target is
 * itself in hard sets, the remainder already is the answer.
 */
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
