import { describe, expect, it } from "vitest";
import {
  buildStats,
  emptyMuscleTotals,
  entryEffectiveSets,
  entryHardSets,
  muscleEffectiveSets,
  muscleWeightSum,
  perWeek,
  rollUpToAxes,
  shadeIntensity,
  summariseDay,
  totalEffectiveSets,
  totalHardSets,
  totalReps,
  totalSets,
  totalTonnage,
  type ScoredEntry,
} from "@/lib/scoring";
import type { AxisSlug } from "@/lib/muscles";
import { buildBalance, effectiveSetEquivalents } from "@/lib/balance";
import { GUIDELINE_TARGETS } from "@/lib/targets";
import { summariseSpacing } from "@/lib/spacing";
import { effortMultiplier } from "@/lib/effort";

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
  spacing: summariseSpacing([]),
  cardioLoadFor: () => 0,
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
    effort: rest.effort ?? null,
    exercise: {
      id: "x1",
      name: "Test",
      cardioBias: rest.exercise?.cardioBias,
      muscles: muscles.map(([muscle, weight]) => ({ muscle, weight })),
    },
  };
}

describe("the scalar dose, normalised", () => {
  /** Deadlift-shaped: six muscles summing to 4.25. */
  const compound = () =>
    entry({
      sets: 2,
      muscles: [
        ["hamstrings", 1],
        ["glutes", 1],
        ["lower-back", 1],
        ["traps", 0.5],
        ["forearms", 0.5],
        ["lats", 0.25],
      ],
    });

  /** Triceps-extension-shaped: one muscle at 1.0. */
  const isolation = () => entry({ sets: 2, muscles: [["triceps", 1]] });

  it("sums a movement's muscle weights", () => {
    expect(muscleWeightSum(compound().exercise)).toBeCloseTo(4.25, 10);
    expect(muscleWeightSum(isolation().exercise)).toBe(1);
  });

  it("scores two sets as two sets, whatever the movement fans out across", () => {
    expect(entryHardSets(compound())).toBe(2);
    expect(entryHardSets(isolation())).toBe(2);
  });

  it("is exactly the effective sets divided back by the fan-out", () => {
    for (const e of [compound(), isolation()]) {
      expect(entryHardSets(e) * muscleWeightSum(e.exercise)).toBeCloseTo(
        entryEffectiveSets(e),
        10,
      );
    }
  });

  it("leaves the per-muscle vector alone, where the fan-out is correct", () => {
    // A deadlift really does train six muscles; only collapsing that into one
    // number made it four and a quarter times the dose of a curl.
    expect(entryEffectiveSets(compound())).toBeCloseTo(8.5, 10);
    expect(entryEffectiveSets(isolation())).toBe(2);
  });

  it("carries the same effort and cardio scaling as the vector does", () => {
    expect(entryHardSets(entry({ sets: 2, effort: "easy", muscles: [["triceps", 1]] }))).toBeCloseTo(
      2 * effortMultiplier("easy"),
      10,
    );
    const swing = entry({
      sets: 10,
      exercise: { id: "x1", name: "Swing", cardioBias: 0.4, muscles: [] },
      muscles: [["glutes", 1], ["hamstrings", 1]],
    });
    expect(entryHardSets(swing)).toBeCloseTo(6, 10);
  });

  it("credits nothing for a movement that maps no muscle at all", () => {
    // It contributes no effective sets either, so a dose would be credit for
    // work the app cannot place anywhere.
    expect(entryHardSets(entry({ sets: 3, muscles: [] }))).toBe(0);
  });

  it("totals across entries", () => {
    expect(totalHardSets([compound(), isolation()])).toBe(4);
  });
});

describe("effort scaling", () => {
  it("discounts a set the user rated as easy", () => {
    const easy = muscleEffectiveSets([entry({ effort: "easy", muscles: [["chest", 1]] })]);
    const hard = muscleEffectiveSets([entry({ effort: "hard", muscles: [["chest", 1]] })]);
    expect(easy.chest).toBeLessThan(hard.chest);
  });

  it("leaves an unrated set worth exactly what it was before the field existed", () => {
    // The guarantee the whole default rests on: adding the column must not
    // restate a year of logged training.
    const unrated = muscleEffectiveSets([entry({ sets: 3, muscles: [["chest", 1], ["triceps", 0.5]] })]);
    expect(unrated.chest).toBe(3);
    expect(unrated.triceps).toBe(1.5);
  });

  it("scales the entry total the same way the per-muscle totals are scaled", () => {
    const easy = entryEffectiveSets(entry({ effort: "easy", muscles: [["chest", 1], ["triceps", 0.5]] }));
    const hard = entryEffectiveSets(entry({ effort: "hard", muscles: [["chest", 1], ["triceps", 0.5]] }));
    expect(easy).toBeCloseTo(hard * effortMultiplier("easy"), 10);
  });

  it("does not let effort resurrect a pure cardio entry's effective sets", () => {
    const run = entry({
      effort: "failure",
      exercise: { id: "x1", name: "Run", cardioBias: 1, muscles: [] },
      muscles: [["quads", 1]],
    });
    expect(entryEffectiveSets(run)).toBe(0);
    expect(muscleEffectiveSets([run]).quads).toBe(0);
  });

  it("reports how much of a window was rated, alongside the totals", () => {
    const stats = buildStats({
      ...NO_CARDIO,
      windowDays: 7,
      start: "2026-09-01",
      end: "2026-09-07",
      current: [
        entry({ id: "a", sets: 2, effort: "hard", muscles: [["chest", 1]] }),
        entry({ id: "b", sets: 2, effort: null, muscles: [["chest", 1]] }),
      ],
      previous: [],
      lastTrained: new Map<AxisSlug, string>(),
      today: "2026-09-07",
    });

    expect(stats.totals.effort.labelled).toBe(2);
    expect(stats.totals.effort.unlabelled).toBe(2);
    expect(stats.totals.effort.labelledFraction).toBe(0.5);
  });
});

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

  it("keeps cardio on its own series instead of adding it to effective sets", () => {
    // A run: pure cardio, so zero effective sets, but a real aerobic load on the
    // calves. The radar has to show the second without inventing the first.
    const run = entry({
      id: "run",
      localDate: "2026-09-05",
      muscles: [["calves", 0.25]],
      exercise: { id: "x1", name: "Run", cardioBias: 1, muscles: [] },
    });

    const stats = buildStats({
      windowDays: 7,
      start: "2026-08-31",
      end: today,
      current: [run],
      previous: [],
      lastTrained: new Map(),
      today,
      ...NO_CARDIO,
      // 400 MET-minutes, which is 40 effective-set-equivalents before the
      // muscle weighting takes its quarter.
      cardioLoadFor: () => effectiveSetEquivalents(400, GUIDELINE_TARGETS),
    });

    // Derived rather than written out: the exchange rate now moves with the
    // user's cardio target, so a hardcoded 10 would pin a number that is only
    // true of the default.
    const expected = effectiveSetEquivalents(400, GUIDELINE_TARGETS) * 0.25;

    const calves = stats.axes.find((a) => a.axis === "calves")!;
    expect(calves.perWeek).toBe(0);
    expect(calves.total).toBe(0);
    expect(calves.cardioTotal).toBeCloseTo(expected, 1);
    expect(calves.cardioPerWeek).toBeCloseTo(expected, 1);

    // And nothing leaks onto an axis the run never touched.
    expect(stats.axes.find((a) => a.axis === "chest")!.cardioPerWeek).toBe(0);
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
