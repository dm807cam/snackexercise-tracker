import { describe, expect, it } from "vitest";
import {
  buildStats,
  emptyMuscleTotals,
  muscleEffectiveSets,
  perWeek,
  rollUpToAxes,
  shadeIntensity,
  summariseDay,
  totalEffectiveSets,
  totalReps,
  totalSets,
  totalTonnage,
  type ScoredEntry,
} from "@/lib/scoring";
import type { AxisSlug } from "@/lib/muscles";
import { buildBalance } from "@/lib/balance";

/**
 * The inputs buildStats gained when cardio arrived. These tests are about the
 * axis maths, so they pass an empty balance rather than restating it.
 */
const NO_CARDIO = {
  balance: buildBalance({
    windowDays: 30,
    entries: [],
    stepsByDate: {},
    stepSettings: { mode: "off" as const, baseline: 4000 },
  }),
  lastCardio: null,
  daysWithSteps: 0,
};

function entry(overrides: Partial<ScoredEntry> & { muscles: [string, number][] }): ScoredEntry {
  const { muscles, ...rest } = overrides;
  return {
    id: rest.id ?? "e1",
    performedAt: rest.performedAt ?? new Date(2026, 8, 6, 9, 0),
    localDate: rest.localDate ?? "2026-09-06",
    sets: rest.sets ?? 1,
    reps: rest.reps ?? null,
    weightKg: rest.weightKg ?? null,
    durationSec: rest.durationSec ?? null,
    exercise: {
      id: "x1",
      name: "Test",
      cardioBias: rest.exercise?.cardioBias,
      muscles: muscles.map(([muscle, weight]) => ({ muscle, weight })),
    },
  };
}

describe("muscleEffectiveSets", () => {
  it("credits each muscle by its weighting times the number of sets", () => {
    const totals = muscleEffectiveSets([
      entry({ sets: 3, muscles: [["chest", 1], ["triceps", 0.5]] }),
    ]);
    expect(totals.chest).toBe(3);
    expect(totals.triceps).toBe(1.5);
    expect(totals.quads).toBe(0);
  });

  it("works with no weight recorded — the common case for a snack", () => {
    const totals = muscleEffectiveSets([
      entry({ sets: 2, reps: null, weightKg: null, muscles: [["lats", 1]] }),
    ]);
    expect(totals.lats).toBe(2);
  });

  it("accumulates across entries", () => {
    const totals = muscleEffectiveSets([
      entry({ id: "a", sets: 2, muscles: [["chest", 1]] }),
      entry({ id: "b", sets: 4, muscles: [["chest", 0.5]] }),
    ]);
    expect(totals.chest).toBe(4);
  });

  it("treats a non-positive set count as one set rather than erasing the entry", () => {
    const totals = muscleEffectiveSets([entry({ sets: 0, muscles: [["abs", 1]] })]);
    expect(totals.abs).toBe(1);
  });

  it("ignores muscle slugs outside the taxonomy", () => {
    const totals = muscleEffectiveSets([entry({ sets: 1, muscles: [["not-a-muscle", 1]] })]);
    expect(totalEffectiveSets(totals)).toBe(0);
  });

  it("returns all-zero totals for an empty log", () => {
    expect(muscleEffectiveSets([])).toEqual(emptyMuscleTotals());
  });
});

