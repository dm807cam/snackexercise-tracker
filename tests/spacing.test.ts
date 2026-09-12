import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_WINDOW,
  DEFAULT_TARGET_BOUTS,
  MAX_TARGET_BOUTS,
  MIN_TARGET_BOUTS,
  daySpacing,
  formatBoutLength,
  formatGap,
  mergeWindowFor,
  normaliseTargetBouts,
  spacingLabel,
  summariseSpacing,
  toBouts,
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
    const result = daySpacing(evenlySpread(DEFAULT_TARGET_BOUTS));
    expect(result.score).toBe(1);
    expect(result.bouts).toBe(DEFAULT_TARGET_BOUTS);
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

describe("a configurable target", () => {
  it("clamps a stored value rather than scoring against nonsense", () => {
    expect(normaliseTargetBouts(8)).toBe(8);
    expect(normaliseTargetBouts(0)).toBe(DEFAULT_TARGET_BOUTS);
    expect(normaliseTargetBouts(null)).toBe(DEFAULT_TARGET_BOUTS);
    expect(normaliseTargetBouts(Number.NaN)).toBe(DEFAULT_TARGET_BOUTS);
    expect(normaliseTargetBouts(1)).toBe(MIN_TARGET_BOUTS);
    expect(normaliseTargetBouts(400)).toBe(MAX_TARGET_BOUTS);
    expect(normaliseTargetBouts(5.6)).toBe(6);
  });

  it("moves what counts as a full mark", () => {
    // Five evenly spread bouts is a perfect day at the default and a middling
    // one for somebody chasing the sedentary-interruption dose.
    const day = evenlySpread(5);
    expect(daySpacing(day, DEFAULT_ACTIVE_WINDOW, DEFAULT_TARGET_BOUTS).score).toBe(1);
    expect(daySpacing(day, DEFAULT_ACTIVE_WINDOW, 15).score!).toBeLessThan(0.45);
  });

  it("still scores a perfectly spread day at the chosen target as 1", () => {
    for (const target of [2, 5, 12, 20]) {
      expect(daySpacing(evenlySpread(target), DEFAULT_ACTIVE_WINDOW, target).score).toBe(1);
    }
  });

  it("shrinks the merge window as the target rises, so a stricter aim stays reachable", () => {
    // At a target of twenty the ideal gap is 40 minutes; a fixed fifteen-minute
    // merge would swallow a third of every genuine break.
    const wide = mergeWindowFor(DEFAULT_TARGET_BOUTS);
    const tight = mergeWindowFor(20);
    expect(wide).toBeGreaterThan(tight);
    expect(tight).toBeGreaterThanOrEqual(3);

    // And the default is near enough the fifteen minutes it replaces that no
    // already-logged day is rescored meaningfully.
    expect(wide).toBeGreaterThanOrEqual(13);
    expect(wide).toBeLessThanOrEqual(15);
  });

  it("merges on the configured window, not the one an early run expanded", () => {
    // A 05:30 session widens the scored day from 14 hours to 16.5. If the merge
    // window were derived from the expanded day it would widen too — from 14
    // minutes to 15 — and these two evening entries would silently become one.
    expect(mergeWindowFor(DEFAULT_TARGET_BOUTS)).toBe(14);
    expect(daySpacing([at(19), at(19, 15)]).bouts).toBe(2);
    expect(daySpacing([at(5, 30), at(19), at(19, 15)]).bouts).toBe(3);
  });

  it("reports the target it was measured against", () => {
    expect(summariseSpacing([], DEFAULT_ACTIVE_WINDOW, 12).targetBouts).toBe(12);
    expect(summariseSpacing([], DEFAULT_ACTIVE_WINDOW, 0).targetBouts).toBe(DEFAULT_TARGET_BOUTS);
  });

  it("clamps the same way the summary does, so the two cannot disagree", () => {
    // Otherwise a day could be scored against 100 under a card reading
    // "Scored against 24 snacks".
    const day = evenlySpread(5);
    expect(daySpacing(day, DEFAULT_ACTIVE_WINDOW, 100).score).toBe(
      daySpacing(day, DEFAULT_ACTIVE_WINDOW, MAX_TARGET_BOUTS).score,
    );
    expect(daySpacing(day, DEFAULT_ACTIVE_WINDOW, 0).score).toBe(
      daySpacing(day, DEFAULT_ACTIVE_WINDOW, DEFAULT_TARGET_BOUTS).score,
    );
  });
});

