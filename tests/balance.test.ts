import { describe, expect, it } from "vitest";
import {
  balanceFrom,
  buildBalance,
  type BalanceEntry,
} from "@/lib/balance";
import { GUIDELINE_TARGETS, LONGEVITY_TARGETS } from "@/lib/targets";

const STRENGTH_TARGET_HARD_SETS_PER_WEEK = GUIDELINE_TARGETS.strengthHardSetsPerWeek;
import type { DayWalking, StepSettings } from "@/lib/cardio";
import { addDays } from "@/lib/dates";

const WINDOW = 30;
const START = "2026-08-09";

const HALF: StepSettings = { mode: "half", baseline: 4000 };

/**
 * A strength set whose muscle mapping sums to 2.2 — the average effective-set
 * multiplier this app's 1.0 / 0.5 / 0.25 convention produces for a compound
 * movement, and the number STRENGTH_TARGET is calibrated against.
 */
function lifting(sets: number, date = START): BalanceEntry {
  return entry({
    localDate: date,
    sets,
    reps: 8,
    exercise: {
      cardioBias: 0,
      mets: null,
      muscles: [
        { muscle: "quads", weight: 1 },
        { muscle: "glutes", weight: 0.7 },
        { muscle: "hamstrings", weight: 0.5 },
      ],
    },
  });
}

function running(durationSec: number, date: string): BalanceEntry {
  return entry({
    localDate: date,
    sets: 1,
    durationSec,
    exercise: {
      slug: "run",
      cardioBias: 1,
      mets: 9.8,
      muscles: [{ muscle: "quads", weight: 0.25 }],
    },
  });
}

type EntryOverrides = Omit<Partial<BalanceEntry>, "exercise"> & {
  exercise: Partial<BalanceEntry["exercise"]>;
};

function entry(overrides: EntryOverrides): BalanceEntry {
  return {
    id: overrides.id ?? "e1",
    performedAt: overrides.performedAt ?? new Date(2026, 7, 9, 9, 0),
    localDate: overrides.localDate ?? START,
    sets: overrides.sets ?? 1,
    reps: overrides.reps ?? null,
    weightKg: overrides.weightKg ?? null,
    durationSec: overrides.durationSec ?? null,
    distanceM: overrides.distanceM ?? null,
    avgHeartRate: overrides.avgHeartRate ?? null,
    exercise: {
      id: "x1",
      name: "Test",
      slug: overrides.exercise.slug,
      cardioBias: overrides.exercise.cardioBias ?? 0,
      mets: overrides.exercise.mets ?? null,
      muscles: overrides.exercise.muscles ?? [],
    },
  };
}

/** The same step count on every day of the window. */
/**
 * A window of identical days. Walking records rather than bare counts: brisk
 * minutes decide how much of a day's surplus is credited at the brisk rate, and
 * a day that reports none is all incidental walking — which is what a bare
 * daily step total actually describes.
 */
function flatSteps(
  perDay: number,
  days = WINDOW,
  activeMinutes: number | null = null,
): Record<string, DayWalking> {
  const out: Record<string, DayWalking> = {};
  for (let i = 0; i < days; i++) out[addDays(START, i)] = { steps: perDay, activeMinutes };
  return out;
}

function strengthPercent(share: number): number {
  return Math.round((1 - share) * 100);
}