describe("cardio does not become hypertrophy volume", () => {
  it("gives a pure cardio movement no effective sets at all", () => {
    // A run's muscle mapping exists so it can shade something later, not so it
    // can claim leg volume. At bias 1.0 it must contribute nothing here.
    const totals = muscleEffectiveSets([
      entry({
        sets: 1,
        muscles: [["quads", 0.25], ["calves", 0.25]],
        exercise: { id: "x1", name: "Run", cardioBias: 1, muscles: [] },
      }),
    ]);
    expect(totals.quads).toBe(0);
    expect(totals.calves).toBe(0);
  });

  it("credits a mixed movement in proportion", () => {
    // Burpees at 0.5: half a set's worth of chest, which is about right.
    const totals = muscleEffectiveSets([
      entry({
        sets: 4,
        muscles: [["chest", 0.5]],
        exercise: { id: "x1", name: "Burpee", cardioBias: 0.5, muscles: [] },
      }),
    ]);
    expect(totals.chest).toBe(1);
  });

  it("leaves pre-cardio entries untouched when the field is absent", () => {
    const totals = muscleEffectiveSets([entry({ sets: 3, muscles: [["chest", 1]] })]);
    expect(totals.chest).toBe(3);
  });

  it("keeps a run out of the radar entirely", () => {
    const axes = rollUpToAxes(
      muscleEffectiveSets([
        entry({
          sets: 1,
          muscles: [["quads", 0.25]],
          exercise: { id: "x1", name: "Run", cardioBias: 1, muscles: [] },
        }),
      ]),
    );
    expect(axes.quads).toBe(0);
  });

  it("still counts the run as a set and an active day", () => {
    // The day list and the streak are about showing up, not about stimulus.
    const run = entry({
      sets: 1,
      muscles: [["quads", 0.25]],
      exercise: { id: "x1", name: "Run", cardioBias: 1, muscles: [] },
    });
    expect(totalSets([run])).toBe(1);
  });
});

describe("rollUpToAxes", () => {
  it("sums fine-grained muscles into their shared axis", () => {
    const axes = rollUpToAxes(
      muscleEffectiveSets([
        entry({ sets: 2, muscles: [["abs", 1], ["obliques", 0.5]] }),
        entry({ id: "b", sets: 1, muscles: [["front-delts", 1], ["side-delts", 1]] }),
      ]),
    );
    // Core = abs (2) + obliques (1)
    expect(axes.core).toBe(3);
    // Shoulders = front-delts (1) + side-delts (1)
    expect(axes.shoulders).toBe(2);
  });

  it("routes quads and adductors to the same axis", () => {
    const axes = rollUpToAxes(muscleEffectiveSets([entry({ muscles: [["adductors", 1]] })]));
    expect(axes.quads).toBe(1);
  });
});

describe("totalTonnage", () => {
  it("multiplies sets, reps and weight", () => {
    expect(totalTonnage([entry({ sets: 3, reps: 10, weightKg: 20, muscles: [["chest", 1]] })])).toBe(
      600,
    );
  });

  it("contributes nothing when weight or reps are missing rather than guessing", () => {
    expect(
      totalTonnage([
        entry({ sets: 3, reps: 10, weightKg: null, muscles: [["chest", 1]] }),
        entry({ id: "b", sets: 3, reps: null, weightKg: 20, muscles: [["chest", 1]] }),
      ]),
    ).toBe(0);
  });

  it("counts only the weighted entries in a mixed day", () => {
    expect(
      totalTonnage([
        entry({ sets: 1, reps: 5, weightKg: 100, muscles: [["chest", 1]] }),
        entry({ id: "b", sets: 3, reps: 12, weightKg: null, muscles: [["lats", 1]] }),
      ]),
    ).toBe(500);
  });
});

describe("totalSets / totalReps", () => {
  it("counts sets, and reps only where recorded", () => {
    const entries = [
      entry({ sets: 3, reps: 10, muscles: [["chest", 1]] }),
      entry({ id: "b", sets: 2, reps: null, muscles: [["lats", 1]] }),
    ];
    expect(totalSets(entries)).toBe(5);
    expect(totalReps(entries)).toBe(30);
  });
});

