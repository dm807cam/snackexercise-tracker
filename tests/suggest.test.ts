import { describe, expect, it } from "vitest";
import {
  buildSuggestion,
  chooseExercise,
  rankAxes,
  spacingNudge,
  type ExerciseChoice,
} from "@/lib/suggest";
import { axisForMuscle, type AxisSlug } from "@/lib/muscles";
import { AXES } from "@/lib/muscles";
import type { AxisStat } from "@/lib/scoring";
import { axisVolumeTarget } from "@/lib/volume";

function axis(slug: AxisSlug, overrides: Partial<AxisStat> = {}): AxisStat {
  return {
    axis: slug,
    perWeek: 0,
    previousPerWeek: 0,
    cardioPerWeek: 0,
    previousCardioPerWeek: 0,
    total: 0,
    cardioTotal: 0,
    daysSinceTrained: 0,
    targetPerWeek: axisVolumeTarget(slug),
    upperPerWeek: axisVolumeTarget(slug) * 2,
    ...overrides,
  };
}

/** Every axis trained today at the same volume, so nothing stands out. */
function levelAxes(perWeek = 10): AxisStat[] {
  return AXES.map((a) => axis(a.slug, { perWeek, daysSinceTrained: 0 }));
}

const CATALOGUE: ExerciseChoice[] = [
  {
    id: "pullup",
    name: "Pull-up",
    slug: "pull-up",
    cardioBias: 0,
    muscles: [
      { muscle: "lats", weight: 1 },
      { muscle: "mid-back", weight: 0.5 },
      { muscle: "biceps", weight: 0.5 },
    ],
  },
  {
    id: "row",
    name: "Dumbbell row",
    slug: "dumbbell-row",
    cardioBias: 0,
    muscles: [{ muscle: "lats", weight: 0.5 }],
  },
  {
    id: "curl",
    name: "Curl",
    slug: "curl",
    cardioBias: 0,
    muscles: [{ muscle: "biceps", weight: 1 }],
  },
  {
    id: "run",
    name: "Run",
    slug: "run",
    cardioBias: 1,
    muscles: [
      { muscle: "quads", weight: 0.25 },
      { muscle: "calves", weight: 0.25 },
    ],
  },
  {
    id: "swing",
    name: "Kettlebell swing",
    slug: "kettlebell-swing",
    cardioBias: 0.4,
    muscles: [
      { muscle: "glutes", weight: 1 },
      { muscle: "hamstrings", weight: 0.5 },
    ],
  },
];

describe("rankAxes", () => {
  it("puts the longest-neglected muscle group first", () => {
    const axes = levelAxes();
    axes[axes.findIndex((a) => a.axis === "back")] = axis("back", {
      perWeek: 10,
      daysSinceTrained: 9,
    });

    const ranked = rankAxes({ axes, daysSinceCardio: 0, cardioMetMinutesPerWeek: 600 });
    expect(ranked[0].axis).toBe("back");
  });

  it("breaks a tie on staleness with the thinner weekly volume", () => {
    const axes = AXES.map((a) => axis(a.slug, { perWeek: 20, daysSinceTrained: 2 }));
    axes[axes.findIndex((a) => a.axis === "calves")] = axis("calves", {
      perWeek: 1,
      daysSinceTrained: 2,
    });

    const ranked = rankAxes({ axes, daysSinceCardio: 2, cardioMetMinutesPerWeek: 600 });
    expect(ranked[0].axis).toBe("calves");
  });

  it("treats never-trained as the stalest thing there is, not as missing data", () => {
    const axes = levelAxes();
    axes[axes.findIndex((a) => a.axis === "calves")] = axis("calves", {
      daysSinceTrained: null,
    });

    const ranked = rankAxes({ axes, daysSinceCardio: 0, cardioMetMinutesPerWeek: 600 });
    expect(ranked[0].axis).toBe("calves");
  });

  it("lets cardio win when it is the thing being neglected", () => {
    // Two weeks of lifting and no running should not produce a thirteenth way
    // of saying "back".
    const ranked = rankAxes({
      axes: levelAxes(),
      daysSinceCardio: 12,
      cardioMetMinutesPerWeek: 20,
    });
    expect(ranked[0].axis).toBeNull();
    expect(ranked[0].label).toBe("Cardio");
  });

  it("leaves cardio alone when the cardio side is already on target", () => {
    const ranked = rankAxes({
      axes: levelAxes(),
      daysSinceCardio: 0,
      cardioMetMinutesPerWeek: 900,
    });
    expect(ranked[0].axis).not.toBeNull();
  });
});

describe("chooseExercise", () => {
  it("picks the movement that trains the axis hardest", () => {
    const choice = chooseExercise("back", CATALOGUE, [], axisForMuscle);
    expect(choice?.id).toBe("pullup");
  });

  it("prefers a movement you actually use when two serve the axis equally", () => {
    const tied: ExerciseChoice[] = [
      { ...CATALOGUE[1], id: "a", name: "A" },
      { ...CATALOGUE[1], id: "b", name: "B" },
    ];
    expect(chooseExercise("back", tied, ["b"], axisForMuscle)?.id).toBe("b");
  });

  it("never answers a strength deficit with pure cardio", () => {
    // Run maps to quads, but its effective sets are zeroed everywhere else, so
    // suggesting it could not move the number the suggestion is about.
    const choice = chooseExercise("quads", [CATALOGUE[3]], [], axisForMuscle);
    expect(choice).toBeNull();
  });

  it("answers a cardio deficit with something unambiguously aerobic", () => {
    const choice = chooseExercise(null, CATALOGUE, [], axisForMuscle);
    expect(choice?.id).toBe("run");
  });

  it("returns null rather than a bad fit when nothing serves the axis", () => {
    expect(chooseExercise("neck" as AxisSlug, CATALOGUE, [], axisForMuscle)).toBeNull();
  });
});

