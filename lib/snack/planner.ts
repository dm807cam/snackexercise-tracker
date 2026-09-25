/**
 * The snack planner: what to do, right now, here, in the minutes you have.
 * Pure functions, no database access — lib/snack/service.ts gathers the inputs.
 *
 * lib/suggest.ts answers "which muscle group has waited longest", and stops
 * there. That is one step short of useful to someone standing in a hotel room
 * with four minutes before a call. This goes the rest of the way: a concrete
 * session of one to four movements, dosed for this person, that fits the place
 * and the time, with every choice explained.
 *
 * FIVE SIGNALS, combined multiplicatively into one utility per movement:
 *
 *   NEED       per muscle group, from `rankAxes` — staleness first, weekly
 *              deficit second — so the planner and the suggestion bar cannot
 *              disagree about what is overdue. Cardio competes as a need of its
 *              own on the same scale.
 *   READINESS  per muscle, from recent work (lib/snack/readiness.ts): need is a
 *              weekly question, readiness is an hourly one.
 *   TODAY      the day's rings (lib/daily-goal.ts): a side whose ring is closed
 *              still counts, at about a third.
 *   PLACE      a hard filter, not a weight (lib/snack/profile.ts): no kit, no
 *              floor, too loud, too sweaty — then not here.
 *   HABIT      the user's own record with each movement (lib/snack/
 *              preference.ts), sampled, plus a little variety pressure so the
 *              same movement is not proposed three times before lunch.
 *
 * COMPOSITION is greedy with diminishing returns — the standard approximation
 * for coverage problems, and the one that makes a two- or three-movement snack
 * come out as a push, a pull and a leg movement without any rule saying so:
 * choosing push-ups mostly satisfies chest, so the next pick goes elsewhere.
 *
 * The result is a proposal. It shows its reasoning block by block, any block
 * can be swapped, and nothing anywhere is gated on doing what it says.
 */

import { axisForMuscle, axisLabel, type AxisSlug } from "../muscles";
import { rankAxes, type AxisNeedStat, type SuggestionCandidate } from "../suggest";
import { volumeDeficit } from "../volume";
import { FALLBACK_METS } from "../cardio";
import { chosenEquipment } from "./equipment";
import { fitsContext, loadAvailable, type ContextCaps, type SnackProfile } from "./profile";
import { cardioReadiness, muscleFatigue, muscleReadiness, type RecentWork } from "./readiness";
import { preferenceFactor, type PreferenceStats } from "./preference";
import { prescribe, type LastPerformance } from "./dose";
import { seededRandom } from "./random";
import { PLAN_VERSION, type SnackBlock, type SnackFormat, type SnackPlan } from "./types";

export interface PlannerExercise {
  id: string;
  name: string;
  slug: string;
  cardioBias: number;
  mets: number | null;
  muscles: readonly { muscle: string; weight: number }[];
  profile: SnackProfile;
}

export type FocusRequest = "auto" | "strength" | "cardio";

export interface PlannerInput {
  nowMs: number;
  /** The user's today, "YYYY-MM-DD" in their zone. */
  today: string;
  minutes: number;
  focus?: FocusRequest;
  caps: ContextCaps;
  contextName?: string | null;
  exercises: readonly PlannerExercise[];
  needs: {
    axes: readonly AxisNeedStat[];
    daysSinceCardio: number | null;
    cardioMetMinutesPerWeek: number;
    cardioTargetMetMinutesPerWeek: number;
  };
  /** What today's rings still ask for, in their own units. */
  rings: {
    strengthRemaining: number;
    strengthTarget: number;
    cardioRemaining: number;
    cardioTarget: number;
  };
  recent: readonly (RecentWork & { exerciseId: string; localDate: string })[];
  history: ReadonlyMap<string, LastPerformance>;
  preferences: ReadonlyMap<string, PreferenceStats>;
  /** Stalled movements, by exercise id, with the next rungs up their ladder. */
  stalled: ReadonlyMap<string, readonly string[]>;
  /** Never propose these — the ones already swapped away, or already in the plan. */
  exclude?: ReadonlySet<string>;
  seed: number;
  /** Sample preferences (the default), or use their settled means. */
  explore?: boolean;
}

