import { describe, expect, it } from "vitest";
import {
  EFFECTIVE_SETS_PER_HARD_SET,
  GUIDELINE_FLOOR_MET_MIN_PER_WEEK,
  GUIDELINE_TARGETS,
  LONGEVITY_TARGETS,
  MAX_CARDIO_TARGET,
  MAX_STRENGTH_TARGET,
  MIN_CARDIO_TARGET,
  MIN_STRENGTH_TARGET,
  effectiveSetEquivalents,
  metMinutesPerEffectiveSet,
  normaliseTargets,
  presetFor,
  presetTargets,
} from "@/lib/targets";

describe("the presets", () => {
  it("defaults to the public-health guideline, not to something the app invented", () => {
    expect(GUIDELINE_TARGETS.cardioMetMinutesPerWeek).toBe(GUIDELINE_FLOOR_MET_MIN_PER_WEEK);
  });

  it("raises cardio for longevity", () => {
    // 600 is the WHO minimum; the cohort studies put the lowest mortality at
    // 1200-2400, so the guideline target captured about half the benefit.
    expect(LONGEVITY_TARGETS.cardioMetMinutesPerWeek).toBeGreaterThan(
      GUIDELINE_TARGETS.cardioMetMinutesPerWeek,
    );
  });

  it("leaves strength alone for longevity, which is the whole point", () => {
    // The mortality-optimal resistance dose is LOWER than the hypertrophy one
    // (Momma 2022), so a longevity preset that moved strength would have to
    // move it down — away from the goal this app exists to serve.
    expect(LONGEVITY_TARGETS.strengthHardSetsPerWeek).toBe(
      GUIDELINE_TARGETS.strengthHardSetsPerWeek,
    );
  });

  it("names itself back", () => {
    expect(presetFor(GUIDELINE_TARGETS)).toBe("guideline");
    expect(presetFor(LONGEVITY_TARGETS)).toBe("longevity");
    expect(presetFor({ cardioMetMinutesPerWeek: 900, strengthHardSetsPerWeek: 30 })).toBe("custom");
  });

  it("resolves an unknown preset to the guideline rather than to nothing", () => {
    expect(presetTargets("custom")).toEqual(GUIDELINE_TARGETS);
  });
});

describe("normaliseTargets", () => {
  it("keeps sensible numbers", () => {
    const targets = normaliseTargets({
      cardioMetMinutesPerWeek: 900,
      strengthHardSetsPerWeek: 35,
    });
    expect(targets).toEqual({ cardioMetMinutesPerWeek: 900, strengthHardSetsPerWeek: 35 });
  });

  it("falls back per side, so one bad field does not reset the other", () => {
    const targets = normaliseTargets({
      cardioMetMinutesPerWeek: Number.NaN,
      strengthHardSetsPerWeek: 35,
    });
    expect(targets.cardioMetMinutesPerWeek).toBe(GUIDELINE_TARGETS.cardioMetMinutesPerWeek);
    expect(targets.strengthHardSetsPerWeek).toBe(35);
  });

  it("falls back entirely on nothing at all", () => {
    expect(normaliseTargets(null)).toEqual(GUIDELINE_TARGETS);
    expect(normaliseTargets({})).toEqual(GUIDELINE_TARGETS);
  });

  it("clamps, so a typo cannot make a ring impossible or trivial", () => {
    const low = normaliseTargets({ cardioMetMinutesPerWeek: 1, strengthHardSetsPerWeek: 1 });
    expect(low.cardioMetMinutesPerWeek).toBe(MIN_CARDIO_TARGET);
    expect(low.strengthHardSetsPerWeek).toBe(MIN_STRENGTH_TARGET);

    const high = normaliseTargets({
      cardioMetMinutesPerWeek: 99999,
      strengthHardSetsPerWeek: 9999,
    });
    expect(high.cardioMetMinutesPerWeek).toBe(MAX_CARDIO_TARGET);
    expect(high.strengthHardSetsPerWeek).toBe(MAX_STRENGTH_TARGET);
  });
});

describe("the exchange rate", () => {
  it("is an equal share of each side's week", () => {
    // One effective set is the same fraction of the strength target as its
    // MET-minute equivalent is of the cardio target. That identity is the
    // entire justification for drawing both on one radial scale.
    const rate = metMinutesPerEffectiveSet(GUIDELINE_TARGETS);
    const strengthOnDrawingScale =
      GUIDELINE_TARGETS.strengthHardSetsPerWeek * EFFECTIVE_SETS_PER_HARD_SET;

    expect(1 / strengthOnDrawingScale).toBeCloseTo(
      rate / GUIDELINE_TARGETS.cardioMetMinutesPerWeek,
      10,
    );
  });

  it("moves with the cardio target, which is deliberate", () => {
    // Raising the target really does make a given run a smaller share of the
    // week, so the radar's cardio line and the calendar's shading redraw.
    expect(metMinutesPerEffectiveSet(LONGEVITY_TARGETS)).toBeCloseTo(
      metMinutesPerEffectiveSet(GUIDELINE_TARGETS) * 2,
      5,
    );
    expect(effectiveSetEquivalents(600, LONGEVITY_TARGETS)).toBeCloseTo(
      effectiveSetEquivalents(600, GUIDELINE_TARGETS) / 2,
      5,
    );
  });

  it("does not divide by zero if a target is somehow empty", () => {
    expect(
      Number.isFinite(
        metMinutesPerEffectiveSet({ cardioMetMinutesPerWeek: 600, strengthHardSetsPerWeek: 0 }),
      ),
    ).toBe(true);
  });
});

describe("the guideline floor", () => {
  it("does not move when the target does", () => {
    // "You met the public-health guideline" and "you met the goal you set" are
    // different sentences; collapsing them meant raising your sights erased the
    // first one entirely.
    expect(GUIDELINE_FLOOR_MET_MIN_PER_WEEK).toBe(600);
    expect(LONGEVITY_TARGETS.cardioMetMinutesPerWeek).toBeGreaterThan(
      GUIDELINE_FLOOR_MET_MIN_PER_WEEK,
    );
  });
});