describe("balanceFrom", () => {
  it("sits in the middle when nothing at all has been logged", () => {
    const { cardioShare, uncertainty } = balanceFrom(0, 0);
    expect(cardioShare).toBe(0.5);
    // ...and says so, with a band wide enough to be useless on purpose.
    expect(uncertainty).toBeGreaterThan(0.4);
  });

  it("does not declare 100% cardio on the strength of one short walk", () => {
    // The naive C/(C+S) share would be exactly 1.0 here.
    const { cardioShare } = balanceFrom(0, 0.03);
    expect(cardioShare).toBeLessThan(0.6);
  });

  it("is scale-invariant: doubling both sides does not move the marker", () => {
    const small = balanceFrom(2, 6);
    const large = balanceFrom(20, 60);
    // Not identical — the prior is weaker against more data — but the same
    // answer, and both firmly cardio.
    expect(Math.abs(small.cardioShare - large.cardioShare)).toBeLessThan(0.05);
  });

  it("narrows as the window fills at the same rate", () => {
    const week = balanceFrom(1, 1);
    const halfYear = balanceFrom(26, 26);
    expect(week.cardioShare).toBeCloseTo(halfYear.cardioShare, 2);
    expect(halfYear.uncertainty).toBeLessThan(week.uncertainty / 3);
  });

  it("is symmetric between the two sides", () => {
    const a = balanceFrom(5, 1);
    const b = balanceFrom(1, 5);
    expect(a.cardioShare).toBeCloseTo(1 - b.cardioShare, 6);
    expect(a.uncertainty).toBeCloseTo(b.uncertainty, 6);
  });

  it("stays inside the unit interval at the extremes", () => {
    const extreme = balanceFrom(0, 500);
    expect(extreme.cardioShare).toBeLessThanOrEqual(1);
    expect(extreme.cardioShare).toBeGreaterThan(0.99);
  });
});

/**
 * The profiles the design note is calibrated against. These are the reason to
 * believe the metric at all: it has to put a lifter who walks on the strength
 * side and a runner who lifts on the cardio side, using the same formula.
 */
describe("training profiles", () => {
  it("reads a lifter who walks a bit as strength, not cardio", () => {
    const result = buildBalance({
      windowDays: WINDOW,
      entries: [lifting(171)],
      walkingByDate: flatSteps(5000),
      stepSettings: HALF,
    });

    // 88 rather than the 86 this read when every above-baseline step was
    // credited at 3.5 METs: a bare daily total is incidental walking, and
    // crediting it as brisk pushed a lifter cardio-ward.
    expect(strengthPercent(result.cardioShare)).toBe(88);
    expect(result.confident).toBe(true);
  });

  it("reads a snack trainer who walks a normal amount as roughly balanced", () => {
    // The load-bearing case: 15 hard sets a week and a 7,000-step commute must
    // not be reported as a cardio athlete.
    const result = buildBalance({
      windowDays: WINDOW,
      entries: [lifting(64)],
      walkingByDate: flatSteps(7000),
      stepSettings: { mode: "half", baseline: 4500 },
    });

    expect(strengthPercent(result.cardioShare)).toBeGreaterThanOrEqual(50);
    expect(strengthPercent(result.cardioShare)).toBeLessThanOrEqual(62);
  });

  it("reads someone who runs four times a week and lifts twice as cardio", () => {
    const entries: BalanceEntry[] = [lifting(86)];
    const steps: Record<string, DayWalking> = {};
    for (let i = 0; i < WINDOW; i++) {
      const date = addDays(START, i);
      steps[date] = { steps: 8000 };
      // Four runs a week, 45 minutes each.
      if (i % 7 < 4) entries.push(running(2700, date));
    }

    const result = buildBalance({
      windowDays: WINDOW,
      entries,
      walkingByDate: steps,
      stepSettings: HALF,
    });

    expect(Math.round(result.cardioShare * 100)).toBeGreaterThanOrEqual(78);
    expect(result.confident).toBe(true);
  });

  it("reads someone who only walks as almost entirely cardio", () => {
    const result = buildBalance({
      windowDays: WINDOW,
      entries: [],
      walkingByDate: flatSteps(12000),
      stepSettings: HALF,
    });

    expect(Math.round(result.cardioShare * 100)).toBeGreaterThanOrEqual(95);
    expect(result.uncertainty).toBeLessThan(0.1);
  });

  it("refuses to place a marker on a single ten-minute walk", () => {
    const result = buildBalance({
      windowDays: 7,
      entries: [
        entry({
          durationSec: 600,
          exercise: { slug: "walk", cardioBias: 1, mets: 3.5, muscles: [] },
        }),
      ],
      walkingByDate: {},
      stepSettings: HALF,
    });

    expect(result.confident).toBe(false);
    expect(result.cardioShare).toBeGreaterThan(0.4);
    expect(result.cardioShare).toBeLessThan(0.6);
    expect(result.uncertainty).toBeGreaterThan(0.35);
  });
});