/**
 * How much each group's need counts toward what scarce minutes are spent on.
 *
 * Every group is tracked equally everywhere else in the app, and should be: a
 * neglected neck is still worth seeing. But when there are two minutes, the
 * minutes should go to the big multi-joint groups first — the ACSM position on
 * resistance training for healthy adults (Garber et al. 2011; Ratamess et al.
 * 2009) — so a nine-day-old gap in neck work does not beat a five-day-old gap
 * in hamstrings to the only slot there is. Small groups still win when they
 * are the only thing overdue.
 */
export const AXIS_PRIORITY: Record<AxisSlug, number> = {
  chest: 1,
  back: 1,
  quads: 1,
  hamstrings: 1,
  glutes: 1,
  shoulders: 0.9,
  core: 0.9,
  biceps: 0.75,
  triceps: 0.75,
  calves: 0.7,
  forearms: 0.65,
  "traps-neck": 0.65,
};

/** A closed ring still counts, at about a third: coverage matters on a good day too. */
const CLOSED_RING_WEIGHT = 0.35;
/** How much of a group's need one pick satisfies, per unit of muscle weight. */
const SATISFACTION = 0.8;
const SEC_PER_REP = 3;
const SET_SETUP_SEC = 5;
const TRANSITION_SEC = 15;
/**
 * A movement must serve SOMETHING to take a slot. Deliberately tiny rather than
 * a quality bar: on a day when every group is on target the planner should
 * still propose a maintenance snack, not report that nothing fits.
 */
const MIN_UTILITY = 1e-6;
/** Cardio must be at least this far behind the most overdue strength group to take a whole snack. */
const CARDIO_TAKEOVER = 1;
/** And within this fraction of it to earn a finisher in a mixed snack. */
const MIXED_THRESHOLD = 0.75;
/** Estimates are estimates: a plan may run this much over its budget. */
const BUDGET_SLACK = 1.05;

export const MIN_SNACK_MINUTES = 1;
export const MAX_SNACK_MINUTES = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function remainingFraction(remaining: number, target: number): number {
  return target > 0 ? clamp(remaining / target, 0, 1) : 0;
}

function intensityOf(exercise: PlannerExercise): number {
  return clamp((exercise.mets ?? FALLBACK_METS) / 8, 0.4, 1.25);
}

/** A movement's natural bout, in seconds. */
function boutOf(exercise: PlannerExercise): number {
  return exercise.profile.dose.kind === "time" ? exercise.profile.dose.seconds : 45;
}

/**
 * Vigorous and short: done as work periods, every minute on the minute.
 * Anything with a longer natural bout — a run, a row, a bike — goes steady.
 */
function isInterval(exercise: PlannerExercise): boolean {
  return (exercise.mets ?? FALLBACK_METS) >= 7 && boutOf(exercise) <= 60;
}

/**
 * How well a cardio movement suits the minutes there are. A run whose natural
 * bout is ten minutes is a poor use of two; the stairs are a good one.
 */
function boutFit(exercise: PlannerExercise, budgetSec: number): number {
  if (isInterval(exercise)) return 1;
  return Math.sqrt(Math.min(1, budgetSec / boutOf(exercise)));
}

function isCardioMovement(exercise: { cardioBias: number }): boolean {
  return exercise.cardioBias >= 0.5;
}

/** "6 days since you trained it", "below its weekly target", ... */
function needReason(candidate: SuggestionCandidate): string {
  if (candidate.axis === null) {
    if (candidate.daysSince === null) return "no cardio in the log yet";
    if (candidate.daysSince >= 2) return `${candidate.daysSince} days since any cardio`;
    return volumeDeficit(candidate.perWeek, candidate.target) > 0
      ? "cardio is behind its weekly target"
      : "keeping the cardio going";
  }
  if (candidate.daysSince === null) return "not trained in the log yet";
  if (candidate.daysSince === 1) return "1 day since you trained it";
  if (candidate.daysSince > 1) return `${candidate.daysSince} days since you trained it`;
  return volumeDeficit(candidate.perWeek, candidate.target) > 0
    ? "below its weekly target"
    : "trained today, and on target";
}

interface Scored {
  exercise: PlannerExercise;
  utility: number;
  /** The group it was chosen for: its largest weighted contribution. */
  axis: AxisSlug | null;
}

