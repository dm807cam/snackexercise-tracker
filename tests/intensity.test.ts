import { describe, expect, it } from "vitest";
import {
  MODERATE_HRMAX,
  UNKNOWN_PHYSIOLOGY,
  VIGOROUS_HRMAX,
  VIGOROUS_HRR,
  VIGOROUS_METS,
  ageFrom,
  classifyIntensity,
  emptyIntensity,
  maxHeartRate,
  personalHeartRateFactor,
  normalisePhysiologyInput,
  relativeIntensity,
  summariseIntensity,
  type Physiology,
} from "@/lib/intensity";
import { daysBetween } from "@/lib/dates";
import { heartRateFactor } from "@/lib/cardio";

const TODAY = "2026-09-11";
const YOUNG: Physiology = { birthYear: 2001, restingHr: null };
const OLDER: Physiology = { birthYear: 1966, restingHr: null };

describe("maxHeartRate", () => {
  it("is Tanaka, not 220 minus age", () => {
    // 220 - age was never derived from data and under-predicts for older adults
    // by around ten beats, which makes every effort look harder than it was.
    expect(maxHeartRate(25)).toBeCloseTo(190.5, 1);
    expect(maxHeartRate(60)).toBeCloseTo(166, 1);
    expect(maxHeartRate(60)).toBeGreaterThan(220 - 60);
  });
});

describe("ageFrom", () => {
  it("reads an age off the year", () => {
    expect(ageFrom(2001, TODAY)).toBe(25);
  });

  it("refuses an implausible one rather than computing with it", () => {
    expect(ageFrom(null, TODAY)).toBeNull();
    expect(ageFrom(2025, TODAY)).toBeNull();
    expect(ageFrom(1850, TODAY)).toBeNull();
    expect(ageFrom(Number.NaN, TODAY)).toBeNull();
  });
});

describe("relativeIntensity", () => {
  it("uses heart-rate reserve when a resting rate is known", () => {
    const result = relativeIntensity(130, { birthYear: 1986, restingHr: 50 }, TODAY)!;
    expect(result.scale).toBe("hrr");

    // 40 years old: HRmax 180, reserve 130, so 130 bpm is (130-50)/130.
    expect(result.value).toBeCloseTo(80 / 130, 5);
  });

  it("separates two people at the same bpm with different resting rates", () => {
    // The whole reason Karvonen exists, and the thing %HRmax cannot see.
    const fit = relativeIntensity(130, { birthYear: 1986, restingHr: 45 }, TODAY)!;
    const less = relativeIntensity(130, { birthYear: 1986, restingHr: 75 }, TODAY)!;
    expect(fit.value).toBeGreaterThan(less.value);
  });

  it("falls back to %HRmax with only an age", () => {
    const result = relativeIntensity(150, YOUNG, TODAY)!;
    expect(result.scale).toBe("hrmax");
    expect(result.value).toBeCloseTo(150 / maxHeartRate(25), 5);
  });

  it("says nothing at all when the app has not been told an age", () => {
    expect(relativeIntensity(150, UNKNOWN_PHYSIOLOGY, TODAY)).toBeNull();
  });
});

describe("classifyIntensity", () => {
  it("reads the same heart rate differently for different ages", () => {
    // The defect this fixes: 150 bpm is ~79% of a 25-year-old's maximum and
    // ~90% of a 60-year-old's, and the app scored both identically.
    const entry = { mets: 8, avgHeartRate: 150 };
    expect(relativeIntensity(150, YOUNG, TODAY)!.value).toBeLessThan(
      relativeIntensity(150, OLDER, TODAY)!.value,
    );
    expect(classifyIntensity(entry, OLDER, TODAY)).toBe("vigorous");
  });

  it("prefers a measured heart rate to the movement's nominal cost", () => {
    // A "vigorous" movement performed gently is not vigorous, and only the
    // heart rate can say so.
    const gentle = { mets: 9.8, avgHeartRate: 100 };
    expect(classifyIntensity(gentle, YOUNG, TODAY)).not.toBe("vigorous");
    // Without an age there is no personal scale, so METs decide — and the
    // movement's nominal cost calls it vigorous.
    expect(classifyIntensity(gentle, UNKNOWN_PHYSIOLOGY, TODAY)).toBe("vigorous");
  });

  it("falls back to METs on the ACSM bands", () => {
    expect(classifyIntensity({ mets: VIGOROUS_METS, avgHeartRate: null }, YOUNG, TODAY)).toBe(
      "vigorous",
    );
    expect(classifyIntensity({ mets: 4, avgHeartRate: null }, YOUNG, TODAY)).toBe("moderate");
    expect(classifyIntensity({ mets: 2, avgHeartRate: null }, YOUNG, TODAY)).toBe("light");
  });

  it("uses the ACSM thresholds on whichever scale applies", () => {
    const hrMax = maxHeartRate(25);
    expect(
      classifyIntensity({ mets: 5, avgHeartRate: hrMax * VIGOROUS_HRMAX }, YOUNG, TODAY),
    ).toBe("vigorous");
    expect(
      classifyIntensity({ mets: 5, avgHeartRate: hrMax * (MODERATE_HRMAX + 0.01) }, YOUNG, TODAY),
    ).toBe("moderate");

    const withResting: Physiology = { birthYear: 1986, restingHr: 50 };
    const reserve = maxHeartRate(40) - 50;
    expect(
      classifyIntensity(
        { mets: 5, avgHeartRate: 50 + reserve * VIGOROUS_HRR },
        withResting,
        TODAY,
      ),
    ).toBe("vigorous");
  });
});

