import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDayLabel,
  formatMonthLabel,
  formatTime,
  minutesOfDayInZone,
  toLocalDateInZone,
  zonedDateTimeToInstant,
  addMonths,
  daysBetween,
  enumerateDates,
  isValidLocalDate,
  monthGrid,
  parseLocalDate,
  previousWindowRange,
  toLocalDate,
  windowRange,
} from "@/lib/dates";

describe("isValidLocalDate", () => {
  it("accepts real dates and rejects malformed or impossible ones", () => {
    expect(isValidLocalDate("2026-09-06")).toBe(true);
    expect(isValidLocalDate("2024-02-29")).toBe(true); // leap year
    expect(isValidLocalDate("2025-02-29")).toBe(false); // not a leap year
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(isValidLocalDate("2026-9-6")).toBe(false);
    expect(isValidLocalDate("not-a-date")).toBe(false);
  });
});

describe("addDays", () => {
  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("survives a spring-forward DST boundary", () => {
    // Europe/Berlin springs forward on 2026-03-29. Arithmetic anchored at
    // midnight would land back on the 28th; anchored at noon it does not.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-03-30", -1)).toBe("2026-03-29");
  });

  it("survives an autumn fall-back boundary", () => {
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("round-trips a full year one day at a time", () => {
    let cursor = "2026-01-01";
    for (let i = 0; i < 365; i++) cursor = addDays(cursor, 1);
    expect(cursor).toBe("2027-01-01");
  });
});

describe("addMonths", () => {
  it("clamps to the last day of a shorter target month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-09-01", "2026-09-08")).toBe(7);
    expect(daysBetween("2026-09-08", "2026-09-01")).toBe(-7);
    expect(daysBetween("2026-09-01", "2026-09-01")).toBe(0);
  });

  it("counts correctly across a DST boundary", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("toLocalDate / parseLocalDate", () => {
  it("round-trips", () => {
    expect(toLocalDate(parseLocalDate("2026-09-06"))).toBe("2026-09-06");
  });

  it("assigns a late-evening timestamp to that evening, not the next UTC day", () => {
    const lateNight = new Date(2026, 8, 6, 23, 45);
    expect(toLocalDate(lateNight)).toBe("2026-09-06");
  });
});

describe("windowRange", () => {
  it("includes today and is inclusive at both ends", () => {
    expect(windowRange(7, "2026-09-06")).toEqual({ start: "2026-08-31", end: "2026-09-06" });
    expect(enumerateDates("2026-08-31", "2026-09-06")).toHaveLength(7);
  });

  it("treats a 1-day window as just today", () => {
    expect(windowRange(1, "2026-09-06")).toEqual({ start: "2026-09-06", end: "2026-09-06" });
  });
});

describe("previousWindowRange", () => {
  it("abuts the current window without overlapping it", () => {
    const current = windowRange(7, "2026-09-06");
    const previous = previousWindowRange(7, "2026-09-06");
    expect(previous).toEqual({ start: "2026-08-24", end: "2026-08-30" });
    expect(addDays(previous.end, 1)).toBe(current.start);
    expect(enumerateDates(previous.start, previous.end)).toHaveLength(7);
  });
});

describe("monthGrid", () => {
  it("returns whole Monday-first weeks covering the month", () => {
    const weeks = monthGrid("2026-09-15");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 1 Sep 2026 is a Tuesday, so the first row starts on Monday 31 Aug.
    expect(weeks[0][0]).toBe("2026-08-31");
    expect(weeks.flat()).toContain("2026-09-01");
    expect(weeks.flat()).toContain("2026-09-30");
  });

  it("handles a month that starts exactly on a Monday", () => {
    // 1 Jun 2026 is a Monday.
    const weeks = monthGrid("2026-06-10");
    expect(weeks[0][0]).toBe("2026-06-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("handles February in a leap year", () => {
    const weeks = monthGrid("2024-02-10");
    expect(weeks.flat()).toContain("2024-02-29");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

describe("label formatting", () => {
  it("renders day labels from fixed tables, not locale patterns", () => {
    // Node and the browser ship different ICU data; en-GB renders this as
    // "Sun 6 Sept" in one and "Sun, 6 Sept" in the other, which breaks
    // hydration. These must be byte-stable.
    expect(formatDayLabel("2026-09-06", 2026)).toBe("Sun 6 Sep");
    expect(formatDayLabel("2026-01-01", 2026)).toBe("Thu 1 Jan");
    expect(formatDayLabel("2025-12-31", 2026)).toBe("Wed 31 Dec 2025");
    expect(formatMonthLabel("2026-09-06")).toBe("September 2026");
  });

  it("formats clock times in the requested zone", () => {
    // 05:12 UTC is 07:12 in Berlin.
    const instant = new Date("2026-09-06T05:12:00Z");
    expect(formatTime(instant, "Europe/Berlin")).toBe("07:12");
    expect(formatTime(instant, "UTC")).toBe("05:12");
  });

  it("renders midnight as 00:00 rather than ICU's 24:00", () => {
    expect(formatTime(new Date("2026-09-06T00:00:00Z"), "UTC")).toBe("00:00");
  });
});

describe("toLocalDateInZone", () => {
  it("buckets an instant into the day it falls on in that zone", () => {
    // 22:30 UTC is already the next day in Berlin.
    const instant = new Date("2026-09-06T22:30:00Z");
    expect(toLocalDateInZone(instant, "Europe/Berlin")).toBe("2026-09-07");
    expect(toLocalDateInZone(instant, "UTC")).toBe("2026-09-06");
    expect(toLocalDateInZone(instant, "America/New_York")).toBe("2026-09-06");
  });
});

describe("minutesOfDayInZone", () => {
  it("reads the wall clock of the given zone, not the container's", () => {
    // 12:00 UTC is 14:00 in Berlin in September (CEST) and 05:00 in Los Angeles.
    const noonUtc = new Date("2026-09-06T12:00:00Z");
    expect(minutesOfDayInZone(noonUtc, "Europe/Berlin")).toBe(14 * 60);
    expect(minutesOfDayInZone(noonUtc, "America/Los_Angeles")).toBe(5 * 60);
    expect(minutesOfDayInZone(noonUtc, "UTC")).toBe(12 * 60);
  });

  it("reports midnight as zero rather than as 1440", () => {
    expect(minutesOfDayInZone(new Date("2026-09-06T00:00:00Z"), "UTC")).toBe(0);
  });
});

describe("zonedDateTimeToInstant", () => {
  it("resolves a typed time in the app's zone, whatever the server's own is", () => {
    // The run happened at 06:30 in Berlin; that is 04:30 UTC.
    const instant = zonedDateTimeToInstant("2026-09-06", "06:30", "Europe/Berlin");
    expect(instant.toISOString()).toBe("2026-09-06T04:30:00.000Z");
  });

  it("round-trips with the readers that display it", () => {
    for (const zone of ["Europe/Berlin", "America/Los_Angeles", "Asia/Kolkata", "UTC"]) {
      const instant = zonedDateTimeToInstant("2026-09-06", "21:15", zone);
      expect(formatTime(instant, zone)).toBe("21:15");
      expect(toLocalDateInZone(instant, zone)).toBe("2026-09-06");
    }
  });

  it("keeps a late-evening entry on the day it was typed against", () => {
    // The failure this prevents: an instant built in a browser two zones east
    // lands 23:30 on the following morning in the app's own zone.
    const instant = zonedDateTimeToInstant("2026-09-06", "23:30", "America/Los_Angeles");
    expect(toLocalDateInZone(instant, "America/Los_Angeles")).toBe("2026-09-06");
  });

  it("lands on the right side of a daylight-saving transition", () => {
    // Europe/Berlin falls back at 03:00 on 25 October 2026. A single-pass guess
    // reads the offset before the transition and puts this an hour out.
    const before = zonedDateTimeToInstant("2026-10-25", "01:30", "Europe/Berlin");
    expect(formatTime(before, "Europe/Berlin")).toBe("01:30");

    const after = zonedDateTimeToInstant("2026-10-25", "12:00", "Europe/Berlin");
    expect(formatTime(after, "Europe/Berlin")).toBe("12:00");

    // Spring forward: 02:30 on 29 March 2026 does not exist in Berlin. It must
    // resolve to a real instant rather than to NaN.
    const skipped = zonedDateTimeToInstant("2026-03-29", "02:30", "Europe/Berlin");
    expect(Number.isNaN(skipped.getTime())).toBe(false);
  });
});