describe("buildBalance", () => {
  it("splits a mixed movement between both sides without counting it twice", () => {
    // Kettlebell swings, bias 0.4: 60% of the effective sets, 40% of the
    // MET-minutes.
    const swings = entry({
      sets: 10,
      reps: 15,
      exercise: {
        cardioBias: 0.4,
        mets: 9.8,
        muscles: [
          { muscle: "glutes", weight: 1 },
          { muscle: "hamstrings", weight: 1 },
        ],
      },
    });

    const result = buildBalance({
      windowDays: WINDOW,
      entries: [swings],
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
    });

    // 10 sets x 2.0 muscle weight x 0.6 strength share.
    expect(result.detail.effectiveSets).toBeCloseTo(12, 5);
    // 10 x 15 reps x 3 s = 450 s = 7.5 min at 9.8 METs, times 0.4.
    expect(result.detail.metMinutes).toBe(29);
  });

  it("keeps a pure cardio entry out of the strength side entirely", () => {
    const result = buildBalance({
      windowDays: WINDOW,
      entries: [running(3600, START)],
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
    });

    expect(result.detail.effectiveSets).toBe(0);
    expect(result.detail.metMinutes).toBe(588);
  });

  it("does not count a logged run twice via the day's step total", () => {
    const date = START;
    const withRun = buildBalance({
      windowDays: WINDOW,
      // A 45-minute run: about 7,400 steps by cadence.
      entries: [running(2700, date)],
      walkingByDate: { [date]: { steps: 11000 } },
      stepSettings: HALF,
    });

    const withoutDedup = buildBalance({
      windowDays: WINDOW,
      entries: [],
      walkingByDate: { [date]: { steps: 11000 } },
      stepSettings: HALF,
    });

    // The run's own steps are absorbed, so the day's walking adds nothing.
    expect(withRun.detail.stepMetMinutes).toBe(0);
    // Whereas the same day without a run logged earns the whole surplus:
    // 7,000 steps above the baseline at the incidental rate, half weight.
    expect(withoutDedup.detail.stepMetMinutes).toBeCloseTo((7000 / 110) * 2.8 * 0.5, 0);
  });

  it("reports the raw doses behind the marker, normalised per week", () => {
    const result = buildBalance({
      windowDays: WINDOW,
      entries: [lifting(171)],
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
    });

    // Both scales are reported: hard sets are the dose the marker is placed on,
    // effective sets are what the radar's spokes add up to.
    expect(result.detail.hardSets).toBeCloseTo(171, 1);
    expect(result.detail.hardSetsPerWeek).toBeCloseTo(39.9, 1);
    expect(result.detail.effectiveSets).toBeCloseTo(376.2, 1);
    expect(result.detail.effectiveSetsPerWeek).toBeCloseTo(87.8, 1);
    expect(result.strengthDose).toBeCloseTo(171 / STRENGTH_TARGET_HARD_SETS_PER_WEEK, 2);
  });

  describe("the dose does not depend on how many muscles a movement touches", () => {
    /** Deadlift-shaped: six muscles, weights summing to 4.25. */
    function compound(sets: number): BalanceEntry {
      return entry({
        localDate: START,
        sets,
        exercise: {
          cardioBias: 0,
          mets: null,
          muscles: [
            { muscle: "hamstrings", weight: 1 },
            { muscle: "glutes", weight: 1 },
            { muscle: "lower-back", weight: 1 },
            { muscle: "traps", weight: 0.5 },
            { muscle: "forearms", weight: 0.5 },
            { muscle: "lats", weight: 0.25 },
          ],
        },
      });
    }

    /** Triceps-extension-shaped: one muscle, weight 1.0. */
    function isolation(sets: number): BalanceEntry {
      return entry({
        localDate: START,
        sets,
        exercise: {
          cardioBias: 0,
          mets: null,
          muscles: [{ muscle: "triceps", weight: 1 }],
        },
      });
    }

    const dose = (entries: BalanceEntry[]) =>
      buildBalance({
        windowDays: WINDOW,
        entries,
        walkingByDate: {},
        stepSettings: { mode: "off", baseline: 4000 },
      });

    it("scores the same number of sets the same, compound or isolation", () => {
      // The defect this fixes: the summed effective sets made a deadlift 4.25x
      // the dose of a triceps extension, so a lifter who squats read as
      // strength-dominant against one who curls at identical hard-set counts.
      expect(dose([compound(10)]).strengthDose).toBeCloseTo(
        dose([isolation(10)]).strengthDose,
        10,
      );
    });

    it("still credits the two movements differently per muscle", () => {
      // The per-muscle vector is correct as it stands — a deadlift really does
      // train six of them — and only the scalar collapse was wrong.
      expect(dose([compound(10)]).detail.effectiveSets).toBeCloseTo(42.5, 5);
      expect(dose([isolation(10)]).detail.effectiveSets).toBeCloseTo(10, 5);
    });

    it("does not move when the muscle weightings are edited", () => {
      // They are editable in Settings, so a dose derived from them silently
      // restated every past week whenever someone adjusted a row.
      const edited = entry({
        localDate: START,
        sets: 10,
        exercise: {
          cardioBias: 0,
          mets: null,
          muscles: [
            { muscle: "hamstrings", weight: 1 },
            { muscle: "glutes", weight: 0.25 },
          ],
        },
      });
      expect(dose([edited]).strengthDose).toBeCloseTo(dose([compound(10)]).strengthDose, 10);
    });
  });

  it("turning steps off removes their contribution completely", () => {
    const on = buildBalance({
      windowDays: WINDOW,
      entries: [lifting(50)],
      walkingByDate: flatSteps(14000),
      stepSettings: HALF,
    });
    const off = buildBalance({
      windowDays: WINDOW,
      entries: [lifting(50)],
      walkingByDate: flatSteps(14000),
      stepSettings: { mode: "off", baseline: 4000 },
    });

    expect(off.detail.stepMetMinutes).toBe(0);
    expect(off.cardioShare).toBeLessThan(on.cardioShare);
  });

  it("signs the index for a diverging scale", () => {
    const cardio = buildBalance({
      windowDays: WINDOW,
      entries: [running(3600, START)],
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
    });
    const strength = buildBalance({
      windowDays: WINDOW,
      entries: [lifting(171)],
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
    });

    expect(cardio.index).toBeGreaterThan(0);
    expect(strength.index).toBeLessThan(0);
    expect(cardio.index).toBeCloseTo(2 * cardio.cardioShare - 1, 6);
  });
});

