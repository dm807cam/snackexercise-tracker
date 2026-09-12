import { describe, expect, it } from "vitest";
import {
  DEFAULT_STEP_BASELINE,
  cyclingMets,
  effectiveDurationSec,
  entryMetMinutes,
  heartRateFactor,
  impliedStepsFromEntries,
  metsForEntry,
  metsFromPace,
  personalStepBaseline,
  runningMets,
  stepMetMinutes,
  stepsForMetMinutes,
  stepWeightFor,
  walkingMets,
  type CardioInput,
} from "@/lib/cardio";

type CardioOverrides = Omit<Partial<CardioInput>, "exercise"> & {
  exercise?: Partial<CardioInput["exercise"]>;
};

function cardio(overrides: CardioOverrides): CardioInput {
  return {
    sets: overrides.sets ?? 1,
    reps: overrides.reps ?? null,
    durationSec: overrides.durationSec ?? null,
    distanceM: overrides.distanceM ?? null,
    avgHeartRate: overrides.avgHeartRate ?? null,
    exercise: {
      cardioBias: overrides.exercise?.cardioBias ?? 1,
      mets: overrides.exercise?.mets ?? null,
      slug: overrides.exercise?.slug,
    },
  };
}

describe("ACSM metabolic equations", () => {
  it("puts ordinary walking at about 3.5 METs", () => {
    // 5 km/h = 83.3 m/min. The Compendium tabulates this as 3.5.
    expect(walkingMets(83.3)).toBeCloseTo(3.4, 1);
  });

  it("puts a 10 km/h run at about 10 METs", () => {
    expect(runningMets(166.7)).toBeCloseTo(10.5, 1);
  });

  it("rises monotonically with speed", () => {
    expect(runningMets(200)).toBeGreaterThan(runningMets(150));
    expect(cyclingMets(25)).toBeGreaterThan(cyclingMets(16));
  });

  it("interpolates cycling between the tabulated bands", () => {
    // Half way between 19 km/h (6.8) and 22 km/h (8.0).
    expect(cyclingMets(20.5)).toBeCloseTo(7.4, 1);
  });

  it("clamps cycling outside the tabulated range instead of extrapolating", () => {
    expect(cyclingMets(-5)).toBe(3);
    expect(cyclingMets(200)).toBe(15.8);
  });
});

describe("metsFromPace", () => {
  it("uses the walking equation below the 107 m/min crossover", () => {
    // 5 km/h for an hour.
    expect(metsFromPace("foot", 5000, 3600)).toBeCloseTo(3.4, 1);
  });

  it("uses the running equation above it", () => {
    // 12 km/h for 30 minutes.
    expect(metsFromPace("foot", 6000, 1800)).toBeCloseTo(12.4, 1);
  });

  it("refuses to divide by zero", () => {
    expect(metsFromPace("foot", 5000, 0)).toBeNull();
    expect(metsFromPace("foot", 0, 1800)).toBeNull();
  });
});

describe("metsForEntry", () => {
  it("prefers heart rate over everything else", () => {
    const hard = metsForEntry(
      cardio({ avgHeartRate: 175, exercise: { mets: 7, slug: "row-erg" } }),
    );
    const easy = metsForEntry(
      cardio({ avgHeartRate: 110, exercise: { mets: 7, slug: "row-erg" } }),
    );
    expect(hard).toBeGreaterThan(7);
    expect(easy).toBeLessThan(7);
  });

  it("falls back to pace when there is no heart rate", () => {
    const entry = cardio({
      distanceM: 6000,
      durationSec: 1800,
      exercise: { mets: 9.8, slug: "run" },
    });
    // The pace says 12 km/h, which is harder than the catalogue's default.
    expect(metsForEntry(entry)).toBeCloseTo(12.4, 1);
  });

  it("ignores pace for a movement that does not travel", () => {
    // A 500 m row is not a 500 m run; there is no pace equation for it, so the
    // catalogue value stands rather than being fed to the wrong formula.
    const entry = cardio({
      distanceM: 500,
      durationSec: 120,
      exercise: { mets: 7, slug: "row-erg" },
    });
    expect(metsForEntry(entry)).toBe(7);
  });

  it("falls back to the catalogue, then to a generic vigorous effort", () => {
    expect(metsForEntry(cardio({ exercise: { mets: 11 } }))).toBe(11);
    expect(metsForEntry(cardio({ exercise: { mets: null } }))).toBe(6);
  });

  it("clamps a wildly implausible heart rate rather than trusting it", () => {
    const absurd = metsForEntry(cardio({ avgHeartRate: 400, exercise: { mets: 9.8 } }));
    expect(absurd).toBeLessThanOrEqual(9.8 * 1.6);
  });

  it("treats a zero or missing heart rate as absent", () => {
    expect(heartRateFactor(0)).toBe(1);
    expect(heartRateFactor(Number.NaN)).toBe(1);
  });
});

