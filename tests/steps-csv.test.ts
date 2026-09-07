import { describe, expect, it } from "vitest";
import { parseDateCell, parseStepCsv, parseStepValue } from "@/lib/steps-csv";

describe("parseStepValue", () => {
  it("reads plain and thousands-separated numbers", () => {
    expect(parseStepValue("8432")).toBe(8432);
    expect(parseStepValue("12,345")).toBe(12345);
    expect(parseStepValue("12 345")).toBe(12345);
  });

  it("rounds a fractional count", () => {
    expect(parseStepValue("8432.6")).toBe(8433);
  });

  it("refuses nonsense rather than importing a zero", () => {
    expect(parseStepValue("")).toBeNull();
    expect(parseStepValue("n/a")).toBeNull();
    expect(parseStepValue("-500")).toBeNull();
    expect(parseStepValue("9000000")).toBeNull();
  });
});

describe("parseDateCell", () => {
  it("reads an ISO date", () => {
    expect(parseDateCell("2026-09-07")).toBe("2026-09-07");
  });

  it("truncates an ISO timestamp without re-interpreting its zone", () => {
    // The bug this avoids: parsing through Date would move a 23:30 reading to
    // the next or previous day depending on the runtime's timezone.
    expect(parseDateCell("2026-09-07T23:30:00")).toBe("2026-09-07");
    expect(parseDateCell("2026-09-07T23:30:00+02:00")).toBe("2026-09-07");
  });

  it("reads an unambiguous slash date", () => {
    expect(parseDateCell("25/12/2026")).toBe("2026-12-25");
  });

  it("refuses an ambiguous slash date rather than guessing", () => {
    // 07/09/2026 is either 7 September or 9 July. Guessing would silently
    // shift half a year of history.
    expect(parseDateCell("07/09/2026")).toBeNull();
  });

  it("rejects an impossible date", () => {
    expect(parseDateCell("2026-02-30")).toBeNull();
    expect(parseDateCell("not a date")).toBeNull();
  });
});

describe("parseStepCsv", () => {
  it("reads a plain Date,Steps export", () => {
    const result = parseStepCsv("Date,Steps\n2026-09-05,8432\n2026-09-06,11004\n");
    expect(result.days).toEqual([
      { localDate: "2026-09-05", steps: 8432 },
      { localDate: "2026-09-06", steps: 11004 },
    ]);
    expect(result.skipped).toBe(0);
  });

  it("finds the columns by name wherever they sit", () => {
    const result = parseStepCsv(
      "sourceName,startDate,value,unit\nWatch,2026-09-05,8432,count\n",
    );
    expect(result.days).toEqual([{ localDate: "2026-09-05", steps: 8432 }]);
  });

  it("sums several rows for the same day", () => {
    // Health exports carry one row per device or per hour.
    const result = parseStepCsv(
      "Date,Steps\n2026-09-05,4000\n2026-09-05,3000\n2026-09-06,900\n",
    );
    expect(result.days).toEqual([
      { localDate: "2026-09-05", steps: 7000 },
      { localDate: "2026-09-06", steps: 900 },
    ]);
  });

  it("treats a headerless file as date,steps and keeps the first row", () => {
    const result = parseStepCsv("2026-09-05,8432\n2026-09-06,11004\n");
    expect(result.days).toHaveLength(2);
    expect(result.days[0]).toEqual({ localDate: "2026-09-05", steps: 8432 });
  });

  it("handles quoted fields and semicolon separators", () => {
    const result = parseStepCsv('Date;Steps\n"2026-09-05";"12,345"\n');
    expect(result.days).toEqual([{ localDate: "2026-09-05", steps: 12345 }]);
  });

  it("counts unreadable rows instead of dropping them silently", () => {
    const result = parseStepCsv("Date,Steps\n2026-09-05,8432\nbroken,row\n,\n");
    expect(result.days).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });

  it("returns nothing for an empty file", () => {
    expect(parseStepCsv("")).toEqual({ days: [], skipped: 0 });
    expect(parseStepCsv("\n\n")).toEqual({ days: [], skipped: 0 });
  });

  it("sorts by date so a shuffled export still restores in order", () => {
    const result = parseStepCsv("Date,Steps\n2026-09-06,1\n2026-09-04,2\n2026-09-05,3\n");
    expect(result.days.map((d) => d.localDate)).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });
});
