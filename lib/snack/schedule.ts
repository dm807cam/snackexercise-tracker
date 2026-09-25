/**
 * When today's remaining snacks should happen, and whether it is time to say
 * so. Pure functions, no database access — lib/jobs/nudges.ts supplies the day.
 *
 * THE SAME OPINION AS THE SPACING SCORE. lib/spacing.ts scores a day by how
 * evenly its bouts cut the waking window into gaps, against a target number of
 * bouts. The schedule is that ideal, run forward from wherever the day actually
 * is: the remaining bouts spread evenly across what is left of the window,
 * measured from the last bout. So following the nudges IS scoring well, and
 * the two can never drift into disagreeing about what a good day looks like.
 *
 * It re-plans continuously. Log a snack early and the rest of the day spreads
 * out behind it; miss one and the rest close up, starting now. Nothing
 * accumulates as a debt: a day that is behind is re-spread, not made to catch
 * up — the same no-carry-over rule the daily rings follow (ADR 0014).
 *
 * BUSY TIME is routed around, never nudged through: a slot that lands in the
 * 09:00 stand-up moves to when it ends. And a slot that no longer fits before
 * the end of the waking window is dropped rather than squeezed in — five
 * nudges in the last hour of the evening would be the app nagging, not
 * helping.
 */

import { DEFAULT_ACTIVE_WINDOW, normaliseTargetBouts, type ActiveWindow } from "../spacing";

export interface BusyInterval {
  startMin: number;
  endMin: number;
}

/** A recurring busy block, as stored. `days`: Monday = 1 ... Sunday = 64. */
export interface BusyBlockSpec {
  days: number;
  startMin: number;
  endMin: number;
}

export interface Slot {
  /** Minutes since local midnight. */
  minute: number;
  /** Which of the day's snacks this is, 1-based. */
  number: number;
}

export interface ScheduleInput {
  nowMin: number;
  window?: ActiveWindow;
  targetBouts: number;
  /** Today's bouts so far, minutes since midnight (lib/spacing.ts merges them). */
  boutMinutes: readonly number[];
  busy?: readonly BusyInterval[];
  /** Nothing before this minute today: a pause, or a snooze. */
  notBeforeMin?: number | null;
}

/**
 * Two snacks closer than this are one snack with a break in it. Also the
 * minimum lead a slot needs over now to be planned rather than due.
 */
export const MIN_SLOT_GAP_MIN = 20;
/** A slot this close to the end of the waking window is not worth a nudge. */
const END_MARGIN_MIN = 10;

export const WEEKDAY_BITS = [1, 2, 4, 8, 16, 32, 64] as const;
export const ALL_DAYS = 127;
export const WEEKDAYS_ONLY = 31;

/** Monday = 0 ... Sunday = 6, for a "YYYY-MM-DD". */
export function weekdayIndex(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  const sunday0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (sunday0 + 6) % 7;
}

export function isDayOn(days: number, localDate: string): boolean {
  return (days & WEEKDAY_BITS[weekdayIndex(localDate)]) !== 0;
}

/** The busy intervals that apply on a given day, merged and sorted. */
export function busyOn(blocks: readonly BusyBlockSpec[], localDate: string): BusyInterval[] {
  const today = blocks
    .filter((b) => isDayOn(b.days, localDate) && b.endMin > b.startMin)
    .map((b) => ({ startMin: b.startMin, endMin: b.endMin }))
    .sort((a, b) => a.startMin - b.startMin);
  const merged: BusyInterval[] = [];
  for (const interval of today) {
    const last = merged[merged.length - 1];
    if (last && interval.startMin <= last.endMin) last.endMin = Math.max(last.endMin, interval.endMin);
    else merged.push({ ...interval });
  }
  return merged;
}

export function isBusyAt(busy: readonly BusyInterval[], minute: number): boolean {
  return busy.some((b) => minute >= b.startMin && minute < b.endMin);
}

function outOfBusy(busy: readonly BusyInterval[], minute: number): number {
  let current = minute;
  // Intervals are sorted and merged, so one pass suffices.
  for (const b of busy) {
    if (current >= b.startMin && current < b.endMin) current = b.endMin;
  }
  return current;
}