describe("effectiveDurationSec", () => {
  it("multiplies a recorded hold by the number of sets", () => {
    expect(effectiveDurationSec({ sets: 3, reps: null, durationSec: 60 })).toBe(180);
  });

  it("imputes three seconds a rep when no duration was recorded", () => {
    expect(effectiveDurationSec({ sets: 3, reps: 15, durationSec: null })).toBe(135);
  });

  it("imputes 45 seconds a set when there are no reps either", () => {
    expect(effectiveDurationSec({ sets: 2, reps: null, durationSec: null })).toBe(90);
  });

  it("caps a single absurd rep count", () => {
    expect(effectiveDurationSec({ sets: 1, reps: 100000, durationSec: null })).toBe(600);
  });

  it("estimates the time of a distance logged without one", () => {
    // "I ran 10k" and nothing else. Falling through to 45 seconds a set would
    // score the run at 7 MET-minutes while still subtracting 13,000 steps from
    // the day's walking credit, so logging it would LOWER the cardio dose.
    const run = { sets: 1, reps: null, durationSec: null, distanceM: 10000, exercise: { slug: "run" } };
    expect(effectiveDurationSec(run)).toBeCloseTo(3593, -2); // ~60 min at 10 km/h
  });

  it("uses a walking speed for a walk and a cycling speed for a ride", () => {
    const walk = { sets: 1, reps: null, durationSec: null, distanceM: 5000, exercise: { slug: "walk" } };
    const ride = { sets: 1, reps: null, durationSec: null, distanceM: 5000, exercise: { slug: "cycle" } };
    expect(effectiveDurationSec(walk)).toBeGreaterThan(effectiveDurationSec(ride));
  });

  it("prefers a recorded duration over the estimate", () => {
    const run = { sets: 1, reps: null, durationSec: 1500, distanceM: 10000, exercise: { slug: "run" } };
    expect(effectiveDurationSec(run)).toBe(1500);
  });

  it("falls back to the per-set estimate for a movement with no assumed speed", () => {
    const odd = { sets: 2, reps: null, durationSec: null, distanceM: 500, exercise: { slug: "sled-push" } };
    expect(effectiveDurationSec(odd)).toBe(90);
  });
});

describe("entryMetMinutes", () => {
  it("scales by how aerobic the movement is", () => {
    const base = { durationSec: 1800, exercise: { mets: 10, cardioBias: 1 } };
    const pure = entryMetMinutes(cardio(base));
    const mixed = entryMetMinutes(cardio({ ...base, exercise: { mets: 10, cardioBias: 0.4 } }));

    expect(pure).toBeCloseTo(300, 0);
    expect(mixed).toBeCloseTo(120, 0);
  });

  it("gives pure strength work no cardio credit at all", () => {
    const entry = entryMetMinutes(
      cardio({ sets: 5, reps: 5, exercise: { cardioBias: 0, mets: 6 } }),
    );
    expect(entry).toBe(0);
  });

  it("scores a distance-only run properly rather than as one 45-second set", () => {
    const run = entryMetMinutes(
      cardio({ distanceM: 10000, exercise: { slug: "run", mets: 9.8, cardioBias: 1 } }),
    );
    // ~60 minutes at the catalogue's 9.8 METs. The assumed pace supplies the
    // duration only — it must not masquerade as a measured pace and change the
    // intensity too.
    expect(run).toBeGreaterThan(500);
    expect(run).toBeLessThan(650);
  });

  it("credits rep-based mixed work that recorded no duration", () => {
    // 3 x 15 burpees: no duration logged, but a real aerobic cost.
    const burpees = entryMetMinutes(
      cardio({ sets: 3, reps: 15, exercise: { cardioBias: 0.5, mets: 8 } }),
    );
    // 135 s of work at 8 METs, halved by the bias.
    expect(burpees).toBeCloseTo(9, 0);
  });
});

