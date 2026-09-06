import { parseLocalDate, todayLocalDate, type LocalDate } from "./dates";

/**
 * Combine the day being logged with a spoken "HH:MM" into a timestamp.
 *
 * With no stated time the entry is stamped now when logging today, and at
 * midday when back-filling an earlier day — a back-filled snack has no real
 * clock time, and midday keeps it in the middle of the day's list rather than
 * pretending it happened at 00:00.
 */
export function resolvePerformedAt(
  date: LocalDate,
  timeHint: string | null,
  now: Date = new Date(),
): Date {
  if (!timeHint) {
    return date === todayLocalDate() ? now : parseLocalDate(date);
  }

  const [hours, minutes] = timeHint.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
    return date === todayLocalDate() ? now : parseLocalDate(date);
  }

  const stamped = parseLocalDate(date);
  stamped.setHours(hours, minutes, 0, 0);
  return stamped;
}