describe("personalHeartRateFactor", () => {
  it("returns nothing when the app cannot place the reading, so the old anchor stands", () => {
    // The guarantee that entering an age IMPROVES the estimate rather than
    // restating every heart rate already logged.
    expect(personalHeartRateFactor(150, UNKNOWN_PHYSIOLOGY, TODAY)).toBeNull();
  });

  it("scores the same reading harder for an older heart", () => {
    expect(personalHeartRateFactor(150, OLDER, TODAY)!).toBeGreaterThan(
      personalHeartRateFactor(150, YOUNG, TODAY)!,
    );
  });

  it("keeps the clamp, so one sensor misread cannot triple a session", () => {
    expect(personalHeartRateFactor(250, YOUNG, TODAY)).toBeLessThanOrEqual(1.6);
    expect(personalHeartRateFactor(40, YOUNG, TODAY)).toBeGreaterThanOrEqual(0.6);
  });

  it("is bounded the same way the fixed anchor is", () => {
    for (const bpm of [40, 90, 150, 250]) {
      const personal = personalHeartRateFactor(bpm, YOUNG, TODAY)!;
      expect(personal).toBeGreaterThanOrEqual(0.6);
      expect(personal).toBeLessThanOrEqual(1.6);
      expect(heartRateFactor(bpm)).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("refuses nonsense rather than returning a factor for it", () => {
    expect(personalHeartRateFactor(0, YOUNG, TODAY)).toBeNull();
    expect(personalHeartRateFactor(Number.NaN, YOUNG, TODAY)).toBeNull();
  });
});

interface Row {
  localDate: string;
  intensity: "light" | "moderate" | "vigorous";
  metMinutes: number;
  minutes: number;
}

function summarise(entries: Row[], windowDays = 28) {
  return summariseIntensity<Row>({
    entries,
    windowDays,
    physiology: YOUNG,
    today: TODAY,
    classify: (e) => e.intensity,
    metMinutesFor: (e) => e.metMinutes,
    minutesFor: (e) => e.minutes,
    dateOf: (e) => e.localDate,
    daysBetween,
  });
}

describe("summariseIntensity", () => {
  it("counts vigorous minutes, MET-minutes and bouts separately", () => {
    // Bouts as well as minutes, because this app's format is the short effort a
    // minutes-based target rounds away: four stair-sprints is four minutes.
    const result = summarise([
      { localDate: "2026-09-10", intensity: "vigorous", metMinutes: 20, minutes: 2 },
      { localDate: "2026-09-10", intensity: "vigorous", metMinutes: 20, minutes: 2 },
      { localDate: "2026-09-09", intensity: "moderate", metMinutes: 60, minutes: 15 },
    ]);

    expect(result.vigorousBouts).toBe(2);
    expect(result.vigorousMinutes).toBe(4);
    expect(result.vigorousMetMinutes).toBe(40);
  });

  it("ignores strength work, which has no MET-minutes to be vigorous with", () => {
    // cardioBias scales a lift's MET-minutes to zero, and counting it here
    // would report a heavy set of squats as vigorous cardio.
    const result = summarise([
      { localDate: "2026-09-10", intensity: "vigorous", metMinutes: 0, minutes: 3 },
    ]);
    expect(result.vigorousBouts).toBe(0);
    expect(result.daysSinceVigorous).toBeNull();
  });

  it("answers the question the app could not ask before", () => {
    const result = summarise([
      { localDate: "2026-08-31", intensity: "vigorous", metMinutes: 30, minutes: 3 },
    ]);
    expect(result.daysSinceVigorous).toBe(11);
  });

  it("normalises per week so windows are comparable", () => {
    const result = summarise(
      [{ localDate: "2026-09-10", intensity: "vigorous", metMinutes: 70, minutes: 14 }],
      28,
    );
    expect(result.vigorousMinutesPerWeek).toBeCloseTo(3.5, 5);
  });

  it("reports whether the reading was personalised at all", () => {
    expect(summarise([]).personalised).toBe(true);
    expect(
      summariseIntensity<Row>({
        entries: [],
        windowDays: 7,
        physiology: UNKNOWN_PHYSIOLOGY,
        today: TODAY,
        classify: (e) => e.intensity,
        metMinutesFor: (e) => e.metMinutes,
        minutesFor: (e) => e.minutes,
        dateOf: (e) => e.localDate,
        daysBetween,
      }).personalised,
    ).toBe(false);
  });

  it("has an empty shape that says nothing rather than claiming zero effort", () => {
    expect(emptyIntensity().daysSinceVigorous).toBeNull();
    expect(emptyIntensity().personalised).toBe(false);
  });
});

describe("normalisePhysiologyInput", () => {
  it("keeps a plausible year and rate", () => {
    expect(normalisePhysiologyInput({ birthYear: "1986", restingHr: "55" })).toEqual({
      birthYear: "1986",
      restingHr: "55",
    });
  });

  it("clamps rather than storing something the app will then ignore", () => {
    // Saving verbatim left getPhysiology silently discarding the value under a
    // "Saved" toast, with the field still showing it.
    expect(normalisePhysiologyInput({ birthYear: "1890" }).birthYear).toBe("1900");
    expect(normalisePhysiologyInput({ restingHr: "5" }).restingHr).toBe("30");
    expect(normalisePhysiologyInput({ restingHr: "300" }).restingHr).toBe("120");
  });

  it("treats empty as cleared, not as zero", () => {
    expect(normalisePhysiologyInput({ birthYear: "  " }).birthYear).toBe("");
    expect(normalisePhysiologyInput({ restingHr: "" }).restingHr).toBe("");
  });

  it("only touches the fields it was given", () => {
    expect(normalisePhysiologyInput({ birthYear: "1986" })).toEqual({ birthYear: "1986" });
  });
});
