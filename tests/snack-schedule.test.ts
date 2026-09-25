import { describe, expect, it } from "vitest";
import {
  ALL_DAYS,
  FOLLOW_UP_AFTER_MIN,
  MIN_SLOT_GAP_MIN,
  WEEKDAYS_ONLY,
  busyOn,
  formatMinute,
  isDayOn,
  nudgeDue,
  planDay,
  weekdayIndex,
} from "@/lib/snack/schedule";
import { daySpacing } from "@/lib/spacing";

const at = (h: number, m = 0) => h * 60 + m;
const WINDOW = { startHour: 8, endHour: 22 };

describe("planning the rest of the day", () => {
  it("spreads the day's snacks evenly, which is exactly what the spacing score rewards", () => {
    const slots = planDay({ nowMin: at(7), window: WINDOW, targetBouts: 5, boutMinutes: [] });
    expect(slots.map((s) => formatMinute(s.minute))).toEqual(["10:20", "12:40", "15:00", "17:20", "19:40"]);
    expect(slots.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);

    // Doing every snack when planned scores a perfect spread.
    const score = daySpacing(slots.map((s) => s.minute), WINDOW, 5).score;
    expect(score).toBe(1);
  });

  it("re-spreads behind the last snack when one is logged early", () => {
    const slots = planDay({ nowMin: at(9, 5), window: WINDOW, targetBouts: 5, boutMinutes: [at(9)] });
    expect(slots[0].number).toBe(2);
    expect(slots).toHaveLength(4);
    // Evenly from 09:00 to 22:00 with four more: every 156 minutes.
    expect(slots.map((s) => s.minute)).toEqual([at(9) + 156, at(9) + 312, at(9) + 468, at(9) + 624]);
  });

  it("makes the next one due now, and closes up the rest, when the day is behind", () => {
    const slots = planDay({ nowMin: at(13), window: WINDOW, targetBouts: 5, boutMinutes: [] });
    expect(slots[0].minute).toBe(at(13));
    expect(slots).toHaveLength(5);
    const gaps = slots.slice(1).map((s, i) => s.minute - slots[i].minute);
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBe(1);
  });

  it("has nothing left to plan once the target is met", () => {
    const bouts = [at(9), at(11), at(13), at(15), at(17)];
    expect(planDay({ nowMin: at(18), window: WINDOW, targetBouts: 5, boutMinutes: bouts })).toEqual([]);
  });

  it("routes around busy time", () => {
    const busy = [{ startMin: at(10), endMin: at(11) }];
    const slots = planDay({ nowMin: at(7), window: WINDOW, targetBouts: 5, boutMinutes: [], busy });
    expect(slots[0].minute).toBe(at(11));
    expect(slots.every((s) => s.minute < at(10) || s.minute >= at(11))).toBe(true);
  });

  it("waits out a pause", () => {
    const slots = planDay({ nowMin: at(13), window: WINDOW, targetBouts: 5, boutMinutes: [], notBeforeMin: at(15) });
    expect(slots[0].minute).toBe(at(15));
  });

  it("drops what no longer fits rather than cramming the evening", () => {
    // Five still owed with half an hour left: only what fits at the minimum
    // gap, and none in the last ten minutes.
    const slots = planDay({ nowMin: at(21, 30), window: WINDOW, targetBouts: 5, boutMinutes: [] });
    expect(slots.map((s) => formatMinute(s.minute))).toEqual(["21:30", "21:50"]);
    const late = planDay({ nowMin: at(21, 55), window: WINDOW, targetBouts: 5, boutMinutes: [] });
    expect(late).toEqual([]);
  });

  it("never plans two snacks on top of each other", () => {
    const slots = planDay({ nowMin: at(20), window: WINDOW, targetBouts: 12, boutMinutes: [] });
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i].minute - slots[i - 1].minute).toBeGreaterThanOrEqual(MIN_SLOT_GAP_MIN);
    }
  });
});

