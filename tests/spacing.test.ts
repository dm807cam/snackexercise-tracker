import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_WINDOW,
  daySpacing,
  formatGap,
  spacingLabel,
  summariseSpacing,
  toBouts,
  TARGET_BOUTS,
} from "@/lib/spacing";

/** 08:00 to 22:00 by default: fourteen hours, 840 minutes. */
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

/** n bouts spread perfectly evenly across the default window. */
function evenlySpread(count: number): number[] {
  const start = DEFAULT_ACTIVE_WINDOW.startHour * 60;
  const span = (DEFAULT_ACTIVE_WINDOW.endHour - DEFAULT_ACTIVE_WINDOW.startHour) * 60;
  const step = span / (count + 1);
  return Array.from({ length: count }, (_, i) => start + step * (i + 1));
}

describe("toBouts", () => {
  it("merges entries logged in one go into a single bout", () => {
    // Three movements at the top of the stairs is one interruption of sitting.
    expect(toBouts([at(18), at(18, 2), at(18, 5)])).toEqual([at(18)]);
  });

  it("keeps genuinely separate visits apart", () => {
    expect(toBouts([at(9), at(13), at(17)])).toEqual([at(9), at(13), at(17)]);
  });

  it("sorts before merging, so log order cannot change the answer", () => {
    expect(toBouts([at(17), at(9), at(9, 10)])).toEqual([at(9), at(17)]);
  });

  it("merges a chain only while each step stays inside the threshold", () => {
    // 20 minutes apart is two bouts even though each is close to the last.
    expect(toBouts([at(12), at(12, 20)])).toHaveLength(2);
  });
});

describe("daySpacing", () => {
  it("scores a perfectly spread day at the target frequency as 1", () => {
    const result = daySpacing(evenlySpread(TARGET_BOUTS));
    expect(result.score).toBe(1);
    expect(result.bouts).toBe(TARGET_BOUTS);
  });

  it("scores more than the target, still evenly spread, as 1", () => {
    expect(daySpacing(evenlySpread(8)).score).toBe(1);
  });

  it("rates a single session poorly however well placed it is", () => {
    // The whole point: one bout cannot be "clustered", so evenness alone would
    // flatter it. Frequency has to count, and here it does.
    const one = daySpacing(evenlySpread(1)).score!;
    expect(one).toBeLessThan(0.35);
  });

  it("rates one evening block far below the same volume spread out", () => {
    const blocked = daySpacing([at(19), at(19, 8), at(19, 12), at(19, 20), at(19, 30)]).score!;
    const spread = daySpacing(evenlySpread(5)).score!;
    expect(blocked).toBeLessThan(0.35);
    expect(spread).toBeGreaterThan(blocked * 2);
  });

  it("improves monotonically as the same day is broken up further", () => {
    const scores = [1, 2, 3, 4, 5].map((n) => daySpacing(evenlySpread(n)).score!);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it("returns a null score for a day with nothing logged", () => {
    const result = daySpacing([]);
    expect(result.score).toBeNull();
    expect(result.longestGapMin).toBeNull();
    expect(result.bouts).toBe(0);
  });

  it("reports the longest quiet stretch, edges included", () => {
    // 08:00 to 20:00 is the longest gap here, not the hour between the bouts.
    const result = daySpacing([at(20), at(21)]);
    expect(result.longestGapMin).toBe(12 * 60);
  });

  it("expands the window around anything logged outside it, and never contracts", () => {
    const result = daySpacing([at(5, 30), at(12)]);
    expect(result.window.startMin).toBe(at(5, 30));
    expect(result.window.endMin).toBe(DEFAULT_ACTIVE_WINDOW.endHour * 60);
  });

  it("cannot be gamed by training only inside a narrow stretch", () => {
    // If the window contracted to fit, three sets in one hour would score 1.
    expect(daySpacing([at(12), at(12, 20), at(12, 40)]).score!).toBeLessThan(0.4);
  });

  it("honours a custom window for someone whose day is not nine to five", () => {
    const nightShift = { startHour: 20, endHour: 24 };
    const spread = daySpacing([at(20, 40), at(21, 20), at(22), at(22, 40), at(23, 20)], nightShift);
    expect(spread.score).toBe(1);
  });

  it("falls back to the default window if given a nonsensical one", () => {
    const result = daySpacing([at(12)], { startHour: 20, endHour: 6 });
    expect(result.window.startMin).toBe(DEFAULT_ACTIVE_WINDOW.startHour * 60);
    expect(result.window.endMin).toBe(DEFAULT_ACTIVE_WINDOW.endHour * 60);
  });
});

describe("summariseSpacing", () => {
  const spread = daySpacing(evenlySpread(5));
  const blocked = daySpacing([at(19), at(19, 5)]);

  it("averages only the days that had something logged", () => {
    const summary = summariseSpacing([
      ["2026-09-01", spread],
      ["2026-09-02", daySpacing([])],
      ["2026-09-03", blocked],
    ]);

    // A rest day is not a badly spread day; averaging a zero in would make this
    // a second, worse activity count.
    expect(summary.ratedDays).toBe(2);
    expect(summary.score).toBeCloseTo((spread.score! + blocked.score!) / 2, 2);
  });

  it("buckets bouts by the hour they happened in", () => {
    const summary = summariseSpacing([["2026-09-01", blocked]]);
    expect(summary.byHour[19]).toBe(1);
    expect(summary.byHour.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("names the best and worst days so the score has something concrete behind it", () => {
    const summary = summariseSpacing([
      ["2026-09-01", spread],
      ["2026-09-03", blocked],
    ]);
    expect(summary.best?.date).toBe("2026-09-01");
    expect(summary.worst?.date).toBe("2026-09-03");
  });

  it("reports nothing rather than zero when the window is empty", () => {
    const summary = summariseSpacing([]);
    expect(summary.score).toBeNull();
    expect(summary.longestGapMin).toBeNull();
    expect(summary.byHour).toHaveLength(24);
  });
});

describe("labels", () => {
  it("bands the score in words", () => {
    expect(spacingLabel(null)).toBe("Nothing logged");
    expect(spacingLabel(0.9)).toBe("Well spread");
    expect(spacingLabel(0.6)).toBe("Fairly spread");
    expect(spacingLabel(0.4)).toBe("Bunched");
    expect(spacingLabel(0.1)).toBe("One block");
  });

  it("reads a gap as a duration", () => {
    expect(formatGap(45)).toBe("45m");
    expect(formatGap(120)).toBe("2h");
    expect(formatGap(380)).toBe("6h 20m");
  });
});
