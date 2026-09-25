import { describe, expect, it } from "vitest";
import { freshTallies, resultsFrom, scriptFor, targetLabel, withoutBlock, formatClock } from "@/lib/snack/script";
import { PLAN_VERSION, type SnackBlock, type SnackPlan } from "@/lib/snack/types";

function block(name: string, overrides: Partial<SnackBlock> = {}): SnackBlock {
  return {
    exerciseId: name.toLowerCase(),
    name,
    slug: name.toLowerCase(),
    role: "strength",
    axis: "chest",
    kind: "reps",
    sets: 1,
    reps: 10,
    repRange: [8, 12],
    seconds: null,
    easySeconds: null,
    weightKg: null,
    unilateral: false,
    restSec: 15,
    cues: [],
    serves: [],
    why: "",
    doseNote: null,
    equipment: [],
    progressedFrom: null,
    cardioBias: 0,
    mets: null,
    ...overrides,
  };
}

function plan(overrides: Partial<SnackPlan> = {}): SnackPlan {
  return {
    version: PLAN_VERSION,
    minutes: 5,
    focus: "strength",
    format: "circuit",
    rounds: 2,
    roundRestSec: 30,
    blocks: [block("Push"), block("Row")],
    finisher: null,
    estimatedSec: 240,
    headline: "",
    reason: "",
    expected: { hardSets: 4, metMinutes: 0 },
    contextName: null,
    empty: null,
    ...overrides,
  };
}

describe("the player script", () => {
  it("walks a circuit round by round, resting between movements and between rounds", () => {
    const steps = scriptFor(plan());
    expect(steps.map((s) => s.type)).toEqual(["set", "rest", "set", "rest", "set", "rest", "set"]);
    expect(steps[1]).toMatchObject({ type: "rest", seconds: 15, upNext: "Row", betweenRounds: false });
    expect(steps[3]).toMatchObject({ type: "rest", seconds: 30, upNext: "Round 2", betweenRounds: true });
    expect(steps[4]).toMatchObject({ type: "set", block: 0, round: 2, rounds: 2 });
  });

  it("walks straight sets of one movement with a rest between each", () => {
    const steps = scriptFor(plan({ format: "single", rounds: 3, blocks: [block("Squat")] }));
    expect(steps.map((s) => s.type)).toEqual(["set", "rest", "set", "rest", "set"]);
    expect(steps[1]).toMatchObject({ upNext: "Squat, set 2" });
  });

  it("ends on the finisher", () => {
    const finisher = block("Stairs", { role: "cardio", kind: "time", seconds: 30, easySeconds: 30, sets: 2, cardioBias: 1 });
    const steps = scriptFor(plan({ rounds: 1, finisher }));
    expect(steps.at(-2)).toMatchObject({ type: "rest", upNext: "Finisher: Stairs" });
    expect(steps.at(-1)).toEqual({ type: "intervals", block: "finisher", rounds: 2, workSec: 30, easySec: 30 });
  });

  it("runs a cardio snack as one interval or steady step", () => {
    const intervals = scriptFor(plan({ focus: "cardio", format: "intervals", rounds: 1, blocks: [block("Jacks", { role: "cardio", kind: "time", seconds: 40, easySeconds: 20, sets: 4 })] }));
    expect(intervals).toEqual([{ type: "intervals", block: 0, rounds: 4, workSec: 40, easySec: 20 }]);
    const steady = scriptFor(plan({ focus: "cardio", format: "continuous", rounds: 1, blocks: [block("Walk", { role: "cardio", kind: "time", seconds: 600, sets: 1 })] }));
    expect(steady).toEqual([{ type: "steady", block: 0, seconds: 600 }]);
  });

  it("drops a skipped movement's remaining sets and the rests that led to them", () => {
    const steps = scriptFor(plan());
    const describe = (list: typeof steps) => list.map((s) => ("block" in s ? `${s.type}:${s.block}` : s.type));
    // Skipping Row as it comes up: the rest before it has been taken already,
    // so the next thing is Push again — not a second rest in a row.
    expect(describe(withoutBlock(steps, 2, 1))).toEqual(["set:0", "rest", "set:0"]);
    // Skipping Push at the very start leaves Row, with no rest leading nowhere.
    expect(describe(withoutBlock(steps, 0, 0))).toEqual(["set:1", "rest", "set:1"]);
  });

  it("reports what was done, and what was never started as skipped", () => {
    const p = plan();
    const tallies = freshTallies(p);
    tallies.get(0)!.setsDone = 2;
    tallies.get(0)!.reps = 11;
    const results = resultsFrom(p, tallies, new Map([[0, "hard" as const]]));
    expect(results).toEqual([
      { exerciseId: "push", outcome: "done", sets: 2, reps: 11, seconds: null, weightKg: null, effort: "hard" },
      { exerciseId: "row", outcome: "skipped", sets: 0, reps: 10, seconds: null, weightKg: null, effort: null },
    ]);
  });

  it("labels targets the way a coach says them", () => {
    expect(targetLabel(block("Lunge", { unilateral: true, reps: 9 }))).toBe("9 reps each side");
    expect(targetLabel(block("Plank", { kind: "time", seconds: 45, reps: null }))).toBe("45 s");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});
