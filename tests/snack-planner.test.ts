import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOGUE } from "@/prisma/exercise-catalogue";
import { slugify } from "@/lib/slug";
import { AXES, type AxisSlug } from "@/lib/muscles";
import { snackProfile, fitsContext, unfitReason, parseRepRange, type ContextCaps } from "@/lib/snack/profile";
import { CONTEXT_PRESETS, capsOf, presetRow, ANYWHERE } from "@/lib/snack/contexts";
import {
  chosenEquipment,
  formatEquipmentList,
  parseEquipmentList,
  parseRequirements,
  requirementsMet,
} from "@/lib/snack/equipment";
import { cardioReadiness, muscleFatigue, muscleReadiness } from "@/lib/snack/readiness";
import { posterior, preferenceFactor, preferenceMean } from "@/lib/snack/preference";
import { prescribe, loadStep } from "@/lib/snack/dose";
import { hashSeed, sampleBeta, seededRandom } from "@/lib/snack/random";
import {
  movementCount,
  planSnack,
  swapBlock,
  type PlannerExercise,
  type PlannerInput,
} from "@/lib/snack/planner";
import type { SnackPlan } from "@/lib/snack/types";

// --- fixtures: the real catalogue ------------------------------------------

const CATALOGUE: PlannerExercise[] = EXERCISE_CATALOGUE.map((item) => ({
  id: slugify(item.name),
  name: item.name,
  slug: slugify(item.name),
  cardioBias: item.cardioBias ?? 0,
  mets: item.mets ?? null,
  muscles: Object.entries(item.muscles).map(([muscle, weight]) => ({ muscle, weight: weight as number })),
  profile: snackProfile({
    category: item.category,
    cardioBias: item.cardioBias ?? 0,
    mets: item.mets ?? null,
    equipment: item.snack.equipment,
    load: item.snack.load ?? null,
    impact: item.snack.impact,
    floor: item.snack.floor,
    sweat: item.snack.sweat,
    snackReps: item.snack.reps ?? null,
    snackSeconds: item.snack.seconds ?? null,
    unilateral: item.snack.unilateral ?? false,
    cues: item.snack.cues?.join("\n") ?? null,
  }),
}));

const byId = new Map(CATALOGUE.map((e) => [e.id, e]));

function caps(kind: keyof typeof CONTEXT_PRESETS, extra: string[] = []): ContextCaps {
  const row = presetRow(kind);
  return capsOf({ ...row, equipment: `${row.equipment} ${extra.join(" ")}` });
}

/** Every group equally, moderately due; cardio likewise. */
function evenNeeds(overrides: Partial<Record<AxisSlug, number | null>> = {}, cardioDays: number | null = 3) {
  return {
    axes: AXES.map((a) => ({
      axis: a.slug,
      daysSinceTrained: a.slug in overrides ? (overrides[a.slug] ?? null) : 3,
      perWeek: 5,
      targetPerWeek: 10,
    })),
    daysSinceCardio: cardioDays,
    cardioMetMinutesPerWeek: 300,
    cardioTargetMetMinutesPerWeek: 600,
  };
}

const NOW = Date.UTC(2026, 8, 25, 12, 0);

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    nowMs: NOW,
    today: "2026-09-25",
    minutes: 5,
    focus: "auto",
    caps: caps("home"),
    contextName: "Home",
    exercises: CATALOGUE,
    needs: evenNeeds(),
    rings: { strengthRemaining: 3.9, strengthTarget: 3.9, cardioRemaining: 86, cardioTarget: 86 },
    recent: [],
    history: new Map(),
    preferences: new Map(),
    stalled: new Map(),
    seed: 42,
    ...overrides,
  };
}

function allBlocks(plan: SnackPlan) {
  return [...plan.blocks, ...(plan.finisher ? [plan.finisher] : [])];
}

// --- equipment ---------------------------------------------------------------

