/**
 * A user's nudge preferences, read from their settings. Pure.
 *
 * Nudges are OFF until the user turns them on from a device, because turning
 * them on is also what subscribes that device — there is nothing to deliver to
 * before that, and an app that starts pinging a phone unasked is an app that
 * gets uninstalled.
 */

import { ALL_DAYS } from "./schedule";
import { MAX_SNACK_MINUTES, MIN_SNACK_MINUTES } from "./planner";

export interface NudgeSettings {
  enabled: boolean;
  followUp: boolean;
  maxPerDay: number;
  /** Weekday bitmask, Monday = 1 ... Sunday = 64. */
  days: number;
  /** The length of the snack a nudge proposes. */
  snackMinutes: number;
  pausedUntil: Date | null;
  snoozedUntil: Date | null;
}

export const DEFAULT_MAX_NUDGES = 6;
export const DEFAULT_SNACK_MINUTES = 3;

function intIn(value: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return value != null && value !== "" && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function instant(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function readNudgeSettings(settings: Record<string, string>): NudgeSettings {
  return {
    enabled: settings.nudges === "on",
    followUp: settings.nudgeFollowUp !== "off",
    maxPerDay: intIn(settings.nudgeMaxPerDay, 1, 24, DEFAULT_MAX_NUDGES),
    days: intIn(settings.nudgeDays, 1, ALL_DAYS, ALL_DAYS),
    snackMinutes: intIn(settings.snackMinutes, MIN_SNACK_MINUTES, MAX_SNACK_MINUTES, DEFAULT_SNACK_MINUTES),
    pausedUntil: instant(settings.nudgesPausedUntil),
    snoozedUntil: instant(settings.nudgeSnoozedUntil),
  };
}