export interface PlannerState {
  input: PlannerInput;
  feasible: PlannerExercise[];
  needByAxis: Map<AxisSlug, number>;
  cardioNeed: number;
  candidateByAxis: Map<AxisSlug, SuggestionCandidate>;
  cardioCandidate: SuggestionCandidate;
  strengthWeightToday: number;
  cardioWeightToday: number;
  fatigue: Map<string, number>;
  cardioReady: number;
  factor: Map<string, number>;
}

/**
 * Everything the choices depend on, computed once. Exported so swapping one
 * block can re-use exactly the state the plan was made from.
 */
export function plannerState(input: PlannerInput): PlannerState {
  const random = seededRandom(input.seed);
  const focus = input.focus ?? "auto";

  const ranked = rankAxes({
    axes: input.needs.axes,
    daysSinceCardio: input.needs.daysSinceCardio,
    cardioMetMinutesPerWeek: input.needs.cardioMetMinutesPerWeek,
    cardioTargetMetMinutesPerWeek: input.needs.cardioTargetMetMinutesPerWeek,
  });
  const candidateByAxis = new Map<AxisSlug, SuggestionCandidate>();
  let cardioCandidate: SuggestionCandidate | undefined;
  for (const candidate of ranked) {
    if (candidate.axis === null) cardioCandidate = candidate;
    else candidateByAxis.set(candidate.axis, candidate);
  }

  const strengthToday =
    CLOSED_RING_WEIGHT +
    (1 - CLOSED_RING_WEIGHT) * remainingFraction(input.rings.strengthRemaining, input.rings.strengthTarget);
  const cardioToday =
    CLOSED_RING_WEIGHT +
    (1 - CLOSED_RING_WEIGHT) * remainingFraction(input.rings.cardioRemaining, input.rings.cardioTarget);

  const exclude = input.exclude ?? new Set<string>();
  const feasible = input.exercises
    .filter((e) => !exclude.has(e.id))
    .filter((e) => !input.preferences.get(e.id)?.blocked)
    .filter((e) => fitsContext(e.profile, input.caps))
    .filter((e) => e.muscles.length > 0 || isCardioMovement(e));

  // One Thompson draw per movement, in a stable order, so the same inputs give
  // the same plan however the catalogue happened to be sorted.
  const factor = new Map<string, number>();
  const lastDone = new Map<string, number>();
  const doneToday = new Set<string>();
  for (const work of input.recent) {
    lastDone.set(work.exerciseId, Math.max(lastDone.get(work.exerciseId) ?? 0, work.performedAtMs));
    if (work.localDate === input.today) doneToday.add(work.exerciseId);
  }
  for (const exercise of [...feasible].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let variety = 1;
    const last = lastDone.get(exercise.id);
    if (last !== undefined && input.nowMs - last < 3 * 3_600_000) variety = 0.5;
    else if (doneToday.has(exercise.id)) variety = 0.8;
    // A movement the user already knows is one they will actually do.
    const familiar = input.history.has(exercise.id) ? 1.1 : 1;
    const habit = preferenceFactor(input.preferences.get(exercise.id), random, input.explore ?? true);
    factor.set(exercise.id, habit * variety * familiar);
  }

  return {
    input,
    feasible,
    needByAxis: new Map([...candidateByAxis].map(([axis, c]) => [axis, c.score * AXIS_PRIORITY[axis]])),
    cardioNeed: cardioCandidate?.score ?? 0,
    candidateByAxis,
    cardioCandidate: cardioCandidate ?? {
      axis: null, label: "Cardio", score: 0, daysSince: null, perWeek: 0, target: 1,
    },
    strengthWeightToday: focus === "cardio" ? 0 : strengthToday,
    cardioWeightToday: focus === "strength" ? 0 : cardioToday,
    fatigue: muscleFatigue(input.recent, input.nowMs),
    cardioReady: cardioReadiness(input.recent, input.nowMs),
    factor,
  };
}

