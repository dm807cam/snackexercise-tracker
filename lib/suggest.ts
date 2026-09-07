/**
 * What to do next. Pure functions, no database access.
 *
 * Everything else in this app is retrospective: here is what you did, here is
 * what you have neglected. That is one inference short of useful when you are
 * standing at the top of the stairs with four minutes — the app knows which
 * muscle group has waited longest and which movement in the catalogue trains
 * it, and making the user do that join in their head is the app being lazy.
 *
 * Two things decide the answer, and they are deliberately not the same thing:
 *
 *   STALENESS — days since that axis was last trained. Dominant, because the
 *   whole premise of snack training is frequency, and because it is the number
 *   a person cannot hold in their head across twelve muscle groups.
 *
 *   DEFICIT — how thin that axis's weekly volume is against the best-served
 *   axis. Breaks the tie between two groups last trained the same day, and
 *   stops a group you touch daily with one stabiliser credit from looking
 *   permanently fine.
 *
 * Cardio competes as a thirteenth pseudo-axis on the same two terms, measured
 * against its own guideline, so a fortnight of lifting and no running produces
 * "go for a run" rather than a thirteenth way to say "back".
 *
 * The suggestion is a nudge, never a prescription. It has no idea what
 * equipment is to hand, what hurts today, or what the user is training for.
 * That is why it is one small bar with an alternative or two beside it, and why
 * nothing in the app is gated on following it.
 */

import { CARDIO_TARGET_MET_MIN_PER_WEEK } from "./cardio";
import { type AxisSlug, axisLabel } from "./muscles";
import type { AxisStat } from "./scoring";
import { DEFAULT_ACTIVE_WINDOW, TARGET_BOUTS, formatGap, type ActiveWindow } from "./spacing";

/** Days after which an axis is as stale as it is going to get, for scoring. */
const STALE_CAP = 10;

/** How much of the score is staleness rather than volume deficit. */
const STALENESS_WEIGHT = 0.6;

export interface SuggestionCandidate {
  /** null means cardio, which is not a muscle and has no radar spoke. */
  axis: AxisSlug | null;
  label: string;
  score: number;
  daysSince: number | null;
  perWeek: number;
}

export interface ExerciseChoice {
  id: string;
  name: string;
  slug: string;
  cardioBias: number;
  muscles: { muscle: string; weight: number }[];
}

export interface Suggestion {
  /** The pick, plus the two runners-up, so the bar is a nudge and not an order. */
  primary: SuggestionCandidate;
  alternatives: SuggestionCandidate[];
  /** A concrete movement from the catalogue, when one fits. */
  exercise: { id: string; name: string } | null;
  /** Why this one — shown verbatim, so the bar never asks to be trusted blindly. */
  reason: string;
  /** Timing nudge for today, from the spacing metric. Null when it has nothing to say. */
  nudge: string | null;
}

export function rankAxes(params: {
  axes: readonly AxisStat[];
  daysSinceCardio: number | null;
  /** From the balance breakdown; decides how thin the cardio side is. */
  cardioMetMinutesPerWeek: number;
}): SuggestionCandidate[] {
  const { axes, daysSinceCardio, cardioMetMinutesPerWeek } = params;

  // The busiest axis is the yardstick, not a fixed number: this asks "what is
  // falling behind the rest of your training", which is answerable for someone
  // training twice a week and someone training twice a day alike.
  const busiest = Math.max(0, ...axes.map((a) => a.perWeek));

  const candidates: SuggestionCandidate[] = axes.map((axis) => ({
    axis: axis.axis,
    label: axisLabel(axis.axis),
    daysSince: axis.daysSinceTrained,
    perWeek: axis.perWeek,
    score: scoreOf(
      axis.daysSinceTrained,
      busiest > 0 ? 1 - axis.perWeek / busiest : 1,
    ),
  }));

  candidates.push({
    axis: null,
    label: "Cardio",
    daysSince: daysSinceCardio,
    perWeek: cardioMetMinutesPerWeek,
    score: scoreOf(
      daysSinceCardio,
      1 - Math.min(1, Math.max(0, cardioMetMinutesPerWeek / CARDIO_TARGET_MET_MIN_PER_WEEK)),
    ),
  });

  return candidates.sort((a, b) =>
    b.score === a.score ? a.label.localeCompare(b.label) : b.score - a.score,
  );
}

