import { describe, expect, it } from "vitest";
import {
  E1RM_REP_CAP,
  MIN_SESSIONS_FOR_STALL,
  STALL_RECENCY_DAYS,
  STALL_WEEKS,
  buildExerciseProgress,
  describeSet,
  entryValue,
  estimatedOneRepMax,
  metricFor,
  nextRung,
  progressionSeries,
  progressionTrend,
  type ProgressionEntry,
} from "@/lib/progression";
import { EXERCISE_CATALOGUE } from "@/prisma/exercise-catalogue";
import { slugify } from "@/lib/slug";

function entry(overrides: Partial<ProgressionEntry> & { localDate: string }): ProgressionEntry {
  return {
    sets: 1,
    reps: null,
    weightKg: null,
    durationSec: null,
    ...overrides,
  };
}

describe("estimatedOneRepMax", () => {
  it("is Epley", () => {
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 10);
  });

  it("rises with reps at a fixed load, which is what overload looks like", () => {
    expect(estimatedOneRepMax(60, 8)).toBeGreaterThan(estimatedOneRepMax(60, 5));
  });

  it("caps the rep term rather than letting a high-rep set invent a max", () => {
    // Epley is fitted on low-rep work; a set of 30 would otherwise come out at
    // twice the load actually handled. Uncapped Epley gives 50 x (1 + 30/30) =
    // 100; the capped form must stay well under it.
    const uncapped = 50 * (1 + 30 / 30);
    expect(estimatedOneRepMax(50, 30)).toBeLessThan(uncapped * 0.85);
    expect(estimatedOneRepMax(50, 30)).toBeGreaterThan(estimatedOneRepMax(50, E1RM_REP_CAP));
  });

  it("still rises past the cap, so more reps at the same load reads as progress", () => {
    // A flat cap made every loaded set above twelve reps identical, so going
    // from 20 kg x 12 to 20 kg x 20 read as a flat series — flagged stalled,
    // listed in "needs attention", and upgraded up the ladder for no reason.
    const twelve = estimatedOneRepMax(20, 12);
    const twenty = estimatedOneRepMax(20, 20);

    expect(twenty).toBeGreaterThan(twelve);
    // And only just: it must not start claiming a bigger maximum.
    expect(twenty).toBeLessThan(twelve * 1.1);
  });

  it("is strictly increasing in reps at every point", () => {
    for (let reps = 1; reps < 40; reps++) {
      expect(estimatedOneRepMax(60, reps + 1)).toBeGreaterThan(estimatedOneRepMax(60, reps));
    }
  });

  it("is zero without both a load and reps", () => {
    expect(estimatedOneRepMax(0, 5)).toBe(0);
    expect(estimatedOneRepMax(60, 0)).toBe(0);
  });
});

describe("metricFor", () => {
  it("prefers load, the least ambiguous evidence of overload", () => {
    const entries = [
      entry({ localDate: "2026-09-01", reps: 10 }),
      entry({ localDate: "2026-09-02", reps: 5, weightKg: 60 }),
    ];
    expect(metricFor(entries)).toBe("e1rm");
  });

  it("falls back to reps, which is how a fixed-load movement progresses", () => {
    expect(metricFor([entry({ localDate: "2026-09-01", reps: 10 })])).toBe("reps");
  });

  it("uses duration for holds", () => {
    expect(metricFor([entry({ localDate: "2026-09-01", durationSec: 60 })])).toBe("hold");
  });

  it("has nothing to say about a log carrying no numbers", () => {
    // "Did some pull-ups" is a perfectly good entry and simply cannot be a
    // progression series.
    expect(metricFor([entry({ localDate: "2026-09-01" })])).toBeNull();
    expect(metricFor([])).toBeNull();
  });

  it("does not treat a bodyweight entry as loaded just because weight is zero", () => {
    expect(metricFor([entry({ localDate: "2026-09-01", reps: 10, weightKg: 0 })])).toBe("reps");
  });

  it("does not let one belted set erase a year of bodyweight work", () => {
    // Choosing e1rm here nulls every bodyweight day, because they carry no load
    // to estimate from — twenty sessions would collapse to a series of one.
    const entries = [
      ...Array.from({ length: 20 }, (_, i) =>
        entry({ localDate: `2026-0${1 + Math.floor(i / 10)}-${String(1 + (i % 10)).padStart(2, "0")}`, reps: 8 }),
      ),
      entry({ localDate: "2026-09-01", reps: 5, weightKg: 10 }),
    ];
    expect(metricFor(entries)).toBe("reps");
    expect(progressionSeries(entries, metricFor(entries)!)).toHaveLength(21);
  });

  it("still uses load when that is how the movement is normally logged", () => {
    const entries = [
      entry({ localDate: "2026-09-01", reps: 5, weightKg: 60 }),
      entry({ localDate: "2026-09-02", reps: 5, weightKg: 62.5 }),
      entry({ localDate: "2026-09-03", reps: 8 }),
    ];
    expect(metricFor(entries)).toBe("e1rm");
  });
});