describe("equipment requirements", () => {
  it("read spaces as AND and bars as OR", () => {
    expect(parseRequirements("door towel")).toEqual([["door"], ["towel"]]);
    expect(parseRequirements("chair|bench")).toEqual([["chair", "bench"]]);
    expect(parseRequirements("")).toEqual([]);
    expect(parseRequirements(null)).toBeNull();
  });

  it("are met only when every requirement has an alternative to hand", () => {
    const here = new Set(["chair", "towel"]);
    expect(requirementsMet(parseRequirements("chair|bench")!, here)).toBe(true);
    expect(requirementsMet(parseRequirements("door towel")!, here)).toBe(false);
    expect(requirementsMet([], here)).toBe(true);
    expect(chosenEquipment(parseRequirements("bench|chair towel")!, here)).toEqual(["chair", "towel"]);
  });

  it("store in one canonical form and drop what the app does not know", () => {
    expect(formatEquipmentList(["towel", "chair", "chair", "spaceship"])).toBe("chair towel");
    expect([...parseEquipmentList("chair spaceship wall")]).toEqual(["chair", "wall"]);
  });
});

// --- profiles ----------------------------------------------------------------

describe("snack profiles", () => {
  it("describe every catalogue movement completely", () => {
    for (const exercise of CATALOGUE) {
      expect(exercise.profile.described, exercise.name).toBe(true);
      expect(exercise.profile.requirements, exercise.name).not.toBeNull();
    }
  });

  it("only name equipment the app knows", () => {
    const known = new Set(CONTEXT_PRESETS.gym.equipment.concat(["outdoors", "bike", "pool", "bag"]));
    for (const exercise of CATALOGUE) {
      for (const group of [...(exercise.profile.requirements ?? []), ...exercise.profile.load]) {
        for (const slug of group) expect(known.has(slug), `${exercise.name}: ${slug}`).toBe(true);
      }
    }
  });

  it("treat an outing as something to log, never to propose", () => {
    expect(byId.get("hike")!.profile.snackable).toBe(false);
    expect(byId.get("swim")!.profile.snackable).toBe(false);
    expect(byId.get("walk")!.profile.snackable).toBe(true);
  });

  it("infer conservatively for a movement nobody described", () => {
    const loaded = snackProfile({ category: "dumbbell", cardioBias: 0, mets: null });
    expect(loaded.requirements).toEqual([["dumbbells"]]);
    expect(loaded.described).toBe(false);

    // "Other" names no kit, so it is never proposed until someone says what it needs.
    const mystery = snackProfile({ category: "other", cardioBias: 0, mets: null });
    expect(mystery.requirements).toBeNull();
    expect(unfitReason(mystery, ANYWHERE)).toBe("unknown-kit");

    // An undescribed bodyweight movement is assumed to need the floor.
    expect(snackProfile({ category: "bodyweight", cardioBias: 0, mets: null }).floor).toBe(true);
  });

  it("parse rep ranges strictly", () => {
    expect(parseRepRange("8-12")).toEqual({ low: 8, high: 12 });
    expect(parseRepRange("12-8")).toBeNull();
    expect(parseRepRange("eight")).toBeNull();
  });

  it("say why a movement does not fit, in the order a person would", () => {
    const hotel = caps("hotel");
    expect(unfitReason(byId.get("jumping-jacks")!.profile, hotel)).toBe("noise");
    expect(unfitReason(byId.get("pull-up")!.profile, hotel)).toBe("equipment");
    expect(unfitReason(byId.get("push-up")!.profile, caps("office"))).toBe("floor");
    expect(unfitReason(byId.get("run")!.profile, caps("home"))).toBe(null);
    expect(unfitReason(byId.get("burpee")!.profile, caps("travel"))).toBe("noise");
  });
});

// --- places ------------------------------------------------------------------

