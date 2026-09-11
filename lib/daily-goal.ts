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

import { FALLBACK_METS } from "./cardio";
import {
  GUIDELINE_FLOOR_MET_MIN_PER_WEEK,
  GUIDELINE_TARGETS,
  type Targets,
} from "./targets";

export const DAYS_PER_WEEK = 7;

/** A day's share of each weekly target. */
export function dailyTargets(targets: Targets = GUIDELINE_TARGETS) {
  return {
    strength: targets.strengthHardSetsPerWeek / DAYS_PER_WEEK,
    cardio: targets.cardioMetMinutesPerWeek / DAYS_PER_WEEK,
  };
}

/**
 * A day's share of the WHO aerobic minimum.
 *
 * Not the same thing as the target, once the target is configurable. Somebody
 * aiming at the mortality optimum has a cardio target of 1200 MET-min a week,
 * and passing 600 is still a real thing to have done — the ring marks it, and
 * the copy names it, so raising your sights does not erase the achievement of
 * meeting the guideline.
 */
export const CARDIO_GUIDELINE_FLOOR_PER_DAY =
  GUIDELINE_FLOOR_MET_MIN_PER_WEEK / DAYS_PER_WEEK;

/**
 * The most of a day's cardio ring that walking may fill.
 *
 * Half. Enough that a long walk is visibly worth something — which it is — and
 * never enough to close the ring on its own, so the ring goes on meaning
 * "training you did" rather than "distance you covered incidentally".
 *
 * Applied ONLY to the ring. The stats page's balance marker still counts every
 * credited step, because its question ("is my training cardio or strength")
 * genuinely wants the walking in it, at the discount the step weight applies.
 * The two views are not disagreeing about the number; they are answering
 * different questions, and the old code made them agree on the number while
 * disagreeing about the question.
 */
export const MAX_STEP_SHARE_OF_CARDIO_RING = 0.5;

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
  /** Past the WHO aerobic minimum, whatever the configured target is. */
  cardioGuidelineMet: boolean;
  /**
   * Where the guideline minimum sits on the cardio ring, 0..1. One when the
   * target is the guideline, which is when there is nothing extra to mark.
   */
  cardioGuidelineFraction: number;
  /**
   * True when today's walking earned more than the ring will take from it.
   * Said out loud rather than silently withheld — the credit is real, and the
   * stats page does count all of it.
   */
  stepsCapped: boolean;
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
   * de-duplication against logged foot-based cardio.
   *
   * CAPPED here, and nowhere else. The balance marker asks "is my training
   * cardio or strength", and for that question walking is activity that should
   * count at a discount — which is what the step weight already does. The ring
   * asks a different question: "is there anything left in me that I owe
   * today?". Answering "no" because the user walked to the shops is precisely
   * the failure the discount existed to avoid, reintroduced one layer up.
   *
   * At the old flat 3.5 METs and the default half weight, about 9,400 steps
   * closed the daily cardio ring on its own, with no cardio logged at all: the
   * ring said "Cardio done — strength still open" for ordinary ambulation.
   */
  stepMetMinutes?: number;
  /** The weekly doses to take a seventh of. Defaults to the guideline. */
  targets?: Targets;
}): DailyGoal {
  const perDay = dailyTargets(input.targets);

  // Walking contributes, and cannot finish the job alone.
  const stepCeiling = perDay.cardio * MAX_STEP_SHARE_OF_CARDIO_RING;
  const stepCredit = Math.min(input.stepMetMinutes ?? 0, stepCeiling);
  const stepsCapped = (input.stepMetMinutes ?? 0) > stepCeiling;

  const cardioDone = input.metMinutes + stepCredit;

  const strength = side(input.hardSets, perDay.strength);
  const cardio = side(cardioDone, perDay.cardio);

  return {
    strength,
    cardio,
    complete: strength.met && cardio.met,
    empty: strength.done <= 0 && cardio.done <= 0,
    // Two claims, deliberately not one. "You met the public-health guideline"
    // and "you met the goal you set" are different sentences, and collapsing
    // them meant a user aiming higher lost the first one entirely.
    // Compared on the raw figure, not on `cardio.done`, which is rounded to a
    // tenth for display: exactly the guideline share is 85.714 MET-minutes, and
    // 85.7 is not greater than or equal to it.
    cardioGuidelineMet: cardioDone >= CARDIO_GUIDELINE_FLOOR_PER_DAY,
    cardioGuidelineFraction:
      perDay.cardio > 0
        ? Math.min(1, CARDIO_GUIDELINE_FLOOR_PER_DAY / perDay.cardio)
        : 1,
    stepsCapped,
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
  // Worth saying on its own: someone aiming above the guideline has passed a
  // real threshold, and an open ring should not be the only thing they see.
  if (goal.cardioGuidelineMet && goal.cardioGuidelineFraction < 1) {
    return "Past the activity guideline — still short of your target";
  }
  return "Part way there";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