/** Utility of one movement given the current needs, and the group it serves most. */
function score(
  state: PlannerState,
  exercise: PlannerExercise,
  needs: ReadonlyMap<AxisSlug, number>,
  budgetSec: number = state.input.minutes * 60,
): Scored {
  const bias = clamp(exercise.cardioBias, 0, 1);

  let strength = 0;
  let axis: AxisSlug | null = null;
  if (bias < 1 && state.strengthWeightToday > 0) {
    const contribution = new Map<AxisSlug, number>();
    let weightSum = 0;
    for (const { muscle, weight } of exercise.muscles) {
      const group = axisForMuscle(muscle);
      if (!group) continue;
      weightSum += weight;
      const value = weight * (needs.get(group) ?? 0) * muscleReadiness(state.fatigue, muscle);
      contribution.set(group, (contribution.get(group) ?? 0) + value);
    }
    let sum = 0;
    let best = -1;
    for (const [group, value] of contribution) {
      sum += value;
      if (value > best) {
        best = value;
        axis = group;
      }
    }
    // Square-root damping: a compound movement serving four groups is worth
    // more than an isolation one, but not four times more.
    if (weightSum > 0) strength = ((1 - bias) * sum * state.strengthWeightToday) / Math.sqrt(Math.max(1, weightSum));
  }

  const cardio =
    bias > 0
      ? bias *
        state.cardioNeed *
        state.cardioReady *
        intensityOf(exercise) *
        boutFit(exercise, budgetSec) *
        state.cardioWeightToday
      : 0;

  const utility = (strength + cardio) * (state.factor.get(exercise.id) ?? 1);
  return { exercise, utility, axis: cardio > strength ? null : axis };
}

function best(scored: Scored[]): Scored | null {
  let top: Scored | null = null;
  for (const s of scored) {
    if (s.utility < MIN_UTILITY) continue;
    if (
      !top ||
      s.utility > top.utility + 1e-9 ||
      (Math.abs(s.utility - top.utility) <= 1e-9 && s.exercise.name.localeCompare(top.exercise.name) < 0)
    ) {
      top = s;
    }
  }
  return top;
}

/** Diminishing returns: what a pick has already covered is needed less by the next one. */
function satisfy(needs: Map<AxisSlug, number>, exercise: PlannerExercise) {
  const covered = new Map<AxisSlug, number>();
  for (const { muscle, weight } of exercise.muscles) {
    const group = axisForMuscle(muscle);
    if (group) covered.set(group, Math.max(covered.get(group) ?? 0, Math.min(1, weight)));
  }
  for (const [group, weight] of covered) {
    needs.set(group, (needs.get(group) ?? 0) * (1 - SATISFACTION * weight));
  }
}

/**
 * The stalled movement's next rung, if one fits here and still serves the same
 * group — the rule lib/suggest.ts applies, with the extra condition that the
 * rung has to be possible where the user is.
 */
function upgradeFor(state: PlannerState, picked: Scored, taken: ReadonlySet<string>): PlannerExercise | null {
  const rungs = state.input.stalled.get(picked.exercise.id);
  if (!rungs?.length || picked.axis === null) return null;
  const serves = (exercise: PlannerExercise) =>
    exercise.muscles.reduce((sum, m) => (axisForMuscle(m.muscle) === picked.axis ? sum + m.weight : sum), 0);
  for (const slug of rungs) {
    const rung = state.feasible.find((e) => e.slug === slug && !taken.has(e.id));
    if (rung && serves(rung) >= serves(picked.exercise) * 0.5) return rung;
  }
  return null;
}

function servesLabels(exercise: PlannerExercise): string[] {
  const byAxis = new Map<AxisSlug, number>();
  for (const { muscle, weight } of exercise.muscles) {
    const group = axisForMuscle(muscle);
    if (group) byAxis.set(group, (byAxis.get(group) ?? 0) + weight);
  }
  const strength = 1 - clamp(exercise.cardioBias, 0, 1);
  const labels = strength > 0
    ? [...byAxis]
        .filter(([, weight]) => weight * strength >= 0.5)
        .sort((a, b) => b[1] - a[1])
        .map(([group]) => axisLabel(group))
    : [];
  if (exercise.cardioBias > 0) labels.push("Cardio");
  return labels.slice(0, 4);
}