describe("places", () => {
  it("offer something real in every preset, including the ones with nothing in them", () => {
    for (const kind of Object.keys(CONTEXT_PRESETS) as (keyof typeof CONTEXT_PRESETS)[]) {
      const here = caps(kind);
      const strength = CATALOGUE.filter((e) => e.cardioBias < 0.5 && fitsContext(e.profile, here));
      const cardio = CATALOGUE.filter((e) => e.cardioBias >= 0.5 && fitsContext(e.profile, here));
      expect(strength.length, kind).toBeGreaterThanOrEqual(kind === "travel" ? 4 : 8);
      expect(cardio.length, kind).toBeGreaterThanOrEqual(1);
    }
  });

  it("keep a hotel room quiet and an office presentable", () => {
    const hotel = CATALOGUE.filter((e) => fitsContext(e.profile, caps("hotel")));
    expect(hotel.every((e) => e.profile.impact <= 1)).toBe(true);
    expect(hotel.map((e) => e.slug)).toEqual(expect.arrayContaining(["towel-row", "chair-dip", "towel-hamstring-curl"]));

    const office = CATALOGUE.filter((e) => fitsContext(e.profile, caps("office")));
    expect(office.every((e) => !e.profile.floor && e.profile.sweat === 0)).toBe(true);
    expect(office.map((e) => e.slug)).toEqual(expect.arrayContaining(["incline-push-up", "wall-sit", "calf-raise"]));
  });
});

// --- readiness ---------------------------------------------------------------

describe("readiness", () => {
  const pushUps = { performedAtMs: NOW - 3_600_000, sets: 3, effort: "hard", cardioBias: 0, muscles: byId.get("push-up")!.muscles, metMinutes: 0 };

  it("leaves a muscle about half ready an hour after three hard sets", () => {
    const fatigue = muscleFatigue([pushUps], NOW);
    expect(muscleReadiness(fatigue, "chest")).toBeGreaterThan(0.45);
    expect(muscleReadiness(fatigue, "chest")).toBeLessThan(0.6);
    expect(muscleReadiness(fatigue, "quads")).toBe(1);
  });

  it("recovers over a day or two, and never reaches zero", () => {
    const yesterday = { ...pushUps, performedAtMs: NOW - 18 * 3_600_000 };
    expect(muscleReadiness(muscleFatigue([yesterday], NOW), "chest")).toBeGreaterThan(0.7);
    const hammered = Array.from({ length: 10 }, () => ({ ...pushUps, performedAtMs: NOW - 600_000 }));
    expect(muscleReadiness(muscleFatigue(hammered, NOW), "chest")).toBe(0.2);
  });

  it("counts an easy set for less, and cardio not at all", () => {
    const easy = muscleFatigue([{ ...pushUps, effort: "easy" }], NOW).get("chest")!;
    const hard = muscleFatigue([pushUps], NOW).get("chest")!;
    expect(easy).toBeLessThan(hard);
    const run = { performedAtMs: NOW - 3_600_000, sets: 1, cardioBias: 1, muscles: byId.get("run")!.muscles, metMinutes: 250 };
    expect(muscleFatigue([run], NOW).size).toBe(0);
    expect(cardioReadiness([run], NOW)).toBeLessThan(0.5);
    expect(cardioReadiness([{ ...run, performedAtMs: NOW - 12 * 3_600_000 }], NOW)).toBeGreaterThan(0.75);
    expect(cardioReadiness([{ ...run, performedAtMs: NOW - 24 * 3_600_000 }], NOW)).toBeGreaterThan(0.95);
  });
});

// --- preference --------------------------------------------------------------

describe("preference", () => {
  it("starts optimistic and learns from what the user does", () => {
    expect(preferenceMean(undefined)).toBeCloseTo(2 / 3);
    expect(preferenceMean({ done: 8, skipped: 0, swapped: 0, blocked: false })).toBeGreaterThan(0.85);
    expect(preferenceMean({ done: 0, skipped: 0, swapped: 4, blocked: false })).toBeLessThan(0.35);
    expect(preferenceMean({ done: 0, skipped: 1, swapped: 0, blocked: false })).toBeGreaterThan(0.6);
    // A skip counts half as much as a swap.
    const skipped = posterior({ done: 0, skipped: 2, swapped: 0, blocked: false });
    const swapped = posterior({ done: 0, skipped: 0, swapped: 2, blocked: false });
    expect(skipped.beta).toBeLessThan(swapped.beta);
  });

  it("samples reproducibly within its bounds", () => {
    const draws = (seed: number) => {
      const random = seededRandom(seed);
      return Array.from({ length: 50 }, () => preferenceFactor(undefined, random));
    };
    expect(draws(7)).toEqual(draws(7));
    expect(draws(7)).not.toEqual(draws(8));
    for (const value of draws(9)) {
      expect(value).toBeGreaterThanOrEqual(0.75);
      expect(value).toBeLessThanOrEqual(1.25);
    }
    // With exploration off, the settled mean — the same every time.
    expect(preferenceFactor(undefined, seededRandom(1), false)).toBeCloseTo(0.75 + 0.5 * (2 / 3));
  });

  it("draws from the Beta distribution it claims to", () => {
    const random = seededRandom(1234);
    const n = 4000;
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += sampleBeta(3, 7, random);
    expect(sum / n).toBeCloseTo(0.3, 1);
    expect(hashSeed("a", 1)).toBe(hashSeed("a", 1));
    expect(hashSeed("a", 1)).not.toBe(hashSeed("a", 2));
  });
});

