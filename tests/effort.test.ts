import { describe, expect, it } from "vitest";
import {
  EFFORT_LEVELS,
  UNLABELLED_EFFORT_MULTIPLIER,
  effortBreakdown,
  effortHint,
  effortLabel,
  effortMultiplier,
  isEffort,
  isHardSet,
} from "@/lib/effort";

describe("isEffort", () => {
  it("accepts the three levels and nothing else", () => {
    for (const level of EFFORT_LEVELS) expect(isEffort(level)).toBe(true);
    expect(isEffort("rir2")).toBe(false);
    expect(isEffort(null)).toBe(false);
    expect(isEffort(undefined)).toBe(false);
    expect(isEffort(3)).toBe(false);
  });
});

describe("effortMultiplier", () => {
  it("discounts a set well short of failure without zeroing it", () => {
    expect(effortMultiplier("easy")).toBeGreaterThan(0);
    expect(effortMultiplier("easy")).toBeLessThan(effortMultiplier("hard"));
  });

  it("treats a hard set as the unit, which is what the targets are calibrated to", () => {
    expect(effortMultiplier("hard")).toBe(1);
  });

  it("pays barely anything extra for going past failure", () => {
    // The hypertrophy curve is close to flat past a couple of reps in reserve
    // while the fatigue cost is not, so this must not become a reason to train
    // to failure every set.
    expect(effortMultiplier("failure")).toBeGreaterThanOrEqual(1);
    expect(effortMultiplier("failure")).toBeLessThanOrEqual(1.1);
  });

  it("counts an unrated set as a hard one, so adding the field rewrote no history", () => {
    expect(effortMultiplier(null)).toBe(UNLABELLED_EFFORT_MULTIPLIER);
    expect(effortMultiplier(undefined)).toBe(effortMultiplier("hard"));
    expect(effortMultiplier("nonsense")).toBe(effortMultiplier("hard"));
  });
});

describe("isHardSet", () => {
  it("is true for hard and failure only", () => {
    expect(isHardSet("hard")).toBe(true);
    expect(isHardSet("failure")).toBe(true);
    expect(isHardSet("easy")).toBe(false);
    // Unrated is counted as hard for volume, but it is not *known* to be one.
    expect(isHardSet(null)).toBe(false);
  });
});

describe("labels", () => {
  it("names every level, and says plainly when there is nothing to name", () => {
    expect(effortLabel("easy")).toBe("Easy");
    expect(effortLabel("hard")).toBe("Hard");
    expect(effortLabel("failure")).toBe("To failure");
    expect(effortLabel(null)).toBe("Not recorded");
  });

  it("explains each level in reps-in-reserve terms", () => {
    for (const level of EFFORT_LEVELS) expect(effortHint(level).length).toBeGreaterThan(0);
  });
});

function set(sets: number, effort: string | null, cardioBias = 0) {
  return { sets, effort, exercise: { cardioBias } };
}

describe("effortBreakdown", () => {
  it("counts sets rather than entries", () => {
    const result = effortBreakdown([set(3, "hard"), set(2, "easy")]);
    expect(result.hard).toBe(3);
    expect(result.easy).toBe(2);
    expect(result.labelled).toBe(5);
    expect(result.unlabelled).toBe(0);
    expect(result.labelledFraction).toBe(1);
  });

  it("separates rated from unrated", () => {
    const result = effortBreakdown([set(1, "failure"), set(3, null)]);
    expect(result.failure).toBe(1);
    expect(result.labelled).toBe(1);
    expect(result.unlabelled).toBe(3);
    expect(result.labelledFraction).toBe(0.25);
  });

  it("ignores pure cardio, which has no proximity to failure to record", () => {
    // Otherwise the labelled fraction would fall the more the user ran, and the
    // stats page would nag about rating sets that cannot be rated.
    const result = effortBreakdown([set(1, "hard"), set(1, null, 1)]);
    expect(result.labelled).toBe(1);
    expect(result.unlabelled).toBe(0);
    expect(result.labelledFraction).toBe(1);
  });

  it("still counts partly-aerobic movements, which do carry resistance work", () => {
    const result = effortBreakdown([set(2, "easy", 0.4)]);
    expect(result.easy).toBe(2);
  });

  it("reports zero rather than dividing by nothing on an empty window", () => {
    expect(effortBreakdown([]).labelledFraction).toBe(0);
  });

  it("treats a zero or missing set count as one set", () => {
    expect(effortBreakdown([set(0, "hard")]).hard).toBe(1);
  });
});