describe("busy blocks", () => {
  it("apply only on their days, merged", () => {
    // 2026-09-25 is a Friday; 2026-09-26 a Saturday.
    expect(weekdayIndex("2026-09-25")).toBe(4);
    expect(isDayOn(WEEKDAYS_ONLY, "2026-09-25")).toBe(true);
    expect(isDayOn(WEEKDAYS_ONLY, "2026-09-26")).toBe(false);
    expect(isDayOn(ALL_DAYS, "2026-09-27")).toBe(true);

    const blocks = [
      { days: WEEKDAYS_ONLY, startMin: at(9), endMin: at(9, 30) },
      { days: WEEKDAYS_ONLY, startMin: at(9, 15), endMin: at(10) },
      { days: 64, startMin: at(12), endMin: at(13) },
    ];
    expect(busyOn(blocks, "2026-09-25")).toEqual([{ startMin: at(9), endMin: at(10) }]);
    expect(busyOn(blocks, "2026-09-27")).toEqual([{ startMin: at(12), endMin: at(13) }]);
  });
});

describe("deciding to nudge", () => {
  const slots = [{ minute: at(10, 20), number: 1 }, { minute: at(12, 40), number: 2 }];

  it("nudges once when a snack comes due", () => {
    expect(nudgeDue({ nowMin: at(10), slots, sent: [], maxPerDay: 6, followUp: true })).toBeNull();
    expect(nudgeDue({ nowMin: at(10, 20), slots, sent: [], maxPerDay: 6, followUp: true })).toEqual({ slot: 1, attempt: 0 });
    const sent = [{ slot: 1, attempt: 0, sentMin: at(10, 20) }];
    expect(nudgeDue({ nowMin: at(10, 30), slots, sent, maxPerDay: 6, followUp: true })).toBeNull();
  });

  it("follows up once, and only if asked to", () => {
    const sent = [{ slot: 1, attempt: 0, sentMin: at(10, 20) }];
    const later = at(10, 20) + FOLLOW_UP_AFTER_MIN;
    expect(nudgeDue({ nowMin: later, slots, sent, maxPerDay: 6, followUp: true })).toEqual({ slot: 1, attempt: 1 });
    expect(nudgeDue({ nowMin: later, slots, sent, maxPerDay: 6, followUp: false })).toBeNull();
    const twice = [...sent, { slot: 1, attempt: 1, sentMin: later }];
    expect(nudgeDue({ nowMin: later + 60, slots, sent: twice, maxPerDay: 6, followUp: true })).toBeNull();
  });

  it("comes back when snoozed, however follow-ups are set", () => {
    const sent = [{ slot: 1, attempt: 0, sentMin: at(10, 20) }];
    expect(nudgeDue({ nowMin: at(10, 45), slots, sent, maxPerDay: 6, followUp: false, snoozedUntilMin: at(10, 50) })).toBeNull();
    expect(nudgeDue({ nowMin: at(10, 50), slots, sent, maxPerDay: 6, followUp: false, snoozedUntilMin: at(10, 50) })).toEqual({ slot: 1, attempt: 1 });
  });

  it("stays quiet in busy time, outside waking hours, and past the daily cap", () => {
    const busy = [{ startMin: at(10), endMin: at(11) }];
    expect(nudgeDue({ nowMin: at(10, 20), slots, sent: [], maxPerDay: 6, followUp: true, busy })).toBeNull();
    expect(nudgeDue({ nowMin: at(23), slots: [{ minute: at(22, 30), number: 1 }], sent: [], maxPerDay: 6, followUp: true })).toBeNull();
    const many = Array.from({ length: 3 }, (_, i) => ({ slot: 0, attempt: i, sentMin: at(9) }));
    expect(nudgeDue({ nowMin: at(10, 20), slots, sent: many, maxPerDay: 3, followUp: true })).toBeNull();
  });

  it("starts a new cycle for the next snack once one is logged", () => {
    const sent = [{ slot: 1, attempt: 0, sentMin: at(10, 20) }];
    const nextSlots = [{ minute: at(12, 40), number: 2 }];
    expect(nudgeDue({ nowMin: at(12, 40), slots: nextSlots, sent, maxPerDay: 6, followUp: true })).toEqual({ slot: 2, attempt: 0 });
  });
});