function whyFor(state: PlannerState, axis: AxisSlug | null): string {
  if (axis === null) {
    const ring = state.input.rings;
    const done = ring.cardioTarget > 0 ? Math.round((1 - remainingFraction(ring.cardioRemaining, ring.cardioTarget)) * 100) : 0;
    const reason = needReason(state.cardioCandidate);
    return done < 100 && state.cardioCandidate.daysSince !== null && state.cardioCandidate.daysSince < 2
      ? `Cardio · today's ring ${done}% done`
      : `Cardio · ${reason}`;
  }
  const candidate = state.candidateByAxis.get(axis);
  return candidate ? `${axisLabel(axis)} · ${needReason(candidate)}` : axisLabel(axis);
}

function strengthBlock(state: PlannerState, picked: Scored, taken: ReadonlySet<string>): SnackBlock {
  const upgraded = upgradeFor(state, picked, taken);
  const exercise = upgraded ?? picked.exercise;
  const { profile } = exercise;
  const loadHere = profile.load.length > 0 ? loadAvailable(profile, state.input.caps) : true;
  const dose = prescribe({
    dose: profile.dose,
    last: state.input.history.get(exercise.id),
    loadHere,
    today: state.input.today,
  });

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    role: "strength",
    axis: picked.axis,
    kind: dose.kind,
    sets: 1,
    reps: dose.reps,
    repRange: dose.repRange,
    seconds: dose.seconds,
    easySeconds: null,
    weightKg: dose.weightKg,
    unilateral: profile.unilateral,
    restSec: 0,
    cues: profile.cues,
    serves: servesLabels(exercise),
    why: upgraded
      ? `${picked.exercise.name} has stopped moving — the next step up`
      : whyFor(state, picked.axis),
    doseNote: upgraded ? "a harder variation: start at the bottom of the range" : dose.note,
    equipment: chosenEquipment(profile.requirements ?? [], state.input.caps.equipment),
    progressedFrom: upgraded ? picked.exercise.name : null,
    cardioBias: exercise.cardioBias,
    mets: exercise.mets,
  };
}

/**
 * A cardio block. Vigorous movements go EVERY MINUTE ON THE MINUTE — a work
 * period of up to 40 seconds and the rest of the minute easy — which is the
 * exercise-snack format itself (Jenkins 2019's stair climbs; Stamatakis 2022's
 * 1-2 minute vigorous bouts). Moderate ones go steady for the time available.
 */
function cardioBlock(state: PlannerState, exercise: PlannerExercise, seconds: number): SnackBlock {
  const { profile } = exercise;
  const vigorous = isInterval(exercise);
  const bout = boutOf(exercise);
  const minutes = Math.max(1, Math.floor(seconds / 60));
  // Work never runs past forty seconds: the minute needs room to recover in,
  // and on stairs the easy part is the walk back down.
  const work = vigorous ? clamp(bout, 20, 40) : null;

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    role: "cardio",
    axis: null,
    kind: profile.dose.kind === "reps" ? "reps" : "time",
    sets: vigorous ? minutes : 1,
    reps: profile.dose.kind === "reps" ? Math.round(profile.dose.low + (profile.dose.high - profile.dose.low) * 0.3) : null,
    repRange: profile.dose.kind === "reps" ? [profile.dose.low, profile.dose.high] : null,
    seconds: vigorous ? work : Math.max(60, Math.round(seconds / 30) * 30),
    easySeconds: vigorous ? 60 - (work ?? 45) : null,
    weightKg: null,
    unilateral: false,
    restSec: 0,
    cues: profile.cues,
    serves: servesLabels(exercise),
    why: whyFor(state, null),
    doseNote: vigorous
      ? `${work} seconds hard, then easy until the minute is up`
      : "steady: you can talk, but would rather not sing",
    equipment: chosenEquipment(profile.requirements ?? [], state.input.caps.equipment),
    progressedFrom: null,
    cardioBias: exercise.cardioBias,
    mets: exercise.mets,
  };
}

function setSeconds(block: SnackBlock): number {
  const sides = block.unilateral ? 2 : 1;
  if (block.kind === "time") return (block.seconds ?? 30) * sides + SET_SETUP_SEC;
  return (block.reps ?? 8) * SEC_PER_REP * sides + SET_SETUP_SEC;
}

