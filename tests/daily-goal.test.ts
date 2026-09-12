import { describe, expect, it } from "vitest";
import {
  CARDIO_GUIDELINE_FLOOR_PER_DAY,
  MAX_STEP_SHARE_OF_CARDIO_RING,
  buildDailyGoal,
  dailyTargets,
  goalHeadline,
  remainingCardioMinutes,
} from "@/lib/daily-goal";
import { GUIDELINE_TARGETS, LONGEVITY_TARGETS } from "@/lib/targets";

const { strength: STRENGTH_TARGET_PER_DAY, cardio: CARDIO_TARGET_MET_MIN_PER_DAY } =
  dailyTargets();

const nothing = { hardSets: 0, metMinutes: 0 };

describe("the daily targets", () => {
  it("are a seventh of the weekly guidelines, derived rather than restated", () => {
    // The one thing that must never drift: if a weekly target is ever edited,
    // the day view has to move with it rather than keep its own copy.
    expect(STRENGTH_TARGET_PER_DAY).toBeCloseTo(GUIDELINE_TARGETS.strengthHardSetsPerWeek / 7, 10);
    expect(CARDIO_TARGET_MET_MIN_PER_DAY).toBeCloseTo(
      GUIDELINE_TARGETS.cardioMetMinutesPerWeek / 7,
      10,
    );
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

describe("configurable targets", () => {
  it("takes a seventh of whatever the user is aiming at", () => {
    const perDay = dailyTargets(LONGEVITY_TARGETS);
    expect(perDay.cardio).toBeCloseTo(LONGEVITY_TARGETS.cardioMetMinutesPerWeek / 7, 10);

    // The longevity preset raises cardio and leaves strength alone, because the
    // mortality-optimal resistance dose is LOWER than the hypertrophy one —
    // moving it would be moving away from the app's stated goal.
    expect(perDay.strength).toBe(dailyTargets(GUIDELINE_TARGETS).strength);
  });

  it("does not close the cardio ring at the guideline when aiming past it", () => {
    const goal = buildDailyGoal({
      hardSets: 0,
      metMinutes: GUIDELINE_TARGETS.cardioMetMinutesPerWeek / 7,
      targets: LONGEVITY_TARGETS,
    });
    expect(goal.cardio.met).toBe(false);
    expect(goal.cardioGuidelineMet).toBe(true);
  });

  it("still says the guideline was passed, rather than only that the target was not", () => {
    // Raising your sights must not erase the achievement of meeting the
    // public-health minimum: two claims, never averaged into one.
    const goal = buildDailyGoal({
      hardSets: 0,
      metMinutes: CARDIO_GUIDELINE_FLOOR_PER_DAY,
      targets: LONGEVITY_TARGETS,
    });
    expect(goalHeadline(goal)).toBe("Past the activity guideline — still short of your target");
  });

  it("marks the guideline on the ring only when it is somewhere short of the target", () => {
    expect(
      buildDailyGoal({ hardSets: 0, metMinutes: 0, targets: GUIDELINE_TARGETS })
        .cardioGuidelineFraction,
    ).toBe(1);

    const raised = buildDailyGoal({ hardSets: 0, metMinutes: 0, targets: LONGEVITY_TARGETS });
    expect(raised.cardioGuidelineFraction).toBeCloseTo(0.5, 2);
  });

  it("keeps the default behaviour when no targets are given", () => {
    const goal = buildDailyGoal({ hardSets: 0, metMinutes: 0 });
    expect(goal.cardio.target).toBeCloseTo(GUIDELINE_TARGETS.cardioMetMinutesPerWeek / 7, 1);
    expect(goal.cardioGuidelineFraction).toBe(1);
  });
});

describe("walking cannot close the cardio ring on its own", () => {
  const perDay = dailyTargets();

  it("caps the step credit at half the day's target", () => {
    // The defect: at the old flat 3.5 METs and half weight, about 9,400 steps
    // closed the ring with no cardio logged at all, and the headline read
    // "Cardio done — strength still open" for a walk to the shops.
    const walked = buildDailyGoal({ hardSets: 0, metMinutes: 0, stepMetMinutes: 1000 });

    expect(walked.cardio.met).toBe(false);
    expect(walked.cardio.done).toBeCloseTo(perDay.cardio * MAX_STEP_SHARE_OF_CARDIO_RING, 1);
    expect(walked.stepsCapped).toBe(true);
  });

  it("still lets walking contribute meaningfully", () => {
    // Capped, not discarded: the credit is real and the stats page counts all
    // of it. What the ring will not do is finish on walking alone.
    const walked = buildDailyGoal({ hardSets: 0, metMinutes: 0, stepMetMinutes: 20 });
    expect(walked.cardio.done).toBe(20);
    expect(walked.stepsCapped).toBe(false);
    expect(walked.empty).toBe(false);
  });

  it("lets logged cardio finish what walking started", () => {
    // The cap is on the steps, not on the ring: a real session on top of a
    // walking day closes it.
    const both = buildDailyGoal({
      hardSets: 0,
      metMinutes: perDay.cardio * 0.5,
      stepMetMinutes: 1000,
    });
    expect(both.cardio.met).toBe(true);
  });

  it("does not cap a day with no walking at all", () => {
    expect(buildDailyGoal({ hardSets: 0, metMinutes: 500 }).stepsCapped).toBe(false);
  });
});