describe("entryValue", () => {
  it("reads reps as the best single set, not the day's volume", () => {
    // Total reps rise when you simply do more sets, which is volume and is
    // measured elsewhere. The best single set is what has to move.
    expect(entryValue(entry({ localDate: "2026-09-01", sets: 5, reps: 10 }), "reps")).toBe(10);
  });

  it("is null where the entry carries nothing on that metric", () => {
    expect(entryValue(entry({ localDate: "2026-09-01", reps: 10 }), "e1rm")).toBeNull();
    expect(entryValue(entry({ localDate: "2026-09-01", reps: 10 }), "hold")).toBeNull();
  });
});

describe("progressionSeries", () => {
  it("keeps the best set of each day, ascending", () => {
    const series = progressionSeries(
      [
        entry({ localDate: "2026-09-02", reps: 8 }),
        entry({ localDate: "2026-09-01", reps: 12 }),
        entry({ localDate: "2026-09-02", reps: 14 }),
      ],
      "reps",
    );

    expect(series.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(series.map((p) => p.value)).toEqual([12, 14]);
  });

  it("skips entries that carry nothing on the metric rather than scoring them zero", () => {
    const series = progressionSeries(
      [entry({ localDate: "2026-09-01", reps: 10 }), entry({ localDate: "2026-09-02" })],
      "reps",
    );
    expect(series).toHaveLength(1);
  });

  it("describes how the best set was actually logged", () => {
    const series = progressionSeries(
      [entry({ localDate: "2026-09-01", sets: 3, reps: 10 })],
      "reps",
    );
    expect(series[0].detail).toBe("3 x 10");
  });
});

describe("progressionTrend", () => {
  const TODAY = "2026-09-10";

  /** Weekly sessions at the same value, the last one `endedDaysAgo` before TODAY. */
  function flat(weeks: number, value = 10, endedDaysAgo = 3) {
    const end = new Date(`${TODAY}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - endedDaysAgo);

    return Array.from({ length: weeks }, (_, i) => {
      const day = new Date(end);
      day.setUTCDate(day.getUTCDate() - (weeks - 1 - i) * 7);
      return { date: day.toISOString().slice(0, 10), value, detail: "3 x 10" };
    });
  }

  it("anchors the best on the FIRST day it was reached", () => {
    // "How long has it stood" is measured from when it was set, so a repeat of
    // the same best must not restart the clock.
    const trend = progressionTrend(
      [
        { date: "2026-07-01", value: 10, detail: "10" },
        { date: "2026-09-01", value: 10, detail: "10" },
      ],
      TODAY,
    )!;
    expect(trend.best.date).toBe("2026-07-01");
  });

  it("measures every age from today, not from the last session logged", () => {
    // A March best, last trained three days later, would otherwise read as set
    // "this week" in September.
    const trend = progressionTrend(
      [
        { date: "2026-03-01", value: 10, detail: "10" },
        { date: "2026-03-04", value: 10, detail: "10" },
      ],
      TODAY,
    )!;
    expect(trend.weeksFlat).toBeGreaterThan(26);
    expect(trend.daysSinceTrained).toBeGreaterThan(180);
  });

  it("flags a movement trained often and long without the best moving", () => {
    const trend = progressionTrend(flat(8), TODAY)!;
    expect(trend.sessions).toBeGreaterThanOrEqual(MIN_SESSIONS_FOR_STALL);
    expect(trend.weeksFlat).toBeGreaterThanOrEqual(STALL_WEEKS);
    expect(trend.stalled).toBe(true);
  });

  it("measures recency from the last day TRAINED, not the last day on the metric", () => {
    // An e1rm movement mostly logged bodyweight has a sparse series, so reading
    // recency off the series would call a current stall abandoned and suppress
    // it. The last day trained is passed in separately for exactly this.
    const stale = progressionTrend(flat(8, 10, 60), TODAY, TODAY)!;
    expect(stale.daysSinceTrained).toBe(0);
    expect(stale.stalled).toBe(true);
  });

  it("stops calling it stalled once the user has moved on", () => {
    // Otherwise the stall LATCHES: follow the app's advice, switch to diamond
    // push-ups, and "Push-up - 7w flat" sits in "needs attention" for months
    // while the bar keeps offering a step up you already took.
    const abandoned = progressionTrend(flat(8, 10, STALL_RECENCY_DAYS + 7), TODAY)!;
    expect(abandoned.daysSinceTrained).toBeGreaterThan(STALL_RECENCY_DAYS);
    expect(abandoned.stalled).toBe(false);
  });

  it("does not call a movement stalled on two sessions a fortnight apart", () => {
    // Too little evidence. Calling that a plateau would be the app inventing a
    // problem out of an ordinary gap.
    const trend = progressionTrend(
      [
        { date: "2026-08-20", value: 10, detail: "10" },
        { date: "2026-09-03", value: 10, detail: "10" },
      ],
      TODAY,
    )!;
    expect(trend.stalled).toBe(false);
  });

  it("does not call a movement stalled when the best is recent", () => {
    const series = flat(8);
    const trend = progressionTrend(
      [...series.slice(0, -1), { ...series[series.length - 1], value: 14 }],
      TODAY,
    )!;
    expect(trend.best.value).toBe(14);
    expect(trend.weeksFlat).toBe(0);
    expect(trend.stalled).toBe(false);
  });

  it("has nothing to say about an empty series", () => {
    expect(progressionTrend([], TODAY)).toBeNull();
  });
});

describe("buildExerciseProgress", () => {
  it("picks the metric, builds the series and finds the next rung", () => {
    const progress = buildExerciseProgress(
      {
        id: "e1",
        name: "Push-up",
        slug: "push-up",
        entries: [
          entry({ localDate: "2026-07-01", sets: 3, reps: 10 }),
          entry({ localDate: "2026-09-01", sets: 3, reps: 10 }),
        ],
      },
      "2026-09-10",
    )!;

    expect(progress.metric).toBe("reps");
    expect(progress.series).toHaveLength(2);
    expect(progress.nextStep).toBe("diamond-push-up");
  });

  it("returns nothing for a movement logged without any numbers", () => {
    expect(
      buildExerciseProgress(
        {
          id: "e1",
          name: "Pull-up",
          slug: "pull-up",
          entries: [entry({ localDate: "2026-09-01" })],
        },
        "2026-09-10",
      ),
    ).toBeNull();
  });
});

describe("the progression ladder", () => {
  const slugs = new Set(EXERCISE_CATALOGUE.map((e) => slugify(e.name)));

  it("only points at movements that exist in the catalogue", () => {
    // A typo in either half would silently disable the suggestion upgrade —
    // no error, just a nudge that never fires.
    for (const slug of slugs) {
      const next = nextRung(slug);
      if (next) expect(slugs.has(next)).toBe(true);
    }
  });

  it("is keyed on movements that exist too", () => {
    const laddered = EXERCISE_CATALOGUE.map((e) => slugify(e.name)).filter((s) => nextRung(s));
    expect(laddered.length).toBeGreaterThan(5);
  });

  it("climbs rather than looping", () => {
    for (const slug of slugs) {
      const seen = new Set<string>([slug]);
      let current = nextRung(slug);
      while (current) {
        expect(seen.has(current)).toBe(false);
        seen.add(current);
        current = nextRung(current);
      }
    }
  });

  it("says nothing about a movement the user invented", () => {
    expect(nextRung("dennis-odd-shoulder-thing")).toBeNull();
  });
});

describe("describeSet", () => {
  it("names a loaded set by its load", () => {
    expect(describeSet(entry({ localDate: "d", weightKg: 60, reps: 5 }), "e1rm")).toBe("60 kg x 5");
  });

  it("names a hold by its duration", () => {
    expect(describeSet(entry({ localDate: "d", durationSec: 90 }), "hold")).toBe("1m 30s");
    expect(describeSet(entry({ localDate: "d", durationSec: 45 }), "hold")).toBe("45s");
  });

  it("drops the set count when there was only one", () => {
    expect(describeSet(entry({ localDate: "d", sets: 1, reps: 12 }), "reps")).toBe("12 reps");
  });
});