function scoreOf(daysSince: number | null, deficit: number): number {
  // Never trained is the stalest thing there is, not a missing value.
  const staleness = Math.min(daysSince ?? STALE_CAP, STALE_CAP) / STALE_CAP;
  const clean = Number.isFinite(deficit) ? Math.min(1, Math.max(0, deficit)) : 1;
  return round3(STALENESS_WEIGHT * staleness + (1 - STALENESS_WEIGHT) * clean);
}

/**
 * The movement in the catalogue that best serves an axis.
 *
 * Ranked by how much of the axis it actually trains, then by how recently the
 * user chose it themselves. Recency is the tie-break rather than the lead
 * because a suggestion you already own is one you will act on, but a suggestion
 * that misses the point is worthless however familiar it is.
 */
export function chooseExercise(
  axis: AxisSlug | null,
  exercises: readonly ExerciseChoice[],
  recentIds: readonly string[],
  axisOf: (muscle: string) => AxisSlug | undefined,
): ExerciseChoice | null {
  const rank = new Map(recentIds.map((id, i) => [id, i]));

  const scored = exercises
    .map((exercise) => {
      if (axis === null) {
        // A cardio suggestion wants something unambiguously aerobic; a
        // kettlebell swing at bias 0.4 is not what "go and do some cardio"
        // means, even though it earns MET-minutes.
        return { exercise, weight: exercise.cardioBias >= 0.8 ? exercise.cardioBias : 0 };
      }

      // Pure cardio cannot be the answer to a strength deficit: its effective
      // sets are zeroed everywhere else, so suggesting it could never move the
      // number the suggestion is trying to move.
      if (exercise.cardioBias >= 1) return { exercise, weight: 0 };

      const weight = exercise.muscles.reduce(
        (sum, m) => (axisOf(m.muscle) === axis ? sum + m.weight : sum),
        0,
      );
      return { exercise, weight: weight * (1 - exercise.cardioBias) };
    })
    .filter((c) => c.weight > 0);

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    const ra = rank.get(a.exercise.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.exercise.id) ?? Number.MAX_SAFE_INTEGER;
    return ra === rb ? a.exercise.name.localeCompare(b.exercise.name) : ra - rb;
  });

  return scored[0].exercise;
}

export interface SpacingNow {
  /** Minutes since local midnight, now. */
  nowMin: number;
  /** Bout times so far today, minutes since local midnight. */
  boutMinutes: readonly number[];
  window?: ActiveWindow;
}

/**
 * The timing half of the bar: whether it is time for a snack at all.
 *
 * The threshold is the ideal spacing itself — the active window divided into
 * TARGET_BOUTS + 1 segments — so the nudge and the spacing score are the same
 * opinion stated twice, and cannot drift apart.
 */
export function spacingNudge(now: SpacingNow): string | null {
  const window = now.window ?? DEFAULT_ACTIVE_WINDOW;
  const startMin = window.startHour * 60;
  const endMin = window.endHour * 60;
  if (endMin <= startMin) return null;

  // Outside waking hours the app has no business asking for another set.
  if (now.nowMin < startMin || now.nowMin > endMin) return null;

  const idealGap = (endMin - startMin) / (TARGET_BOUTS + 1);
  const last = now.boutMinutes.length > 0 ? Math.max(...now.boutMinutes) : null;
  const since = now.nowMin - (last ?? startMin);

  if (since < idealGap) return null;

  return last === null
    ? "Nothing logged so far today"
    : `${formatGap(since)} since your last snack`;
}

export function buildSuggestion(params: {
  axes: readonly AxisStat[];
  daysSinceCardio: number | null;
  cardioMetMinutesPerWeek: number;
  exercises: readonly ExerciseChoice[];
  recentIds: readonly string[];
  axisOf: (muscle: string) => AxisSlug | undefined;
  now?: SpacingNow;
}): Suggestion {
  const ranked = rankAxes(params);
  const primary = ranked[0];
  const exercise = chooseExercise(primary.axis, params.exercises, params.recentIds, params.axisOf);

  return {
    primary,
    alternatives: ranked.slice(1, 3),
    exercise: exercise ? { id: exercise.id, name: exercise.name } : null,
    reason: reasonFor(primary),
    nudge: params.now ? spacingNudge(params.now) : null,
  };
}

function reasonFor(candidate: SuggestionCandidate): string {
  if (candidate.daysSince === null) return "not trained in the log yet";
  if (candidate.daysSince === 0) return "least volume this window";
  if (candidate.daysSince === 1) return "1 day since you trained it";
  return `${candidate.daysSince} days since you trained it`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
