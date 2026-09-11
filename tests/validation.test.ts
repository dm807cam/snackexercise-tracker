import { describe, expect, it } from "vitest";
import {
  dailyMetricSchema,
  entryInputSchema,
  entryUpdateSchema,
  exerciseInputSchema,
  exercisePatchSchema,
} from "@/lib/validation";

describe("exercisePatchSchema", () => {
  /**
   * The regression this exists for: `.partial()` does NOT strip `.default()`.
   * A defaulted field is already optional on input, so partial wraps it and the
   * default still fires — meaning a PATCH carrying only `{muscles}` arrived at
   * Prisma with cardioBias 0, silently turning every run in the history into
   * full strength volume and zeroing its MET-minutes.
   */
  it("does not invent fields the caller did not send", () => {
    const patch = exercisePatchSchema.parse({
      muscles: [{ muscle: "quads", weight: 1 }],
    });

    expect("cardioBias" in patch).toBe(false);
    expect("category" in patch).toBe(false);
    expect("bodyweight" in patch).toBe(false);
    expect(patch.muscles).toHaveLength(1);
  });

  it("still accepts and validates the fields that are sent", () => {
    const patch = exercisePatchSchema.parse({ cardioBias: 0.4, mets: 9.8 });
    expect(patch.cardioBias).toBe(0.4);
    expect(patch.mets).toBe(9.8);
  });

  it("rejects a cardio bias outside 0..1", () => {
    expect(() => exercisePatchSchema.parse({ cardioBias: 1.5 })).toThrow();
    expect(() => exercisePatchSchema.parse({ cardioBias: -1 })).toThrow();
  });

  it("accepts an empty patch", () => {
    expect(exercisePatchSchema.parse({})).toEqual({});
  });
});

describe("exerciseInputSchema", () => {
  it("still defaults on create, where a default is what you want", () => {
    const created = exerciseInputSchema.parse({
      name: "Test move",
      muscles: [{ muscle: "chest", weight: 1 }],
    });
    expect(created.cardioBias).toBe(0);
    expect(created.category).toBe("other");
    expect(created.bodyweight).toBe(false);
  });

  it("accepts the cardio category", () => {
    const created = exerciseInputSchema.parse({
      name: "Run",
      category: "cardio",
      cardioBias: 1,
      mets: 9.8,
      muscles: [{ muscle: "quads", weight: 0.25 }],
    });
    expect(created.category).toBe("cardio");
    expect(created.cardioBias).toBe(1);
  });
});

describe("entryInputSchema", () => {
  it("carries distance and heart rate through", () => {
    const entry = entryInputSchema.parse({
      exerciseId: "x1",
      sets: 1,
      distanceM: 5200,
      avgHeartRate: 158,
    });
    expect(entry.distanceM).toBe(5200);
    expect(entry.avgHeartRate).toBe(158);
  });

  it("rejects an implausible heart rate rather than storing it", () => {
    expect(() =>
      entryInputSchema.parse({ exerciseId: "x1", sets: 1, avgHeartRate: 400 }),
    ).toThrow();
  });
});

describe("dailyMetricSchema", () => {
  it("accepts every source the app actually writes", () => {
    for (const source of ["manual", "shortcut", "import", "llm"]) {
      expect(dailyMetricSchema.parse({ steps: 9000, source }).source).toBe(source);
    }
  });

  it("allows clearing a day", () => {
    expect(dailyMetricSchema.parse({ steps: null }).steps).toBeNull();
  });

  it("refuses a step count no human reaches on foot", () => {
    // A unit mix-up here would distort the balance marker for the whole window.
    expect(() => dailyMetricSchema.parse({ steps: 900000 })).toThrow();
    expect(() => dailyMetricSchema.parse({ steps: -1 })).toThrow();
  });
});

describe("a stated time of day", () => {
  it("accepts the digits an <input type=\"time\"> produces", () => {
    const parsed = entryInputSchema.parse({
      exerciseId: "x1",
      performedTime: "06:30",
      localDate: "2026-09-06",
    });
    expect(parsed.performedTime).toBe("06:30");
  });

  it("rejects a time that is not one", () => {
    // resolvePerformedAt used to silently fall back on these; now the server
    // resolves the digits itself, so a bad one has to be refused rather than
    // quietly become midday.
    for (const bad of ["25:00", "12:60", "6:30", "0630", "half six"]) {
      expect(() => entryInputSchema.parse({ exerciseId: "x1", performedTime: bad })).toThrow();
    }
  });

  it("accepts a time without a day, which means today", () => {
    // The two are independently optional on the wire. Requiring both here
    // would be a lie about the schema; requiring both in createEntry was a bug
    // that silently stamped "now" over the time the user chose.
    const parsed = entryInputSchema.parse({ exerciseId: "x1", performedTime: "06:30" });
    expect(parsed.performedTime).toBe("06:30");
    expect(parsed.localDate).toBeUndefined();
  });

  it("lets a PATCH move an entry to another time and another day", () => {
    const patch = entryUpdateSchema.parse({
      performedTime: "18:45",
      localDate: "2026-09-05",
    });
    expect(patch).toEqual({ performedTime: "18:45", localDate: "2026-09-05" });
  });

  it("leaves a PATCH that says nothing about time alone", () => {
    expect(entryUpdateSchema.parse({ sets: 3 })).toEqual({ sets: 3 });
  });

  it("accepts a day on its own, which moves an entry without retiming it", () => {
    // This used to validate and then write nothing at all, because the route
    // only looked at localDate when a time came with it.
    expect(entryUpdateSchema.parse({ localDate: "2026-09-05" })).toEqual({
      localDate: "2026-09-05",
    });
  });
});

describe("effort", () => {
  it("accepts the three levels on a new entry", () => {
    for (const effort of ["easy", "hard", "failure"]) {
      expect(entryInputSchema.parse({ exerciseName: "Push-up", effort }).effort).toBe(effort);
    }
  });

  it("accepts an entry with no rating, which is the normal case", () => {
    const parsed = entryInputSchema.parse({ exerciseName: "Push-up" });
    expect(parsed.effort ?? null).toBeNull();
  });

  it("lets an edit clear a rating back to unrecorded", () => {
    expect(entryUpdateSchema.parse({ effort: null }).effort).toBeNull();
  });

  it("does not invent a rating on an edit that says nothing about it", () => {
    // Same trap as exercisePatchSchema above: a field that defaults would
    // silently stamp every retimed entry as a hard set.
    expect("effort" in entryUpdateSchema.parse({ sets: 2 })).toBe(false);
  });

  it("rejects anything outside the three levels", () => {
    expect(() => entryInputSchema.parse({ exerciseName: "Push-up", effort: "rir2" })).toThrow();
    expect(() => entryInputSchema.parse({ exerciseName: "Push-up", effort: 3 })).toThrow();
  });
});