describe("the targets are configurable", () => {
  const lifting30 = [lifting(30)];

  it("measures cardio against whatever the user set", () => {
    const base = buildBalance({
      windowDays: WINDOW,
      entries: [...lifting30, running(3600, START)],
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
    });
    const raised = buildBalance({
      windowDays: WINDOW,
      entries: [...lifting30, running(3600, START)],
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
      targets: LONGEVITY_TARGETS,
    });

    // Same run, twice the bar: the cardio dose halves and the marker swings
    // toward strength. That is the point of the setting.
    expect(raised.cardioDose).toBeCloseTo(base.cardioDose / 2, 5);
    expect(raised.cardioShare).toBeLessThan(base.cardioShare);
    expect(raised.strengthDose).toBeCloseTo(base.strengthDose, 10);
  });

  it("carries the targets it used, so the breakdown cannot name different ones", () => {
    const result = buildBalance({
      windowDays: WINDOW,
      entries: lifting30,
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
      targets: LONGEVITY_TARGETS,
    });
    expect(result.targets).toEqual(LONGEVITY_TARGETS);
  });

  it("defaults to the guideline when none are given", () => {
    const result = buildBalance({
      windowDays: WINDOW,
      entries: lifting30,
      walkingByDate: {},
      stepSettings: { mode: "off", baseline: 4000 },
    });
    expect(result.targets).toEqual(GUIDELINE_TARGETS);
  });
});