// --- dosing ------------------------------------------------------------------

describe("dosing", () => {
  const range = { kind: "reps" as const, low: 6, high: 15 };
  const last = (overrides: object) => ({ localDate: "2026-09-20", sets: 3, reps: 10, weightKg: null, durationSec: null, effort: "hard", ...overrides });

  it("opens gently with no history", () => {
    const dose = prescribe({ dose: range, last: undefined, loadHere: false, today: "2026-09-25" });
    expect(dose.reps).toBe(9);
    expect(dose.note).toMatch(/two reps still in you/);
  });

  it("progresses on effort: two after easy, one after hard, back one after failure", () => {
    const at = (effort: string | null) => prescribe({ dose: range, last: last({ effort }), loadHere: false, today: "2026-09-25" }).reps;
    expect(at("easy")).toBe(12);
    expect(at("hard")).toBe(11);
    expect(at("failure")).toBe(9);
    expect(at(null)).toBe(10);
  });

  it("does not progress on a movement already done today", () => {
    const dose = prescribe({ dose: range, last: last({ localDate: "2026-09-25", effort: "easy" }), loadHere: false, today: "2026-09-25" });
    expect(dose.reps).toBe(10);
  });

  it("adds load and restarts the range when reps outgrow it", () => {
    const dose = prescribe({
      dose: { kind: "reps", low: 8, high: 12 },
      last: last({ reps: 12, weightKg: 16, effort: "easy" }),
      loadHere: true,
      today: "2026-09-25",
    });
    expect(dose.weightKg).toBe(18);
    expect(dose.reps).toBe(8);
    expect(loadStep(8)).toBe(1);
    expect(loadStep(60)).toBe(2.5);
  });

  it("goes bodyweight, and says so, when the weights are at home", () => {
    const dose = prescribe({ dose: range, last: last({ weightKg: 20 }), loadHere: false, today: "2026-09-25" });
    expect(dose.weightKg).toBeNull();
    expect(dose.note).toMatch(/bodyweight/);
  });

  it("stretches a hold by effort too", () => {
    const hold = { kind: "time" as const, seconds: 45 };
    expect(prescribe({ dose: hold, last: undefined, loadHere: false, today: "2026-09-25" }).seconds).toBe(45);
    expect(prescribe({ dose: hold, last: last({ durationSec: 60, effort: "easy" }), loadHere: false, today: "2026-09-25" }).seconds).toBe(70);
    expect(prescribe({ dose: hold, last: last({ durationSec: 60, effort: "failure" }), loadHere: false, today: "2026-09-25" }).seconds).toBe(55);
  });
});

// --- the planner -------------------------------------------------------------

