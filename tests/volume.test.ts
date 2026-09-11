import { describe, expect, it } from "vitest";
import {
  ATTENTION_VOLUME_FRACTION,
  MAX_PER_MUSCLE_TARGET,
  MIN_PER_MUSCLE_TARGET,
  PER_MUSCLE_TARGET_SETS_PER_WEEK,
  axisVolumeTarget,
  isBelowTargetVolume,
  radarScale,
  normalisePerMuscleTarget,
  volumeDeficit,
} from "@/lib/volume";
import { AXES, MUSCLES } from "@/lib/muscles";

describe("axisVolumeTarget", () => {
  it("scales one literature number by how many muscles a spoke rolls up", () => {
    // Chest is one muscle; shoulders is front, side and rear delts. One target
    // per muscle means the spokes want different totals, and pretending
    // otherwise would make a single ring mean three different things.
    expect(axisVolumeTarget("chest")).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK);
    expect(axisVolumeTarget("shoulders")).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK * 3);
    expect(axisVolumeTarget("back")).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK * 3);
    expect(axisVolumeTarget("core")).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK * 2);
  });

  it("is met exactly when every muscle in the axis is at the per-muscle target", () => {
    for (const { slug } of AXES) {
      const muscles = MUSCLES.filter((m) => m.axis === slug).length;
      expect(axisVolumeTarget(slug, 7)).toBe(muscles * 7);
    }
  });

  it("moves with a configured target", () => {
    expect(axisVolumeTarget("chest", 16)).toBe(16);
    expect(axisVolumeTarget("core", 16)).toBe(32);
  });

  it("gives every axis a positive target, so no spoke is unscoreable", () => {
    for (const { slug } of AXES) expect(axisVolumeTarget(slug)).toBeGreaterThan(0);
  });
});

describe("normalisePerMuscleTarget", () => {
  it("keeps a sensible value", () => {
    expect(normalisePerMuscleTarget(14)).toBe(14);
  });

  it("falls back rather than drawing a chart against nothing", () => {
    expect(normalisePerMuscleTarget(null)).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK);
    expect(normalisePerMuscleTarget(Number.NaN)).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK);
    expect(normalisePerMuscleTarget(0)).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK);
    expect(normalisePerMuscleTarget(-5)).toBe(PER_MUSCLE_TARGET_SETS_PER_WEEK);
  });

  it("clamps, so a typo cannot make every spoke permanently full or permanently empty", () => {
    expect(normalisePerMuscleTarget(1)).toBe(MIN_PER_MUSCLE_TARGET);
    expect(normalisePerMuscleTarget(900)).toBe(MAX_PER_MUSCLE_TARGET);
  });

  it("rounds, since a chart reference of 10.3 sets is not a thing anyone means", () => {
    expect(normalisePerMuscleTarget(10.4)).toBe(10);
  });
});

describe("volumeDeficit", () => {
  it("is zero once the target is reached, not once a rival axis is matched", () => {
    // The defect this replaces: someone doing one easy set per group per day
    // had a deficit of zero everywhere, because every axis matched the busiest.
    expect(volumeDeficit(10, 10)).toBe(0);
    expect(volumeDeficit(30, 10)).toBe(0);
  });

  it("is one when nothing has been done", () => {
    expect(volumeDeficit(0, 10)).toBe(1);
  });

  it("scales linearly in between", () => {
    expect(volumeDeficit(4, 10)).toBeCloseTo(0.6, 10);
  });

  it("does not punish a genuinely good axis for being beside a better one", () => {
    // 8 hamstring sets a week beside 30 on chest used to score 0.73 deficit.
    // Against hamstrings' own requirement it is nearly there.
    expect(volumeDeficit(8, 10)).toBeCloseTo(0.2, 10);
  });

  it("treats a missing or nonsense target as a total deficit rather than dividing by it", () => {
    expect(volumeDeficit(5, 0)).toBe(1);
    expect(volumeDeficit(Number.NaN, 10)).toBe(1);
  });
});

describe("isBelowTargetVolume", () => {
  it("flags an axis that is trained but nowhere near a useful dose", () => {
    // The other half of the same gap: "needs attention" was ordered purely by
    // staleness, so this axis — touched daily, at a fifth of a useful volume —
    // could never appear in it.
    expect(isBelowTargetVolume(2, 10)).toBe(true);
  });

  it("leaves an axis alone once it is close", () => {
    expect(isBelowTargetVolume(10 * ATTENTION_VOLUME_FRACTION, 10)).toBe(false);
    expect(isBelowTargetVolume(10, 10)).toBe(false);
  });

  it("says nothing about an axis with no target to be below", () => {
    expect(isBelowTargetVolume(0, 0)).toBe(false);
  });
});

describe("radarScale", () => {
  it("fits the data and the target, so an under-trained log draws inside the ring", () => {
    const { max } = radarScale([3, 4, 30], [60]);
    expect(max).toBe(30);
  });

  it("hides an upper bound the scale cannot hold", () => {
    // recharts does not clip: an out-of-domain datum is projected past the
    // outer radius, through the spoke labels and off the edge of the SVG.
    expect(radarScale([3, 30], [60]).showUpper).toBe(false);
  });

  it("shows it once the user's own volume has reached it", () => {
    const { max, showUpper } = radarScale([70, 30], [60]);
    expect(max).toBe(70);
    expect(showUpper).toBe(true);
  });

  it("shows it when it lands exactly on the edge", () => {
    expect(radarScale([60, 30], [60]).showUpper).toBe(true);
  });

  it("never returns a zero domain, which would divide the whole chart by nothing", () => {
    expect(radarScale([], []).max).toBe(1);
    expect(radarScale([0, 0], []).max).toBe(1);
  });

  it("ignores nonsense rather than propagating it into the domain", () => {
    expect(radarScale([5, Number.NaN], [Number.NaN]).max).toBe(5);
    expect(radarScale([5], []).showUpper).toBe(false);
  });
});
