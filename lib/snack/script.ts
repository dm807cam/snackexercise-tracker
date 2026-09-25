/**
 * A plan, as the guided player walks through it. Pure.
 *
 * The planner describes a snack the way a coach writes it down — three
 * movements, two rounds, thirty seconds between. The player needs it the way a
 * coach calls it out: this set, now rest, this set, now the finisher. Keeping
 * that translation here, out of the component, means the order of a circuit
 * is tested rather than eyeballed, and the player is left with nothing to
 * decide except what is on screen.
 */

import type { BlockResult, SnackBlock, SnackPlan } from "./types";

export type BlockKey = number | "finisher";

export type Step =
  /** One set of one block: a rep target, or a hold to time. */
  | { type: "set"; block: BlockKey; round: number; rounds: number }
  /** A breather, with what comes after it. */
  | { type: "rest"; seconds: number; upNext: string; betweenRounds: boolean }
  /** Work and easy periods, every minute on the minute, as one step. */
  | { type: "intervals"; block: BlockKey; rounds: number; workSec: number; easySec: number }
  /** One steady bout against a clock. */
  | { type: "steady"; block: BlockKey; seconds: number };

export function blockAt(plan: SnackPlan, key: BlockKey): SnackBlock | null {
  return key === "finisher" ? plan.finisher : (plan.blocks[key] ?? null);
}

function cardioStep(block: SnackBlock, key: BlockKey): Step {
  if (block.easySeconds != null) {
    return {
      type: "intervals",
      block: key,
      rounds: block.sets,
      workSec: block.seconds ?? 30,
      easySec: block.easySeconds,
    };
  }
  return { type: "steady", block: key, seconds: (block.seconds ?? 60) * Math.max(1, block.sets) };
}

export function scriptFor(plan: SnackPlan): Step[] {
  if (plan.blocks.length === 0) return [];
  if (plan.focus === "cardio") return [cardioStep(plan.blocks[0], 0)];

  const steps: Step[] = [];
  for (let round = 1; round <= plan.rounds; round += 1) {
    plan.blocks.forEach((block, index) => {
      steps.push({ type: "set", block: index, round, rounds: plan.rounds });
      const next = plan.blocks[index + 1];
      if (next) {
        steps.push({ type: "rest", seconds: block.restSec, upNext: next.name, betweenRounds: false });
      }
    });
    if (round < plan.rounds) {
      steps.push({
        type: "rest",
        seconds: plan.roundRestSec,
        upNext: plan.blocks.length === 1 ? `${plan.blocks[0].name}, set ${round + 1}` : `Round ${round + 1}`,
        betweenRounds: true,
      });
    }
  }

  if (plan.finisher) {
    steps.push({ type: "rest", seconds: 15, upNext: `Finisher: ${plan.finisher.name}`, betweenRounds: false });
    steps.push(cardioStep(plan.finisher, "finisher"));
  }
  return steps;
}

/** What the user did with one block, accumulated as they go. */
export interface Tally {
  setsDone: number;
  /** The reps (or seconds) of the most recent set, which is what gets logged. */
  reps: number | null;
  seconds: number | null;
  weightKg: number | null;
  skipped: boolean;
}

export function freshTallies(plan: SnackPlan): Map<BlockKey, Tally> {
  const tallies = new Map<BlockKey, Tally>();
  const add = (block: SnackBlock, key: BlockKey) =>
    tallies.set(key, {
      setsDone: 0,
      reps: block.kind === "reps" ? block.reps : null,
      seconds: block.kind === "time" ? block.seconds : null,
      weightKg: block.weightKg,
      skipped: false,
    });
  plan.blocks.forEach((block, index) => add(block, index));
  if (plan.finisher) add(plan.finisher, "finisher");
  return tallies;
}

/** The steps still to come once a block is skipped: its sets, and rests that now lead nowhere. */
export function withoutBlock(steps: readonly Step[], from: number, key: BlockKey): Step[] {
  const upcoming = steps.slice(from).filter((step) => !("block" in step) || step.block !== key);
  // Drop a rest that would now come straight after another, or sit at the end.
  const tidy: Step[] = [];
  const previous = () => (tidy.length > 0 ? tidy[tidy.length - 1] : steps[from - 1]);
  for (const step of upcoming) {
    if (step.type === "rest" && (previous() === undefined || previous()?.type === "rest")) continue;
    tidy.push(step);
  }
  while (tidy.length > 0 && tidy[tidy.length - 1].type === "rest") tidy.pop();
  return [...steps.slice(0, from), ...tidy];
}

/**
 * The results the server logs. A block nobody did a set of is reported as
 * skipped — the preference model learns from that — and a block with sets is
 * done, at the reps and effort the summary screen ended on.
 */
export function resultsFrom(
  plan: SnackPlan,
  tallies: ReadonlyMap<BlockKey, Tally>,
  efforts: ReadonlyMap<BlockKey, "easy" | "hard" | "failure" | null>,
): BlockResult[] {
  const results: BlockResult[] = [];
  const add = (block: SnackBlock, key: BlockKey) => {
    const tally = tallies.get(key);
    if (!tally) return;
    const done = tally.setsDone > 0 && !tally.skipped;
    results.push({
      exerciseId: block.exerciseId,
      outcome: done ? "done" : "skipped",
      sets: done ? tally.setsDone : 0,
      reps: tally.reps,
      seconds: tally.seconds,
      weightKg: tally.weightKg,
      effort: efforts.get(key) ?? null,
    });
  };
  plan.blocks.forEach((block, index) => add(block, index));
  if (plan.finisher) add(plan.finisher, "finisher");
  return results;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(s / 60);
  return `${minutes}:${String(s % 60).padStart(2, "0")}`;
}

/** "9 reps", "9 reps each side", "40 s", "40 s each side". */
export function targetLabel(block: SnackBlock, tally?: Tally): string {
  const side = block.unilateral ? " each side" : "";
  if (block.kind === "time") return `${tally?.seconds ?? block.seconds ?? 30} s${side}`;
  return `${tally?.reps ?? block.reps ?? 8} reps${side}`;
}