/** The rest of today's snacks, in order. Empty when the day's target is met. */
export function planDay(input: ScheduleInput): Slot[] {
  const window = input.window ?? DEFAULT_ACTIVE_WINDOW;
  const startMin = window.startHour * 60;
  const endMin = window.endHour * 60;
  const target = normaliseTargetBouts(input.targetBouts);
  const done = input.boutMinutes.length;
  const remaining = target - done;
  if (remaining <= 0 || endMin <= startMin) return [];

  const last = done > 0 ? Math.max(...input.boutMinutes) : null;
  const anchor = Math.max(startMin, last ?? startMin);
  const earliest = Math.max(input.nowMin, input.notBeforeMin ?? 0, startMin);
  if (earliest >= endMin - END_MARGIN_MIN) return [];

  // On schedule: the ideal gaps, measured from the last bout.
  let minutes: number[] = [];
  const gap = (endMin - anchor) / (remaining + 1);
  if (anchor + gap >= earliest) {
    for (let k = 1; k <= remaining; k += 1) minutes.push(anchor + k * gap);
  } else {
    // Behind: the next one is due now, and the rest spread over what is left.
    const spread = (endMin - earliest) / remaining;
    for (let k = 0; k < remaining; k += 1) minutes.push(earliest + k * spread);
  }

  const busy = input.busy ?? [];
  const placed: number[] = [];
  for (const raw of minutes) {
    let minute = outOfBusy(busy, Math.round(raw));
    const previous = placed[placed.length - 1] ?? last;
    if (previous != null && minute - previous < MIN_SLOT_GAP_MIN) {
      minute = outOfBusy(busy, previous + MIN_SLOT_GAP_MIN);
    }
    if (minute > endMin - END_MARGIN_MIN) break;
    placed.push(minute);
  }
  minutes = placed;

  return minutes.map((minute, index) => ({ minute, number: done + index + 1 }));
}

/** A reminder already sent today. */
export interface SentNudge {
  slot: number;
  attempt: number;
  sentMin: number;
}

export interface NudgeInput {
  nowMin: number;
  slots: readonly Slot[];
  sent: readonly SentNudge[];
  maxPerDay: number;
  /** One reminder, FOLLOW_UP_AFTER_MIN after the first, if nothing was logged. */
  followUp: boolean;
  /** When the user tapped "in 30 minutes", if they did and it is still today. */
  snoozedUntilMin?: number | null;
  window?: ActiveWindow;
  busy?: readonly BusyInterval[];
}

export const FOLLOW_UP_AFTER_MIN = 45;
/** First reminder, one follow-up or snooze, and one more snooze: then leave it. */
export const MAX_ATTEMPTS_PER_SLOT = 3;

/**
 * Whether to send a nudge now, and which. At most one per snack slot unless the
 * user asked to be reminded again (a snooze) or opted into a single follow-up;
 * never outside waking hours or inside busy time; never past the daily cap.
 */
export function nudgeDue(input: NudgeInput): { slot: number; attempt: number } | null {
  const window = input.window ?? DEFAULT_ACTIVE_WINDOW;
  if (input.nowMin < window.startHour * 60 || input.nowMin >= window.endHour * 60) return null;
  if (isBusyAt(input.busy ?? [], input.nowMin)) return null;
  if (input.sent.length >= input.maxPerDay) return null;

  const next = input.slots[0];
  if (!next || next.minute > input.nowMin) return null;

  const forSlot = input.sent.filter((n) => n.slot === next.number).sort((a, b) => a.attempt - b.attempt);
  if (forSlot.length === 0) return { slot: next.number, attempt: 0 };
  if (forSlot.length >= MAX_ATTEMPTS_PER_SLOT) return null;

  const latest = forSlot[forSlot.length - 1];
  const attempt = latest.attempt + 1;

  const snoozed = input.snoozedUntilMin;
  if (snoozed != null && snoozed > latest.sentMin && input.nowMin >= snoozed) return { slot: next.number, attempt };

  if (input.followUp && forSlot.length === 1 && snoozed == null && input.nowMin - latest.sentMin >= FOLLOW_UP_AFTER_MIN) {
    return { slot: next.number, attempt };
  }
  return null;
}

export function formatMinute(minute: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
