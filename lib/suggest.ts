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
 *   DEFICIT — how thin that axis's weekly volume is against WHAT IT NEEDS, from
 *   the per-muscle hypertrophy target in lib/volume.ts. Breaks the tie between
 *   two groups last trained the same day, and stops a group you touch daily
 *   with one stabiliser credit from looking permanently fine.
 *
 * The deficit used to be measured against the user's own busiest axis, which
 * was answerable for anyone but meant nothing: train everything equally badly
 * and every axis scored a deficit of zero, because each one matched the
 * yardstick. Train chest hard and hamstrings well, and hamstrings still read as
 * badly deficient, because the yardstick was chest rather than what hamstrings
 * need. An absolute reference answers both cases.
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

import { GUIDELINE_TARGETS } from "./targets";
import { type AxisSlug, axisLabel } from "./muscles";
import type { AxisStat } from "./scoring";
import {
  DEFAULT_ACTIVE_WINDOW,
  formatGap,
  normaliseTargetBouts,
  type ActiveWindow,
} from "./spacing";
import { volumeDeficit } from "./volume";

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
  /** What that axis should be getting per week — its own target, not a rival's. */
  target: number;
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
  /**
   * The movement this one replaced, when the pick was upgraded because the
   * obvious choice has stopped progressing. Shown so the bar explains itself
   * rather than quietly proposing something harder than what was asked for.
   */
  progressedFrom: string | null;
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
  /** The configured weekly cardio dose. Defaults to the guideline. */
  cardioTargetMetMinutesPerWeek?: number;
}): SuggestionCandidate[] {
  const {
    axes,
    daysSinceCardio,
    cardioMetMinutesPerWeek,
    cardioTargetMetMinutesPerWeek = GUIDELINE_TARGETS.cardioMetMinutesPerWeek,
  } = params;

  const candidates: SuggestionCandidate[] = axes.map((axis) => ({
    axis: axis.axis,
    label: axisLabel(axis.axis),
    daysSince: axis.daysSinceTrained,
    perWeek: axis.perWeek,
    target: axis.targetPerWeek,
    score: scoreOf(axis.daysSinceTrained, volumeDeficit(axis.perWeek, axis.targetPerWeek)),
  }));

  // Cardio was always scored this way — against its own guideline rather than
  // against the other axes. The strength side has simply caught up.
  candidates.push({
    axis: null,
    label: "Cardio",
    daysSince: daysSinceCardio,
    perWeek: cardioMetMinutesPerWeek,
    target: cardioTargetMetMinutesPerWeek,
    score: scoreOf(
      daysSinceCardio,
      volumeDeficit(cardioMetMinutesPerWeek, cardioTargetMetMinutesPerWeek),
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
  /** The user's configured bouts-a-day target; the default when unset. */
  targetBouts?: number;
}

/**
 * The timing half of the bar: whether it is time for a snack at all.
 *
 * The threshold is the ideal spacing itself — the active window divided into
 * targetBouts + 1 segments — so the nudge and the spacing score are the same
 * opinion stated twice, and cannot drift apart. That includes the target
 * itself: raise it in Settings and the nudge speaks up sooner, because the day
 * it is now being scored against is broken up more often.
 */
export function spacingNudge(now: SpacingNow): string | null {
  const window = now.window ?? DEFAULT_ACTIVE_WINDOW;
  const startMin = window.startHour * 60;
  const endMin = window.endHour * 60;
  if (endMin <= startMin) return null;

  // Outside waking hours the app has no business asking for another set.
  if (now.nowMin < startMin || now.nowMin > endMin) return null;

  const idealGap = (endMin - startMin) / (normaliseTargetBouts(now.targetBouts) + 1);
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
  cardioTargetMetMinutesPerWeek?: number;
  exercises: readonly ExerciseChoice[];
  recentIds: readonly string[];
  axisOf: (muscle: string) => AxisSlug | undefined;
  now?: SpacingNow;
  /** Per-movement progression, so a stalled pick can be upgraded. */
  progress?: readonly StalledMovement[];
}): Suggestion {
  const ranked = rankAxes(params);
  const primary = ranked[0];
  const chosen = chooseExercise(primary.axis, params.exercises, params.recentIds, params.axisOf);

  const upgraded = progressionUpgrade(
    primary.axis,
    chosen,
    params.exercises,
    params.progress ?? [],
    params.axisOf,
  );
  const exercise = upgraded ?? chosen;

  return {
    primary,
    alternatives: ranked.slice(1, 3),
    exercise: exercise ? { id: exercise.id, name: exercise.name } : null,
    progressedFrom: upgraded && chosen ? chosen.name : null,
    reason: upgraded && chosen ? `${chosen.name} has not moved in weeks` : reasonFor(primary),
    nudge: params.now ? spacingNudge(params.now) : null,
  };
}

/** The subset of a movement's progression this module needs. */
export interface StalledMovement {
  exerciseId: string;
  stalled: boolean;
  /** Catalogue slug of the next rung, when there is one. */
  nextStep: string | null;
}

/**
 * How much of the chosen movement's service to the ranked axis the rung above
 * has to retain.
 *
 * A ladder climbs in difficulty, and difficulty often comes from shifting
 * emphasis: a push-up is chest 1.0 and a diamond push-up chest 0.5, which is
 * still unambiguously a chest movement. A dead hang is forearms 1.0 and a
 * pull-up forearms 0.25, which is not — upgrading there would answer a forearms
 * deficit with a back movement while the bar went on naming forearms. Half is
 * the line between the two.
 */
const UPGRADE_AXIS_RETENTION = 0.5;

/**
 * Swap a stalled pick for the next rung up the ladder.
 *
 * The case this exists for: a fixed-load movement cannot progress by adding
 * weight, so "do push-ups again" is the wrong suggestion for someone who has
 * done 3 x 10 push-ups every week for two months. The next variation is the
 * progression, and the catalogue already contains the ladder — it just was not
 * written down anywhere until lib/progression.ts.
 *
 * Conservative on purpose. It fires only when the movement is actually stalled,
 * only when the rung above is in the user's own catalogue, only when that rung
 * still serves the axis the suggestion is about, and the bar says what it did
 * and why — a suggestion that silently proposes something harder than what was
 * asked for is the app overreaching.
 */
function progressionUpgrade(
  axis: AxisSlug | null,
  chosen: ExerciseChoice | null,
  exercises: readonly ExerciseChoice[],
  progress: readonly StalledMovement[],
  axisOf: (muscle: string) => AxisSlug | undefined,
): ExerciseChoice | null {
  // Cardio has no ladder, and "the axis" is not a muscle group there anyway.
  if (!chosen || axis === null) return null;

  const stall = progress.find((p) => p.exerciseId === chosen.id);
  if (!stall?.stalled || !stall.nextStep) return null;

  const rung = exercises.find((e) => e.slug === stall.nextStep);
  if (!rung) return null;

  const serves = (exercise: ExerciseChoice) =>
    exercise.muscles.reduce((sum, m) => (axisOf(m.muscle) === axis ? sum + m.weight : sum), 0);

  return serves(rung) >= serves(chosen) * UPGRADE_AXIS_RETENTION ? rung : null;
}

function reasonFor(candidate: SuggestionCandidate): string {
  if (candidate.daysSince === null) return "not trained in the log yet";
  if (candidate.daysSince === 1) return "1 day since you trained it";
  if (candidate.daysSince > 1) return `${candidate.daysSince} days since you trained it`;

  // Trained today, and still the pick — which now means a real shortfall
  // against its own target rather than merely less than some other axis. The
  // old wording, "least volume this window", was true of something on every
  // possible log, including one where everything was already on target.
  return volumeDeficit(candidate.perWeek, candidate.target) > 0
    ? "below its weekly volume target"
    : "trained today, and on target";
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