describe("bout length", () => {
  it("reads a recorded duration, scaled by the set count", () => {
    // durationSec is stored per set, the way lib/cardio.ts reads it.
    const day = daySpacing([{ minuteOfDay: at(12), movementSec: 40 * 6 }]);
    expect(day.medianBoutMinutes).toBe(4);
    expect(day.timedBouts).toBe(1);
  });

  it("sums the recorded durations inside one bout", () => {
    const day = daySpacing([
      { minuteOfDay: at(18), movementSec: 60 },
      { minuteOfDay: at(18, 2), movementSec: 90 },
    ]);
    expect(day.bouts).toBe(1);
    expect(day.medianBoutMinutes).toBe(2.5);
  });

  it("says nothing rather than zero when nothing recorded a duration", () => {
    // The app does not know whether ten push-ups took twenty seconds or five
    // minutes, and "0 minutes" would be a claim rather than an absence.
    const day = daySpacing([at(12)]);
    expect(day.medianBoutMinutes).toBeNull();
    expect(day.boutDurationMin).toEqual([null]);
    expect(day.timedBouts).toBe(0);
  });

  it("does not invent a length from the time a bout was spread over", () => {
    // Three untimed movements between 18:00 and 18:05 is NOT five minutes of
    // movement — it is about ninety seconds of work and three and a half
    // minutes of standing about — so reporting 5 beside a two-minute threshold
    // about actual walking would overstate it by the rest intervals.
    const day = daySpacing([at(18), at(18, 2), at(18, 5)]);
    expect(day.bouts).toBe(1);
    expect(day.medianBoutMinutes).toBeNull();
  });

  it("does not move when the target does, because it is not about the target", () => {
    // The regression this guards: bout length used to take the span of a bout
    // as a second lower bound, and the merge window moves with the target — so
    // the same circuit read as two ten-minute bouts at a target of five and six
    // untimed ones at twenty, emptying a figure the setting has no business
    // touching.
    const circuit = [0, 5, 10, 15, 20, 25].map((m) => ({
      minuteOfDay: at(18) + m,
      movementSec: 60,
    }));
    const loose = daySpacing(circuit, DEFAULT_ACTIVE_WINDOW, 5);
    const strict = daySpacing(circuit, DEFAULT_ACTIVE_WINDOW, 20);

    // The grouping genuinely differs...
    expect(loose.bouts).toBe(2);
    expect(strict.bouts).toBe(6);
    // ...but every recorded second is still counted, either way.
    expect(loose.timedBouts).toBe(loose.bouts);
    expect(strict.timedBouts).toBe(strict.bouts);
    expect(strict.medianBoutMinutes).toBe(1);
  });

  it("does not change the score, which is about distribution alone", () => {
    const bare = daySpacing(evenlySpread(5));
    const timed = daySpacing(evenlySpread(5).map((m) => ({ minuteOfDay: m, movementSec: 600 })));
    expect(timed.score).toBe(bare.score);
    expect(timed.bouts).toBe(bare.bouts);
  });

  it("pools bout lengths across the window rather than averaging per-day medians", () => {
    // A day with one long bout must not outweigh a day with six short ones.
    const summary = summariseSpacing([
      ["2026-09-01", daySpacing([{ minuteOfDay: at(12), movementSec: 3600 }])],
      [
        "2026-09-02",
        daySpacing([at(9), at(11), at(13), at(15), at(17)].map((m) => ({
          minuteOfDay: m,
          movementSec: 120,
        }))),
      ],
    ]);
    expect(summary.timedBouts).toBe(6);
    expect(summary.totalBouts).toBe(6);
    expect(summary.medianBoutMinutes).toBe(2);
  });

  it("counts a badly spread day's snacks, which are the ones worth looking at", () => {
    // How long a snack lasts is a fact about the snack. A day that scored 0.12
    // for being one evening block still says its bouts were three minutes long,
    // and dropping it would bias the median toward the days that went well.
    const bunched = daySpacing(
      [at(19), at(19, 30)].map((m) => ({ minuteOfDay: m, movementSec: 180 })),
    );
    expect(bunched.bouts).toBe(2);
    expect(bunched.score!).toBeLessThan(0.3);
    const summary = summariseSpacing([["2026-09-01", bunched]]);
    expect(summary.timedBouts).toBe(2);
    expect(summary.medianBoutMinutes).toBe(3);
  });

  it("keeps a sub-minute snack legible rather than rounding it to nothing", () => {
    // A 45-second snack is the format this app was built for; showing it as
    // "0m", or as "50s" through a one-decimal round, would read as a bug.
    const day = daySpacing([{ minuteOfDay: at(12), movementSec: 45 }]);
    expect(day.medianBoutMinutes).toBe(0.75);
    expect(formatBoutLength(day.medianBoutMinutes!)).toBe("45s");
  });

  it("reports a short snack in seconds rather than rounding it to nothing", () => {
    expect(formatBoutLength(0.5)).toBe("30s");
    expect(formatBoutLength(2)).toBe("2m");
    expect(formatBoutLength(75)).toBe("1h 15m");
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

  it("carries the minutes rather than printing sixty of them", () => {
    // Flooring the hours and rounding the minutes independently rendered
    // 119.63 as "1h 60m" and 59.7 as "60m".
    expect(formatGap(119.63)).toBe("2h");
    expect(formatGap(59.7)).toBe("1h");
    expect(formatBoutLength(0.99)).toBe("1m");
  });
});