/** Seconds a cardio block takes, easy periods included. */
function cardioSeconds(block: SnackBlock): number {
  if (block.easySeconds != null) return block.sets * ((block.seconds ?? 0) + block.easySeconds);
  if (block.kind === "reps") return block.sets * ((block.reps ?? 8) * SEC_PER_REP + SET_SETUP_SEC);
  return block.sets * (block.seconds ?? 60);
}

/**
 * Fit strength blocks into a time budget: as many rounds as fit, up to five.
 * One movement is straight sets with a minute's rest; several are a circuit,
 * which rests each muscle while another works — the efficient shape when
 * minutes are what is short.
 */
function fitStrength(blocks: SnackBlock[], budgetSec: number) {
  let chosen = [...blocks];
  for (;;) {
    const single = chosen.length === 1;
    const roundRest = single
      ? budgetSec <= 120 ? 30 : budgetSec <= 180 ? 40 : 60
      : budgetSec <= 300 ? 30 : 45;
    const room = budgetSec * BUDGET_SLACK;
    const roundSec =
      chosen.reduce((sum, block) => sum + setSeconds(block), 0) + (chosen.length - 1) * TRANSITION_SEC;

    let rounds = 0;
    for (let r = 1; r <= 5; r += 1) {
      if (r * roundSec + (r - 1) * roundRest <= room) rounds = r;
    }
    if (rounds > 0 || chosen.length === 1) {
      const fitted = rounds > 0 ? rounds : 1;
      // A single movement too long even once: shorten the set instead.
      if (rounds === 0) {
        const block = chosen[0];
        const sides = block.unilateral ? 2 : 1;
        const room = Math.max(10, budgetSec - SET_SETUP_SEC);
        if (block.kind === "time") block.seconds = Math.max(10, Math.floor(room / sides / 5) * 5);
        else block.reps = Math.max(1, Math.floor(room / sides / SEC_PER_REP));
      }
      for (const block of chosen) block.restSec = single ? roundRest : TRANSITION_SEC;
      const estimate = fitted * (chosen.reduce((s, b) => s + setSeconds(b), 0) + (chosen.length - 1) * TRANSITION_SEC) + (fitted - 1) * roundRest;
      return { blocks: chosen, rounds: fitted, roundRestSec: roundRest, estimatedSec: estimate };
    }
    chosen = chosen.slice(0, -1);
  }
}

function expectedOf(blocks: SnackBlock[], rounds: number, finisher: SnackBlock | null) {
  let hardSets = 0;
  let metMinutes = 0;
  const add = (block: SnackBlock, times: number) => {
    const bias = clamp(block.cardioBias, 0, 1);
    const sets = block.sets * times;
    hardSets += sets * (1 - bias);
    if (bias > 0) {
      const sides = block.unilateral ? 2 : 1;
      const workSec =
        block.kind === "time"
          ? (block.seconds ?? 0) * sides * sets
          : Math.min((block.reps ?? 8) * SEC_PER_REP, 600) * sides * sets;
      metMinutes += (workSec / 60) * (block.mets ?? FALLBACK_METS) * bias;
    }
  };
  for (const block of blocks) add(block, block.role === "cardio" ? 1 : rounds);
  if (finisher) add(finisher, 1);
  return { hardSets: round1(hardSets), metMinutes: Math.round(metMinutes) };
}

function emptyPlan(input: PlannerInput, minutes: number, message: string): SnackPlan {
  return {
    version: PLAN_VERSION,
    minutes,
    focus: "strength",
    format: "single",
    rounds: 0,
    roundRestSec: 0,
    blocks: [],
    finisher: null,
    estimatedSec: 0,
    headline: "Nothing fits here",
    reason: message,
    expected: { hardSets: 0, metMinutes: 0 },
    contextName: input.contextName ?? null,
    empty: message,
  };
}

function headlineOf(focus: SnackPlan["focus"], blocks: SnackBlock[], finisher: SnackBlock | null, minutes: number): string {
  const groups = [...new Set(blocks.filter((b) => b.axis).map((b) => axisLabel(b.axis!)))];
  const time = `${minutes} min`;
  if (focus === "cardio" || (blocks.length === 1 && !finisher)) return `${blocks[0].name} · ${time}`;
  const named = groups.length > 0 ? groups.slice(0, 2).join(" & ") : blocks.map((b) => b.name).slice(0, 2).join(" & ");
  return finisher ? `${named} + ${finisher.name.toLowerCase()} · ${time}` : `${named} · ${time}`;
}

