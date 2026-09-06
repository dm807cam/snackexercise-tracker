import { describe, expect, it } from "vitest";
import { extractEntries, OpenRouterError, parsedPayloadSchema } from "@/lib/openrouter";
import { resolvePerformedAt } from "@/lib/parse-helpers";
import { todayLocalDate } from "@/lib/dates";

/** A well-formed response, as a compliant model returns it. */
const GOOD = JSON.stringify({
  entries: [
    {
      exerciseName: "Kettlebell swing",
      sets: 3,
      reps: 12,
      weightKg: 24,
      durationSec: null,
      timeHint: null,
      notes: null,
    },
    {
      exerciseName: "Plank",
      sets: 1,
      reps: null,
      weightKg: null,
      durationSec: 120,
      timeHint: "09:30",
      notes: "felt easy",
    },
  ],
});

describe("extractEntries", () => {
  it("reads a well-formed response", () => {
    const entries = extractEntries(GOOD);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ exerciseName: "Kettlebell swing", sets: 3, reps: 12, weightKg: 24 });
    expect(entries[1]).toMatchObject({ durationSec: 120, timeHint: "09:30", reps: null });
  });

  it("recovers JSON wrapped in a markdown fence", () => {
    // Some models add a ```json fence despite the strict schema.
    expect(extractEntries("```json\n" + GOOD + "\n```")).toHaveLength(2);
    expect(extractEntries("```\n" + GOOD + "\n```")).toHaveLength(2);
  });

  it("accepts an empty entries array for text with no exercise in it", () => {
    expect(extractEntries(JSON.stringify({ entries: [] }))).toEqual([]);
  });

  it("rejects prose instead of JSON rather than half-parsing it", () => {
    expect(() => extractEntries("I think you did three sets of swings.")).toThrow(OpenRouterError);
  });

  it("rejects JSON of the wrong shape", () => {
    expect(() => extractEntries(JSON.stringify({ entries: "swings" }))).toThrow(OpenRouterError);
    expect(() => extractEntries(JSON.stringify({ results: [] }))).toThrow(OpenRouterError);
  });

  it("rejects an entry missing its required fields", () => {
    const bad = JSON.stringify({ entries: [{ exerciseName: "Push-up" }] });
    expect(() => extractEntries(bad)).toThrow(OpenRouterError);
  });

  it("rejects implausible numbers rather than writing them to the log", () => {
    const absurd = JSON.stringify({
      entries: [
        { exerciseName: "Bench press", sets: 3, reps: 10, weightKg: 99999, durationSec: null, timeHint: null, notes: null },
      ],
    });
    expect(() => extractEntries(absurd)).toThrow(OpenRouterError);
  });

  it("rejects a malformed timeHint", () => {
    const bad = JSON.stringify({
      entries: [
        { exerciseName: "Plank", sets: 1, reps: null, weightKg: null, durationSec: 60, timeHint: "half nine", notes: null },
      ],
    });
    expect(() => extractEntries(bad)).toThrow(OpenRouterError);
  });

  it("rejects an empty string outright", () => {
    expect(() => extractEntries("")).toThrow(OpenRouterError);
  });
});

describe("parsedPayloadSchema", () => {
  it("caps a runaway response instead of accepting unbounded entries", () => {
    const many = { entries: Array.from({ length: 30 }, () => JSON.parse(GOOD).entries[0]) };
    expect(parsedPayloadSchema.safeParse(many).success).toBe(false);
  });
});

describe("resolvePerformedAt", () => {
  const now = new Date(2026, 8, 6, 14, 30);

  it("uses a stated time on the day being logged", () => {
    const at = resolvePerformedAt("2026-09-04", "07:15", now);
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(8);
    expect(at.getDate()).toBe(4);
    expect(at.getHours()).toBe(7);
    expect(at.getMinutes()).toBe(15);
  });

  it("stamps 'now' when logging today with no stated time", () => {
    expect(resolvePerformedAt(todayLocalDate(), null, now)).toEqual(now);
  });

  it("stamps midday when back-filling an earlier day with no stated time", () => {
    // Midday keeps a back-filled entry in the middle of the day's list rather
    // than pretending it happened at midnight.
    const at = resolvePerformedAt("2026-09-01", null, now);
    expect(at.getDate()).toBe(1);
    expect(at.getHours()).toBe(12);
  });

  it("falls back safely on a nonsense time rather than producing an invalid date", () => {
    const at = resolvePerformedAt("2026-09-01", "99:99", now);
    expect(Number.isNaN(at.getTime())).toBe(false);
    expect(at.getDate()).toBe(1);
  });
});
