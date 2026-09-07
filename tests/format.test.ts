import { describe, expect, it } from "vitest";
import {
  distanceUnitsFor,
  formatDistance,
  formatEntryDetail,
  formatPace,
  fromMetres,
  toMetres,
} from "@/lib/format";

describe("distance units follow the weight setting", () => {
  it("pairs kg with km and lb with miles", () => {
    // One setting, not two: nobody wants loads in pounds and runs in km.
    expect(distanceUnitsFor("kg")).toBe("km");
    expect(distanceUnitsFor("lb")).toBe("mi");
  });

  it("round-trips through metres", () => {
    expect(fromMetres(toMetres(5, "kg"), "kg")).toBeCloseTo(5, 6);
    expect(fromMetres(toMetres(3.1, "lb"), "lb")).toBeCloseTo(3.1, 6);
  });

  it("formats in the reader's units", () => {
    expect(formatDistance(5000, "kg")).toBe("5 km");
    expect(formatDistance(5200, "kg")).toBe("5.20 km");
    expect(formatDistance(1609.344, "lb")).toBe("1 mi");
  });
});

describe("formatPace", () => {
  it("reports minutes per kilometre", () => {
    // 5 km in 26:25.
    expect(formatPace(5000, 1585, "kg")).toBe("5:17/km");
  });

  it("reports minutes per mile when the units say so", () => {
    expect(formatPace(1609.344, 480, "lb")).toBe("8:00/mi");
  });

  it("carries 60 seconds into the next minute", () => {
    // Would render as "5:60/km" without the carry.
    expect(formatPace(1000, 359.7, "kg")).toBe("6:00/km");
  });

  it("refuses to divide by zero or report an absurd pace", () => {
    expect(formatPace(0, 600, "kg")).toBeNull();
    expect(formatPace(5000, 0, "kg")).toBeNull();
    expect(formatPace(1, 3600, "kg")).toBeNull();
  });
});

describe("formatEntryDetail", () => {
  const base = { sets: 1, reps: null, weightKg: null, durationSec: null };

  it("describes a run by distance, time and pace rather than sets", () => {
    expect(
      formatEntryDetail({ ...base, distanceM: 5200, durationSec: 1650 }, "kg"),
    ).toBe("5.20 km · 27m 30s · 5:17/km");
  });

  it("adds heart rate when there is one", () => {
    expect(
      formatEntryDetail({ ...base, distanceM: 5000, durationSec: 1500, avgHeartRate: 158 }, "kg"),
    ).toContain("158 bpm");
  });

  it("describes a distance with no time as just the distance", () => {
    expect(formatEntryDetail({ ...base, distanceM: 5000 }, "kg")).toBe("5 km");
  });

  it("leaves the existing strength formats untouched", () => {
    expect(formatEntryDetail({ ...base, sets: 3, reps: 12, weightKg: 24 }, "kg")).toBe(
      "3 x 12 · 24 kg",
    );
    expect(formatEntryDetail({ ...base, durationSec: 120 }, "kg")).toBe("2m");
    expect(formatEntryDetail({ ...base, sets: 2 }, "kg")).toBe("2 sets");
  });

  it("reports heart rate on a non-distance entry too", () => {
    // A rowing machine session has no distance the pace equations can use.
    expect(formatEntryDetail({ ...base, durationSec: 1200, avgHeartRate: 145 }, "kg")).toBe(
      "20m · 145 bpm",
    );
  });
});