describe("step credit", () => {
  const settings = { mode: "half" as const, baseline: 4000 };

  it("credits nothing below the baseline", () => {
    expect(stepMetMinutes(3500, settings)).toBe(0);
    expect(stepMetMinutes(4000, settings)).toBe(0);
  });

  it("credits the excess at incidental walking intensity, discounted by the mode", () => {
    // 10,000 steps: 6,000 excess = 54.5 min at 2.8 METs = 153 MET-min, halved.
    // 2.8 rather than 3.5 because a bare daily step total is kitchen, corridor
    // and shop — the 100+ spm cadence threshold is about a walking BOUT, and
    // says nothing about a day's accumulated total.
    expect(stepMetMinutes(10000, settings)).toBeCloseTo(76.4, 0);
    expect(stepMetMinutes(10000, { ...settings, mode: "full" })).toBeCloseTo(152.7, 0);
    expect(stepMetMinutes(10000, { ...settings, mode: "off" })).toBe(0);
  });

  it("credits minutes the phone called brisk at the brisk rate", () => {
    // The only thing that separates 6,000 extra slow steps from 6,000 extra
    // fast ones, which under one flat rate scored identically.
    const incidental = stepMetMinutes(10000, settings);
    const brisk = stepMetMinutes(10000, settings, 0, 30);

    expect(brisk).toBeGreaterThan(incidental);
    // 30 brisk minutes at 3.5 plus the remaining 24.5 at 2.8, halved.
    expect(brisk).toBeCloseTo((30 * 3.5 + 24.5 * 2.8) / 2, 0);
  });

  it("cannot credit more brisk minutes than the day actually walked", () => {
    // A phone reporting an hour of activity on 6,000 surplus steps is reporting
    // something other than walking; the credit is bounded by the steps.
    const all = stepMetMinutes(10000, settings, 0, 600);
    expect(all).toBeCloseTo((6000 / 110) * 3.5 * 0.5, 0);
  });

  it("says how many steps would fill a share of the ring", () => {
    // "Half weight" tells nobody that about 12,000 steps fills half a day's
    // cardio ring, and that is the fact the setting decides.
    const steps = stepsForMetMinutes(43, settings)!;
    expect(stepMetMinutes(steps, settings)).toBeCloseTo(43, 0);
    expect(stepsForMetMinutes(43, { ...settings, mode: "off" })).toBeNull();
  });

  it("handles a missing count without inventing one", () => {
    expect(stepMetMinutes(null, settings)).toBe(0);
    expect(stepMetMinutes(undefined, settings)).toBe(0);
  });

  it("subtracts steps already logged as cardio", () => {
    const withRun = stepMetMinutes(10000, settings, 7000);
    // Only 6,000 - 7,000 -> nothing left above the baseline.
    expect(withRun).toBe(0);
  });

  it("maps the three modes to their weights", () => {
    expect(stepWeightFor("off")).toBe(0);
    expect(stepWeightFor("half")).toBe(0.5);
    expect(stepWeightFor("full")).toBe(1);
  });
});

describe("personalStepBaseline", () => {
  it("falls back to the fixed default below a fortnight of data", () => {
    expect(personalStepBaseline([9000, 9000, 9000])).toBe(DEFAULT_STEP_BASELINE);
  });

  it("takes the quiet quarter of the user's own days", () => {
    // A nurse: 20 days, quiet quarter around 8,000.
    const days = [
      6000, 7000, 8000, 8000, 9000, 9500, 10000, 11000, 12000, 12000, 13000, 13000, 14000,
      14000, 15000, 15000, 16000, 16000, 17000, 18000,
    ];
    expect(personalStepBaseline(days)).toBe(9000);
  });

  it("never drops below the floor, however sedentary the log", () => {
    const days = new Array(20).fill(500);
    expect(personalStepBaseline(days)).toBe(3000);
  });

  it("ignores zero and missing days rather than counting them as quiet", () => {
    const days = [...new Array(14).fill(0), ...new Array(16).fill(11000)];
    expect(personalStepBaseline(days)).toBe(11000);
  });
});

describe("impliedStepsFromEntries", () => {
  it("converts a logged run's distance back into steps", () => {
    const run = cardio({
      distanceM: 5000,
      durationSec: 1500, // 12 km/h, so a running stride
      exercise: { slug: "run", mets: 9.8, cardioBias: 1 },
    });
    // 5000 / 1.15 m stride.
    expect(impliedStepsFromEntries([run])).toBeCloseTo(4348, -1);
  });

  it("uses cadence when only a duration was logged", () => {
    const walk = cardio({
      durationSec: 3600,
      exercise: { slug: "walk", mets: 3.5, cardioBias: 1 },
    });
    expect(impliedStepsFromEntries([walk])).toBeCloseTo(6600, -1);
  });

  it("counts distance once per set, not once per entry", () => {
    // 6 x 400 m repeats cover 2.4 km. Crediting a single 400 m would leave five
    // reps' worth of steps double-counted against the day's total.
    const repeats = cardio({
      sets: 6,
      durationSec: 90,
      distanceM: 400,
      exercise: { slug: "run", mets: 9.8, cardioBias: 1 },
    });
    expect(impliedStepsFromEntries([repeats])).toBeCloseTo((400 * 6) / 1.15, 0);
  });

  it("ignores cardio that does not involve feet hitting the ground", () => {
    const ride = cardio({
      distanceM: 30000,
      durationSec: 3600,
      exercise: { slug: "cycle", mets: 7.5, cardioBias: 1 },
    });
    const row = cardio({ durationSec: 1800, exercise: { slug: "row-erg", mets: 7 } });
    expect(impliedStepsFromEntries([ride, row])).toBe(0);
  });
});