/**
 * How many strength movements a snack of this length holds.
 *
 * Calibrated on the time model below rather than guessed: three minutes holds
 * one movement for three sets better than two movements once each; five holds
 * two movements twice; six holds three movements twice. A mixed snack gives a
 * minute or two to its cardio finisher, so it holds one fewer.
 */
export function movementCount(minutes: number, mixed: boolean): number {
  if (mixed) return minutes <= 6 ? 1 : minutes <= 9 ? 2 : 3;
  if (minutes <= 3) return 1;
  if (minutes <= 5) return 2;
  if (minutes <= 9) return 3;
  return 4;
}

/**
 * The strongest need, among the groups some movement here trains as a primary
 * or secondary mover, weighted by readiness and by today's ring.
 */
function mostOverdueHere(state: PlannerState, pool: readonly PlannerExercise[]): number {
  let top = 0;
  for (const exercise of pool) {
    const strength = 1 - clamp(exercise.cardioBias, 0, 1);
    for (const { muscle, weight } of exercise.muscles) {
      const group = axisForMuscle(muscle);
      if (!group || weight * strength < 0.5) continue;
      const need = (state.needByAxis.get(group) ?? 0) * muscleReadiness(state.fatigue, muscle);
      if (need > top) top = need;
    }
  }
  return top * state.strengthWeightToday;
}

/** Plan one snack. */
export function planSnack(input: PlannerInput): SnackPlan {
  const minutes = clamp(Math.round(input.minutes), MIN_SNACK_MINUTES, MAX_SNACK_MINUTES);
  const budgetSec = minutes * 60;
  const state = plannerState(input);
  const focus = input.focus ?? "auto";

  const needs = new Map(state.needByAxis);
  const strengthPool = state.feasible.filter((e) => !isCardioMovement(e));
  const cardioPool = state.feasible.filter(isCardioMovement);

  const topStrength = focus === "cardio" ? null : best(strengthPool.map((e) => score(state, e, needs)));
  const topCardio = focus === "strength" ? null : best(cardioPool.map((e) => score(state, e, needs)));

  if (!topStrength && !topCardio) {
    const where = input.contextName ? ` in "${input.contextName}"` : " here";
    return emptyPlan(
      input,
      minutes,
      `Nothing in your catalogue can be done${where}. Tick what is to hand in Settings → Places, or ask for something other than ${focus === "auto" ? "this" : focus}.`,
    );
  }

  // Strength or cardio is decided on NEED — the most overdue thing on each side
  // that can actually be done here — not on movement utility, which sums over
  // every muscle a movement trains and would let any compound lift outscore
  // the cardio it is not.
  const strengthNeed = topStrength ? mostOverdueHere(state, strengthPool) : 0;
  const cardioNeed = topCardio ? state.cardioNeed * state.cardioReady * state.cardioWeightToday : 0;

  let shape: SnackPlan["focus"];
  if (!topStrength) shape = "cardio";
  else if (!topCardio) shape = "strength";
  else if (cardioNeed > strengthNeed * CARDIO_TAKEOVER) shape = "cardio";
  else if (minutes >= 5 && cardioNeed >= strengthNeed * MIXED_THRESHOLD) shape = "mixed";
  else shape = "strength";

  if (shape === "cardio") {
    const block = cardioBlock(state, topCardio!.exercise, budgetSec);
    const format: SnackFormat = block.easySeconds != null ? "intervals" : "continuous";
    const blocks = [block];
    return {
      version: PLAN_VERSION,
      minutes,
      focus: "cardio",
      format,
      rounds: 1,
      roundRestSec: 0,
      blocks,
      finisher: null,
      estimatedSec: cardioSeconds(block),
      headline: headlineOf("cardio", blocks, null, minutes),
      reason: block.why,
      expected: expectedOf(blocks, 1, null),
      contextName: input.contextName ?? null,
      empty: null,
    };
  }

  // Strength (possibly with a cardio finisher).
  const finisherSec = shape === "mixed" ? (minutes >= 8 ? 120 : 60) : 0;
  const count = movementCount(minutes, shape === "mixed");
  const taken = new Set<string>();
  const picks: SnackBlock[] = [];
  for (let i = 0; i < count; i += 1) {
    const pick = best(strengthPool.filter((e) => !taken.has(e.id)).map((e) => score(state, e, needs)));
    if (!pick) break;
    const block = strengthBlock(state, pick, taken);
    taken.add(pick.exercise.id);
    taken.add(block.exerciseId);
    picks.push(block);
    satisfy(needs, pick.exercise);
  }

  const fitted = fitStrength(picks, budgetSec - finisherSec);
  // The finisher is chosen for its own short slot, not for the whole snack.
  const finisherPick =
    shape === "mixed" ? best(cardioPool.map((e) => score(state, e, needs, finisherSec))) : null;
  const finisher = finisherPick ? cardioBlock(state, finisherPick.exercise, finisherSec) : null;
  const estimatedSec = fitted.estimatedSec + (finisher ? TRANSITION_SEC + cardioSeconds(finisher) : 0);

  return {
    version: PLAN_VERSION,
    minutes,
    focus: finisher ? "mixed" : "strength",
    format: fitted.blocks.length === 1 ? "single" : "circuit",
    rounds: fitted.rounds,
    roundRestSec: fitted.roundRestSec,
    blocks: fitted.blocks,
    finisher,
    estimatedSec,
    headline: headlineOf(finisher ? "mixed" : "strength", fitted.blocks, finisher, minutes),
    reason: fitted.blocks[0].why,
    expected: expectedOf(fitted.blocks, fitted.rounds, finisher),
    contextName: input.contextName ?? null,
    empty: null,
  };
}