describe("spacingNudge", () => {
  const window = { startHour: 8, endHour: 22 };

  it("says nothing while you are still inside the ideal gap", () => {
    expect(
      spacingNudge({ nowMin: 13 * 60, boutMinutes: [12 * 60 + 30], window }),
    ).toBeNull();
  });

  it("speaks up once the gap since the last snack exceeds the ideal spacing", () => {
    const nudge = spacingNudge({ nowMin: 16 * 60, boutMinutes: [12 * 60], window });
    expect(nudge).toBe("4h since your last snack");
  });

  it("stays quiet outside waking hours", () => {
    expect(spacingNudge({ nowMin: 2 * 60, boutMinutes: [], window })).toBeNull();
  });

  it("counts an empty day from the start of the window", () => {
    expect(spacingNudge({ nowMin: 9 * 60, boutMinutes: [], window })).toBeNull();
    expect(spacingNudge({ nowMin: 15 * 60, boutMinutes: [], window })).toBe(
      "Nothing logged so far today",
    );
  });
});

describe("buildSuggestion", () => {
  it("names a group, a movement and its reason, with alternatives", () => {
    const axes = levelAxes();
    axes[axes.findIndex((a) => a.axis === "back")] = axis("back", {
      perWeek: 0,
      daysSinceTrained: 8,
    });

    const suggestion = buildSuggestion({
      axes,
      daysSinceCardio: 0,
      cardioMetMinutesPerWeek: 700,
      exercises: CATALOGUE,
      recentIds: [],
      axisOf: axisForMuscle,
    });

    expect(suggestion.primary.label).toBe("Back");
    expect(suggestion.exercise?.name).toBe("Pull-up");
    expect(suggestion.reason).toBe("8 days since you trained it");
    expect(suggestion.alternatives).toHaveLength(2);
    expect(suggestion.nudge).toBeNull();
  });

  it("carries the timing nudge when one is due", () => {
    const suggestion = buildSuggestion({
      axes: levelAxes(),
      daysSinceCardio: 0,
      cardioMetMinutesPerWeek: 700,
      exercises: CATALOGUE,
      recentIds: [],
      axisOf: axisForMuscle,
      now: { nowMin: 18 * 60, boutMinutes: [9 * 60], window: { startHour: 8, endHour: 22 } },
    });
    expect(suggestion.nudge).toBe("9h since your last snack");
  });
});

describe("the deficit is measured against what an axis needs", () => {
  it("still finds something to suggest when everything is equally under-trained", () => {
    // The headline defect. Under the old relative form every axis matched the
    // busiest, so every deficit was 0 and the ranking collapsed to staleness —
    // which on a log where everything was trained today is no signal at all.
    const ranked = rankAxes({
      axes: levelAxes(3),
      daysSinceCardio: 0,
      cardioMetMinutesPerWeek: 600,
    });

    const strength = ranked.filter((c) => c.axis !== null);
    expect(strength[0].score).toBeGreaterThan(0);
    // And it picks the axis furthest below its own requirement, which at equal
    // volume is one of the three-muscle spokes.
    expect(["shoulders", "back"]).toContain(strength[0].axis);
  });

  it("stops nudging toward an axis that is already on target", () => {
    const onTarget = AXES.map((a) =>
      axis(a.slug, { perWeek: axisVolumeTarget(a.slug) * 2, daysSinceTrained: 0 }),
    );
    const ranked = rankAxes({
      axes: onTarget,
      daysSinceCardio: 0,
      cardioMetMinutesPerWeek: 600,
    });

    for (const candidate of ranked) expect(candidate.score).toBe(0);
  });

  it("does not nudge toward a well-served axis merely because another is busier", () => {
    // 30 sets on chest and 8 on hamstrings: hamstrings used to score a 0.73
    // deficit against chest, though 8 is a perfectly good hamstring week.
    const axes = [
      axis("chest", { perWeek: 30, daysSinceTrained: 0 }),
      axis("hamstrings", { perWeek: 8, daysSinceTrained: 0 }),
    ];
    const ranked = rankAxes({ axes, daysSinceCardio: 0, cardioMetMinutesPerWeek: 600 });
    const hamstrings = ranked.find((c) => c.axis === "hamstrings")!;

    // Both are on or near target, so neither is urgent.
    expect(hamstrings.score).toBeLessThan(0.15);
  });

  it("explains a same-day pick by the shortfall rather than by a comparison", () => {
    const thin = rankAxes({
      axes: [axis("chest", { perWeek: 1, daysSinceTrained: 0 })],
      daysSinceCardio: 0,
      cardioMetMinutesPerWeek: 600,
    });
    const suggestion = buildSuggestion({
      axes: [axis("chest", { perWeek: 1, daysSinceTrained: 0 })],
      daysSinceCardio: 0,
      cardioMetMinutesPerWeek: 600,
      exercises: CATALOGUE,
      recentIds: [],
      axisOf: axisForMuscle,
    });

    expect(thin[0].axis).toBe("chest");
    // "least volume this window" was true of something on every possible log,
    // including one where everything was already on target.
    expect(suggestion.reason).toBe("below its weekly volume target");
  });
});
