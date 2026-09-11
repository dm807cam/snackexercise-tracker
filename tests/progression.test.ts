import { describe, expect, it } from "vitest";
import {
  E1RM_REP_CAP,
  MIN_SESSIONS_FOR_STALL,
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
    // twice the load actually handled.
    expect(estimatedOneRepMax(50, 30)).toBe(estimatedOneRepMax(50, E1RM_REP_CAP));
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
  /** n weekly sessions all at the same value — the stall this exists to catch. */
  function flat(weeks: number, value = 10) {
    return Array.from({ length: weeks }, (_, i) => ({
      date: `2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, "0")}`,
      value,
      detail: "3 x 10",
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  it("anchors the best on the FIRST day it was reached", () => {
    // "How long has it stood" is measured from when it was set, so a repeat of
    // the same best must not restart the clock.
    const trend = progressionTrend([
      { date: "2026-07-01", value: 10, detail: "10" },
      { date: "2026-09-01", value: 10, detail: "10" },
    ])!;
    expect(trend.best.date).toBe("2026-07-01");
    expect(trend.weeksFlat).toBe(Math.floor(62 / 7));
  });

  it("flags a movement trained often and long without the best moving", () => {
    const trend = progressionTrend(flat(8))!;
    expect(trend.sessions).toBeGreaterThanOrEqual(MIN_SESSIONS_FOR_STALL);
    expect(trend.weeksFlat).toBeGreaterThanOrEqual(STALL_WEEKS);
    expect(trend.stalled).toBe(true);
  });

  it("does not call a movement stalled on two sessions a fortnight apart", () => {
    // Too little evidence. Calling that a plateau would be the app inventing a
    // problem out of an ordinary gap.
    const trend = progressionTrend([
      { date: "2026-08-01", value: 10, detail: "10" },
      { date: "2026-08-15", value: 10, detail: "10" },
    ])!;
    expect(trend.stalled).toBe(false);
  });

  it("does not call a movement stalled when the best is recent", () => {
    const series = flat(8);
    const trend = progressionTrend([
      ...series.slice(0, -1),
      { ...series[series.length - 1], value: 14 },
    ])!;
    expect(trend.best.value).toBe(14);
    expect(trend.weeksFlat).toBe(0);
    expect(trend.stalled).toBe(false);
  });

  it("has nothing to say about an empty series", () => {
    expect(progressionTrend([])).toBeNull();
  });
});

describe("buildExerciseProgress", () => {
  it("picks the metric, builds the series and finds the next rung", () => {
    const progress = buildExerciseProgress({
      id: "e1",
      name: "Push-up",
      slug: "push-up",
      entries: [
        entry({ localDate: "2026-07-01", sets: 3, reps: 10 }),
        entry({ localDate: "2026-09-01", sets: 3, reps: 10 }),
      ],
    })!;

    expect(progress.metric).toBe("reps");
    expect(progress.series).toHaveLength(2);
    expect(progress.nextStep).toBe("diamond-push-up");
  });

  it("returns nothing for a movement logged without any numbers", () => {
    expect(
      buildExerciseProgress({
        id: "e1",
        name: "Pull-up",
        slug: "pull-up",
        entries: [entry({ localDate: "2026-09-01" })],
      }),
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