describe("summariseDay", () => {
  it("bundles the day's counts and per-muscle load", () => {
    const summary = summariseDay("2026-09-06", [
      entry({ sets: 3, reps: 10, weightKg: 24, muscles: [["glutes", 1], ["hamstrings", 1]] }),
    ]);
    expect(summary).toMatchObject({
      date: "2026-09-06",
      entryCount: 1,
      sets: 3,
      reps: 30,
      tonnageKg: 720,
    });
    expect(summary.muscles.glutes).toBe(3);
  });

  it("summarises an empty day without throwing", () => {
    const summary = summariseDay("2026-09-06", []);
    expect(summary.entryCount).toBe(0);
    expect(totalEffectiveSets(summary.muscles)).toBe(0);
  });
});

describe("perWeek", () => {
  it("normalises so different windows are comparable", () => {
    // 20 sets over 7 days is 20/week; the same 20 over 28 days is 5/week.
    expect(perWeek(20, 7)).toBe(20);
    expect(perWeek(20, 28)).toBe(5);
  });

  it("returns zero for a non-positive window instead of dividing by zero", () => {
    expect(perWeek(10, 0)).toBe(0);
  });
});

describe("shadeIntensity", () => {
  it("is zero for untrained muscles and one at the reference", () => {
    expect(shadeIntensity(0, 10)).toBe(0);
    expect(shadeIntensity(10, 10)).toBe(1);
  });

  it("uses a square-root ramp so a small amount is still clearly visible", () => {
    // Linear would give 0.25; the sqrt ramp lifts it to 0.5.
    expect(shadeIntensity(2.5, 10)).toBe(0.5);
  });

  it("clamps above the reference and tolerates a zero reference", () => {
    expect(shadeIntensity(50, 10)).toBe(1);
    expect(shadeIntensity(5, 0)).toBe(0);
  });
});

describe("buildStats", () => {
  const today = "2026-09-06";

  it("reports per-week rates, the previous period and days since trained", () => {
    const stats = buildStats({
      windowDays: 7,
      start: "2026-08-31",
      end: today,
      current: [entry({ sets: 4, localDate: "2026-09-05", muscles: [["chest", 1]] })],
      previous: [entry({ id: "p", sets: 2, localDate: "2026-08-25", muscles: [["chest", 1]] })],
      lastTrained: new Map<AxisSlug, string>([["chest", "2026-09-05"]]),
      today,
      ...NO_CARDIO,
    });

    const chest = stats.axes.find((a) => a.axis === "chest")!;
    expect(chest.total).toBe(4);
    expect(chest.perWeek).toBe(4);
    expect(chest.previousPerWeek).toBe(2);
    expect(chest.daysSinceTrained).toBe(1);
  });

  it("reports null days-since for an axis that has never been trained", () => {
    const stats = buildStats({
      windowDays: 30,
      start: "2026-08-08",
      end: today,
      current: [],
      previous: [],
      lastTrained: new Map(),
      today,
      ...NO_CARDIO,
    });
    expect(stats.axes.every((a) => a.daysSinceTrained === null)).toBe(true);
    expect(stats.axes.every((a) => a.perWeek === 0)).toBe(true);
  });

  it("counts distinct active days, not entries", () => {
    const stats = buildStats({
      windowDays: 7,
      start: "2026-08-31",
      end: today,
      current: [
        entry({ id: "a", localDate: "2026-09-05", muscles: [["chest", 1]] }),
        entry({ id: "b", localDate: "2026-09-05", muscles: [["lats", 1]] }),
        entry({ id: "c", localDate: "2026-09-06", muscles: [["quads", 1]] }),
      ],
      previous: [],
      lastTrained: new Map(),
      today,
      ...NO_CARDIO,
    });
    expect(stats.totals.activeDays).toBe(2);
  });

  it("always returns every axis so the radar keeps its shape", () => {
    const stats = buildStats({
      windowDays: 7,
      start: "2026-08-31",
      end: today,
      current: [entry({ muscles: [["chest", 1]] })],
      previous: [],
      lastTrained: new Map(),
      today,
      ...NO_CARDIO,
    });
    expect(stats.axes).toHaveLength(12);
  });
});