describe("the planner", () => {
  it("is reproducible: the same situation proposes the same snack", () => {
    expect(planSnack(input())).toEqual(planSnack(input()));
  });

  it("only ever proposes what fits the place", () => {
    for (const kind of ["hotel", "office", "travel", "home", "outdoors"] as const) {
      for (const minutes of [1, 2, 3, 5, 8, 12]) {
        for (const seed of [1, 2, 3]) {
          const here = caps(kind);
          const plan = planSnack(input({ caps: here, minutes, seed }));
          expect(plan.empty, `${kind} ${minutes}`).toBeNull();
          for (const block of allBlocks(plan)) {
            expect(fitsContext(byId.get(block.exerciseId)!.profile, here), `${kind}: ${block.name}`).toBe(true);
          }
        }
      }
    }
  });

  it("fits the time it was given", () => {
    for (const minutes of [1, 2, 3, 4, 5, 6, 8, 10, 15, 20]) {
      for (const kind of ["home", "hotel", "gym"] as const) {
        const plan = planSnack(input({ caps: caps(kind), minutes }));
        // Estimates are estimates: five per cent over, and a little for a forced set.
        expect(plan.estimatedSec, `${kind} ${minutes}`).toBeLessThanOrEqual(minutes * 60 * 1.05 + 15);
        expect(plan.estimatedSec, `${kind} ${minutes}`).toBeGreaterThan(10);
      }
    }
  });

  it("goes after the group that has waited longest", () => {
    const plan = planSnack(input({ needs: evenNeeds({ hamstrings: 12 }), caps: caps("hotel"), minutes: 2 }));
    expect(plan.blocks[0].axis).toBe("hamstrings");
    expect(plan.blocks[0].why).toMatch(/Hamstrings · 12 days/);
  });

  it("spreads a longer snack across the body instead of repeating one group", () => {
    const plan = planSnack(input({ caps: caps("gym"), minutes: 8, needs: evenNeeds({}, 0) }));
    const groups = plan.blocks.map((b) => b.axis);
    expect(plan.blocks.length).toBe(3);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it("steers away from a muscle trained an hour ago", () => {
    // Two single-muscle movements, so nothing but need and readiness decides.
    const chestOnly: PlannerExercise = { ...byId.get("push-up")!, id: "chest-only", name: "Chest only", slug: "chest-only", muscles: [{ muscle: "chest", weight: 1 }] };
    const quadsOnly: PlannerExercise = { ...byId.get("bodyweight-squat")!, id: "quads-only", name: "Quads only", slug: "quads-only", muscles: [{ muscle: "quads", weight: 1 }] };
    const base = input({ exercises: [chestOnly, quadsOnly], needs: evenNeeds({ chest: 5, quads: 4 }), minutes: 2, explore: false });

    expect(planSnack(base).blocks[0].exerciseId).toBe("chest-only");

    const recent = [{
      exerciseId: "chest-only", localDate: "2026-09-25", performedAtMs: NOW - 3_600_000, sets: 4, effort: "hard",
      cardioBias: 0, muscles: chestOnly.muscles, metMinutes: 0,
    }];
    expect(planSnack({ ...base, recent }).blocks[0].exerciseId).toBe("quads-only");
  });

  it("proposes cardio when cardio is what is overdue", () => {
    const needs = { ...evenNeeds({}, 14), cardioMetMinutesPerWeek: 0 };
    const trainedToday = { ...needs, axes: needs.axes.map((a) => ({ ...a, daysSinceTrained: 0, perWeek: 10 })) };
    const plan = planSnack(input({ needs: trainedToday, caps: caps("travel"), minutes: 3 }));
    expect(plan.focus).toBe("cardio");
    expect(plan.blocks[0].role).toBe("cardio");
    // On the move there are stairs: the exercise-snack classic.
    expect(["stair-sprint", "stair-climb", "walk", "marching-high-knees", "step-jacks", "shadow-boxing"]).toContain(plan.blocks[0].slug);
  });

  it("runs vigorous cardio every minute on the minute", () => {
    const plan = planSnack(input({ focus: "cardio", caps: caps("outdoors"), minutes: 4, exercises: CATALOGUE.filter((e) => e.slug === "stair-sprint") }));
    expect(plan.format).toBe("intervals");
    expect(plan.blocks[0].sets).toBe(4);
    expect(plan.blocks[0].seconds! + plan.blocks[0].easySeconds!).toBe(60);
    expect(plan.expected.metMinutes).toBeGreaterThan(10);
  });

  it("honours an explicit focus", () => {
    expect(allBlocks(planSnack(input({ focus: "strength" }))).every((b) => b.role === "strength")).toBe(true);
    expect(allBlocks(planSnack(input({ focus: "cardio" }))).every((b) => b.role === "cardio")).toBe(true);
  });

  it("never proposes a movement the user has blocked", () => {
    const baseline = planSnack(input({ minutes: 2, caps: caps("hotel") }));
    const blocked = new Map([[baseline.blocks[0].exerciseId, { done: 0, skipped: 0, swapped: 0, blocked: true }]]);
    const plan = planSnack(input({ minutes: 2, caps: caps("hotel"), preferences: blocked }));
    expect(plan.blocks[0].exerciseId).not.toBe(baseline.blocks[0].exerciseId);
  });

  it("moves a stalled movement up its ladder, and says so", () => {
    const needs = evenNeeds({ chest: 20 });
    const plan = planSnack(input({
      needs,
      minutes: 2,
      exercises: CATALOGUE.filter((e) => ["push-up", "diamond-push-up", "walk"].includes(e.slug)),
      stalled: new Map([["push-up", ["diamond-push-up"]]]),
    }));
    expect(plan.blocks[0].slug).toBe("diamond-push-up");
    expect(plan.blocks[0].progressedFrom).toBe("Push-up");
  });

  it("doses from the user's own history", () => {
    const history = new Map([["wall-sit", { localDate: "2026-09-22", sets: 2, reps: null, weightKg: null, durationSec: 60, effort: "easy" }]]);
    const plan = planSnack(input({
      needs: evenNeeds({ quads: 15 }),
      caps: caps("office"),
      minutes: 2,
      exercises: CATALOGUE.filter((e) => ["wall-sit", "walk"].includes(e.slug)),
      history,
    }));
    expect(plan.blocks[0].slug).toBe("wall-sit");
    expect(plan.blocks[0].seconds).toBe(70);
    expect(plan.blocks[0].doseNote).toMatch(/last time 60s \(easy\)/);
  });

  it("says plainly when nothing can be done here", () => {
    const plan = planSnack(input({ caps: capsOf({ equipment: "", quiet: true, floor: false, sweat: 0 }), exercises: CATALOGUE.filter((e) => e.slug === "pull-up"), contextName: "Plane seat" }));
    expect(plan.empty).toMatch(/Plane seat/);
    expect(plan.blocks).toHaveLength(0);
  });

  it("counts what the snack adds to today's rings", () => {
    const plan = planSnack(input({ focus: "strength", minutes: 5 }));
    expect(plan.expected.hardSets).toBeGreaterThan(0);
    const cardio = planSnack(input({ focus: "cardio", minutes: 5 }));
    expect(cardio.expected.hardSets).toBeLessThan(plan.expected.hardSets);
    expect(cardio.expected.metMinutes).toBeGreaterThan(0);
  });

  it("sizes the snack to the minutes", () => {
    expect(movementCount(2, false)).toBe(1);
    expect(movementCount(5, false)).toBe(2);
    expect(movementCount(8, false)).toBe(3);
    expect(movementCount(15, false)).toBe(4);
    expect(movementCount(5, true)).toBe(1);
  });
});

describe("swapping a block", () => {
  it("offers something else for the same group, never something already in the plan", () => {
    const base = input({ needs: evenNeeds({ back: 9 }), caps: caps("hotel"), minutes: 5 });
    const plan = planSnack(base);
    const index = plan.blocks.findIndex((b) => b.axis === "back");
    expect(index).toBeGreaterThanOrEqual(0);

    const swapped = swapBlock(base, plan, { index })!;
    const replaced = swapped.blocks[index];
    expect(replaced.exerciseId).not.toBe(plan.blocks[index].exerciseId);
    expect(plan.blocks.map((b) => b.exerciseId)).not.toContain(replaced.exerciseId);
    expect(replaced.axis).toBe("back");
    expect(fitsContext(byId.get(replaced.exerciseId)!.profile, caps("hotel"))).toBe(true);
  });

  it("returns null when there is nothing left to offer", () => {
    const base = input({ exercises: CATALOGUE.filter((e) => e.slug === "push-up"), minutes: 2, focus: "strength" });
    const plan = planSnack(base);
    expect(swapBlock(base, plan, { index: 0 })).toBeNull();
  });
});