/**
 * Replace one block with the best alternative for the same job — same muscle
 * group for a strength block, any cardio for a cardio one — never proposing
 * anything already in the plan or already swapped away.
 */
export function swapBlock(
  input: PlannerInput,
  plan: SnackPlan,
  target: { index: number } | "finisher",
): SnackPlan | null {
  const current = target === "finisher" ? plan.finisher : plan.blocks[target.index];
  if (!current) return null;

  const inPlan = new Set([...plan.blocks.map((b) => b.exerciseId), ...(plan.finisher ? [plan.finisher.exerciseId] : [])]);
  const state = plannerState({ ...input, exclude: new Set([...(input.exclude ?? []), ...inPlan]) });

  let replacement: SnackBlock | null = null;
  if (current.role === "cardio") {
    const pick = best(state.feasible.filter(isCardioMovement).map((e) => score(state, e, state.needByAxis)));
    if (pick) {
      const seconds = current.easySeconds != null ? current.sets * 60 : (current.seconds ?? 60) * current.sets;
      replacement = cardioBlock(state, pick.exercise, seconds);
    }
  } else {
    // Only this group's need, so the replacement does the job the original was
    // doing rather than whatever is most overdue overall.
    const focused = new Map<AxisSlug, number>(
      [...state.needByAxis].map(([axis, need]) => [axis, axis === current.axis ? Math.max(need, 0.5) : need * 0.15]),
    );
    const pick = best(state.feasible.filter((e) => !isCardioMovement(e)).map((e) => score(state, e, focused)));
    if (pick) {
      replacement = strengthBlock(state, { ...pick, axis: current.axis ?? pick.axis }, inPlan);
      replacement.sets = current.sets;
      replacement.restSec = current.restSec;
    }
  }
  if (!replacement) return null;

  const blocks = target === "finisher" ? plan.blocks : plan.blocks.map((b, i) => (i === target.index ? replacement! : b));
  const finisher = target === "finisher" ? replacement : plan.finisher;
  const strengthSec =
    plan.focus === "cardio"
      ? cardioSeconds(blocks[0])
      : plan.rounds *
          (blocks.reduce((s, b) => s + setSeconds(b), 0) + (blocks.length - 1) * TRANSITION_SEC) +
        (plan.rounds - 1) * plan.roundRestSec;

  return {
    ...plan,
    blocks,
    finisher,
    estimatedSec: strengthSec + (finisher ? TRANSITION_SEC + cardioSeconds(finisher) : 0),
    headline: headlineOf(plan.focus, blocks, finisher, plan.minutes),
    reason: blocks[0].why,
    expected: expectedOf(blocks, plan.rounds, finisher),
  };
}
