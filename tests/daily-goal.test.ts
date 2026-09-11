import { describe, expect, it } from "vitest";
import {
  CARDIO_TARGET_MET_MIN_PER_DAY,
  STRENGTH_TARGET_PER_DAY,
  buildDailyGoal,
  goalHeadline,
  remainingCardioMinutes,
} from "@/lib/daily-goal";
import { CARDIO_TARGET_MET_MIN_PER_WEEK } from "@/lib/cardio";
import { STRENGTH_TARGET_HARD_SETS_PER_WEEK } from "@/lib/balance";

const nothing = { hardSets: 0, metMinutes: 0 };

describe("the daily targets", () => {
  it("are a seventh of the weekly guidelines, derived rather than restated", () => {
    // The one thing that must never drift: if a weekly target is ever edited,
    // the day view has to move with it rather than keep its own copy.
    expect(STRENGTH_TARGET_PER_DAY).toBeCloseTo(STRENGTH_TARGET_HARD_SETS_PER_WEEK / 7, 10);
    expect(CARDIO_TARGET_MET_MIN_PER_DAY).toBeCloseTo(CARDIO_TARGET_MET_MIN_PER_WEEK / 7, 10);
  });
});

describe("buildDailyGoal", () => {
  it("owes the whole target on a day with nothing logged", () => {
    const goal = buildDailyGoal(nothing);
    expect(goal.empty).toBe(true);
    expect(goal.complete).toBe(false);
    expect(goal.strength.remaining).toBeCloseTo(STRENGTH_TARGET_PER_DAY, 1);
    expect(goal.cardio.remaining).toBeCloseTo(CARDIO_TARGET_MET_MIN_PER_DAY, 1);
    expect(goal.strength.fraction).toBe(0);
  });

  it("closes a ring exactly at the target", () => {
    const goal = buildDailyGoal({
      hardSets: STRENGTH_TARGET_PER_DAY,
      metMinutes: CARDIO_TARGET_MET_MIN_PER_DAY,
    });
    expect(goal.complete).toBe(true);
    expect(goal.strength.met).toBe(true);
    expect(goal.strength.fraction).toBe(1);
    expect(goal.strength.remaining).toBe(0);
  });

  it("never owes a negative amount, and never overfills a ring", () => {
    const goal = buildDailyGoal({
      hardSets: STRENGTH_TARGET_PER_DAY * 3,
      metMinutes: CARDIO_TARGET_MET_MIN_PER_DAY * 3,
    });
    expect(goal.strength.remaining).toBe(0);
    expect(goal.cardio.remaining).toBe(0);
    expect(goal.strength.fraction).toBe(1);
    // But the real size of the day is still reported, so "just met" and
    // "tripled it" are distinguishable in text.
    expect(goal.strength.overshoot).toBeCloseTo(3, 1);
  });

  it("never shows nothing to go beside an open ring", () => {
    // A hair under the target: `remaining` rounds to 0.0, so the label reads
    // "0 sets to go". Deciding `met` on the raw value would leave that sitting
    // beside an unticked label and an unclosed ring.
    const goal = buildDailyGoal({
      hardSets: STRENGTH_TARGET_PER_DAY - 0.02,
      metMinutes: 0,
    });
    expect(goal.strength.remaining).toBe(0);
    expect(goal.strength.met).toBe(true);
    expect(goal.strength.fraction).toBe(1);
  });

  it("still owes a visible amount when it is genuinely short", () => {
    const goal = buildDailyGoal({ hardSets: STRENGTH_TARGET_PER_DAY - 1, metMinutes: 0 });
    expect(goal.strength.remaining).toBe(1);
    expect(goal.strength.met).toBe(false);
    expect(goal.strength.fraction).toBeLessThan(1);
  });

  it("counts steps toward cardio, the way the balance marker does", () => {
    // A day view that disagreed with the stats page about whether a walking day
    // was cardio would be the app arguing with itself.
    const walked = buildDailyGoal({ hardSets: 0, metMinutes: 0, stepMetMinutes: 40 });
    expect(walked.cardio.done).toBe(40);
    expect(walked.empty).toBe(false);
  });

  it("treats one side being done as neither empty nor complete", () => {
    const goal = buildDailyGoal({ hardSets: STRENGTH_TARGET_PER_DAY, metMinutes: 0 });
    expect(goal.strength.met).toBe(true);
    expect(goal.cardio.met).toBe(false);
    expect(goal.complete).toBe(false);
    expect(goal.empty).toBe(false);
  });

  it("shrugs off nonsense rather than rendering NaN into a ring", () => {
    const goal = buildDailyGoal({ hardSets: Number.NaN, metMinutes: -5 });
    expect(goal.strength.done).toBe(0);
    expect(goal.cardio.done).toBe(0);
    expect(goal.strength.fraction).toBe(0);
  });
});

describe("what is left, in something you can go and do", () => {
  it("states the strength remainder in the unit it is measured in", () => {
    // No translation step any more: the target is counted in hard sets, so the
    // remainder — about four sets — is already the thing to go and do. It used
    // to be divided by an assumed 2.2 effective sets per set, which was right
    // on average and wrong by a factor of two for real movements.
    expect(buildDailyGoal(nothing).strength.remaining).toBeCloseTo(3.9, 1);
  });

  it("turns MET-minutes into minutes of effort", () => {
    // ~86 MET-minutes at the app's generic vigorous 6 METs.
    expect(remainingCardioMinutes(buildDailyGoal(nothing))).toBe(14);
  });

  it("asks for nothing more once a side is done", () => {
    const goal = buildDailyGoal({
      hardSets: STRENGTH_TARGET_PER_DAY,
      metMinutes: CARDIO_TARGET_MET_MIN_PER_DAY,
    });
    expect(goal.strength.remaining).toBe(0);
    expect(remainingCardioMinutes(goal)).toBe(0);
  });
});

describe("goalHeadline", () => {
  it("never scolds, whatever the day looks like", () => {
    expect(goalHeadline(buildDailyGoal(nothing))).toBe("The whole day is still ahead");
    expect(
      goalHeadline(buildDailyGoal({ hardSets: 2, metMinutes: 10 })),
    ).toBe("Part way there");
    expect(
      goalHeadline(
        buildDailyGoal({ hardSets: STRENGTH_TARGET_PER_DAY, metMinutes: 0 }),
      ),
    ).toBe("Strength done — cardio still open");
    expect(
      goalHeadline(
        buildDailyGoal({ hardSets: 0, metMinutes: CARDIO_TARGET_MET_MIN_PER_DAY }),
      ),
    ).toBe("Cardio done — strength still open");
    expect(
      goalHeadline(
        buildDailyGoal({
          hardSets: STRENGTH_TARGET_PER_DAY,
          metMinutes: CARDIO_TARGET_MET_MIN_PER_DAY,
        }),
      ),
    ).toBe("Both targets met today");
  });
});
