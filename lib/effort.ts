/**
 * How close a set was to failure. Pure functions, no database access, same
 * discipline as lib/scoring.ts and lib/cardio.ts.
 *
 * Effective sets were counting every set the same. Ten comfortable push-ups and
 * a set of push-ups taken to the point where the next rep will not happen are
 * not the same stimulus, and the convention the app names — "effective sets" —
 * is in the literature a count of HARD SETS, conventionally a set taken to
 * within roughly 0-5 reps of failure (Baz-Valle et al. 2022, J Hum Kinet). The
 * hypertrophic effect scales with proximity to failure, particularly when the
 * load is submaximal (Refalo et al. 2023, J Sports Sci).
 *
 * Rep range, notably, is NOT the variable that gates this: 5 to 30+ reps grow
 * muscle about equally when the sets are taken near failure (Schoenfeld et al.
 * 2021, J Strength Cond Res). So the app goes on treating reps as optional and
 * asks instead about the one variable that does gate the stimulus.
 *
 * THREE LEVELS, NOT AN RIR NUMBER. "Easy / hard / to failure" is one tap on the
 * way back upstairs. An RIR spinner is a number to think about, and a number to
 * think about is a set that does not get logged.
 */

export const EFFORT_LEVELS = ["easy", "hard", "failure"] as const;

export type Effort = (typeof EFFORT_LEVELS)[number];

export function isEffort(value: unknown): value is Effort {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * What an unlabelled set is worth.
 *
 * One, i.e. the same as `hard` — and the choice is deliberate rather than
 * convenient. Every set logged before this field existed is unlabelled, so any
 * other value would silently restate the user's whole history: a year of
 * training would lose a third of its volume overnight, the radar would shrink,
 * and "needs attention" would fill with groups that were trained perfectly
 * well. A metric that changes meaning retroactively is worse than one that is
 * slightly generous.
 *
 * The honesty comes from saying so instead: `effortBreakdown` reports how much
 * of the volume actually carries a label, and the stats page shows it, so the
 * assumption is visible rather than buried in this constant.
 */
export const UNLABELLED_EFFORT_MULTIPLIER = 1;

/**
 * Effective-set credit for one set at each effort level.
 *
 * `easy` at 0.4 rather than 0: a set well short of failure is a diminished
 * stimulus, not the absence of one, and zeroing it would make the app claim a
 * rep range it cannot observe produced nothing at all.
 *
 * `failure` at 1.05 rather than 1.3: past a couple of reps in reserve the
 * hypertrophy curve is close to flat, while the fatigue cost keeps climbing.
 * Paying much more for going to failure would have the app recommending a way
 * of training that buys little and costs recovery.
 */
const MULTIPLIER: Record<Effort, number> = {
  easy: 0.4,
  hard: 1,
  failure: 1.05,
};

export function effortMultiplier(effort: string | null | undefined): number {
  return isEffort(effort) ? MULTIPLIER[effort] : UNLABELLED_EFFORT_MULTIPLIER;
}

/** Counts as a hard set in the literature's sense — near enough to failure. */
export function isHardSet(effort: string | null | undefined): boolean {
  return effort === "hard" || effort === "failure";
}

export function effortLabel(effort: string | null | undefined): string {
  if (effort === "easy") return "Easy";
  if (effort === "hard") return "Hard";
  if (effort === "failure") return "To failure";
  return "Not recorded";
}

/** The one-line explanation each chip carries, in reps-in-reserve terms. */
export function effortHint(effort: Effort): string {
  if (effort === "easy") return "Could have done 5 or more more";
  if (effort === "hard") return "2 or 3 left in the tank";
  return "The next rep was not happening";
}

export interface EffortBreakdown {
  /** Sets carrying any label. */
  labelled: number;
  /** Sets carrying none — counted as hard, see UNLABELLED_EFFORT_MULTIPLIER. */
  unlabelled: number;
  easy: number;
  hard: number;
  failure: number;
  /** Labelled share of all sets, 0..1. Zero when nothing was logged at all. */
  labelledFraction: number;
}

/**
 * How much of a window's volume the user actually rated.
 *
 * The number that keeps `UNLABELLED_EFFORT_MULTIPLIER` honest: if 90% of sets
 * are unlabelled then the strength side of the app is still, in effect, taking
 * the user's word that every set was hard, and the page should say so.
 *
 * Pure cardio is skipped, the same way it is skipped everywhere effective sets
 * are counted — a run has no proximity to failure worth recording, and
 * including it would make the labelled fraction look worse the more you ran.
 */
export function effortBreakdown(
  entries: readonly {
    sets: number;
    effort?: string | null;
    exercise: { cardioBias?: number };
  }[],
): EffortBreakdown {
  const counts = { easy: 0, hard: 0, failure: 0 };
  let labelled = 0;
  let unlabelled = 0;

  for (const entry of entries) {
    if ((entry.exercise.cardioBias ?? 0) >= 1) continue;

    const sets = entry.sets > 0 ? entry.sets : 1;
    if (isEffort(entry.effort)) {
      counts[entry.effort] += sets;
      labelled += sets;
    } else {
      unlabelled += sets;
    }
  }

  const total = labelled + unlabelled;
  return {
    labelled,
    unlabelled,
    ...counts,
    labelledFraction: total > 0 ? Math.round((labelled / total) * 1000) / 1000 : 0,
  };
}
