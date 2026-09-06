/**
 * Local-day helpers.
 *
 * Everything the app buckets by day uses a "YYYY-MM-DD" string in the *local*
 * timezone (the container's TZ), never a UTC date. A snack at 23:30 belongs to
 * that evening, not to tomorrow morning in UTC.
 *
 * All date arithmetic happens at local noon rather than midnight: adding 24h to
 * a midnight Date lands on 23:00 the previous day across a spring-forward DST
 * boundary, whereas noon has 11 hours of slack in either direction.
 */

export type LocalDate = string; // "YYYY-MM-DD"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalDate(value: string): value is LocalDate {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d, 12);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/** Format a Date as a local "YYYY-MM-DD" string. */
export function toLocalDate(date: Date): LocalDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse "YYYY-MM-DD" to a Date at local noon (safe for day arithmetic). */
export function parseLocalDate(value: LocalDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Local midnight for a "YYYY-MM-DD" — the inclusive start of that day. */
export function startOfLocalDay(value: LocalDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Local midnight of the following day — the exclusive end of that day. */
export function endOfLocalDay(value: LocalDate): Date {
  return startOfLocalDay(addDays(value, 1));
}

export function todayLocalDate(): LocalDate {
  return toLocalDate(new Date());
}

export function addDays(value: LocalDate, days: number): LocalDate {
  const d = parseLocalDate(value);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

export function addMonths(value: LocalDate, months: number): LocalDate {
  const d = parseLocalDate(value);
  const targetMonth = d.getMonth() + months;
  const anchor = new Date(d.getFullYear(), targetMonth, 1, 12);
  // Clamp: 31 Jan + 1 month should be 28/29 Feb, not 2/3 Mar.
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12).getDate();
  anchor.setDate(Math.min(d.getDate(), lastDay));
  return toLocalDate(anchor);
}

/** Whole days from `from` to `to`, ignoring time of day. Negative if `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const ms = parseLocalDate(to).getTime() - parseLocalDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Inclusive list of dates from `start` to `end`. */
export function enumerateDates(start: LocalDate, end: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let cur = start; daysBetween(cur, end) >= 0; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

/**
 * The inclusive date range covering the last `days` days ending today —
 * `windowRange(7)` is today plus the six days before it.
 */
export function windowRange(days: number, today: LocalDate = todayLocalDate()) {
  return { start: addDays(today, -(days - 1)), end: today };
}

/** The equally sized window immediately before `windowRange(days)`. */
export function previousWindowRange(days: number, today: LocalDate = todayLocalDate()) {
  const end = addDays(today, -days);
  return { start: addDays(end, -(days - 1)), end };
}

/**
 * Weeks of the month containing `value`, Monday-first, padded with the
 * neighbouring months' days so every row has seven cells.
 */
export function monthGrid(value: LocalDate): LocalDate[][] {
  const d = parseLocalDate(value);
  const first = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);

  // getDay() is Sunday-0; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7;
  const trailing = (7 - ((leading + last.getDate()) % 7)) % 7;

  const gridStart = addDays(toLocalDate(first), -leading);
  const gridEnd = addDays(toLocalDate(last), trailing);

  const all = enumerateDates(gridStart, gridEnd);
  const weeks: LocalDate[][] = [];
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));
  return weeks;
}

export function monthOf(value: LocalDate): number {
  return parseLocalDate(value).getMonth();
}

/**
 * Display formatting is always given an explicit timezone.
 *
 * Day bucketing happens on the server in the configured zone, so formatting
 * times in whatever zone the *browser* happens to be in would both display the
 * wrong clock time and desynchronise server and client rendering (a React
 * hydration mismatch). Passing the zone explicitly keeps the two in agreement
 * regardless of where the phone thinks it is.
 */
export type TimeZone = string | undefined;

function formatter(options: Intl.DateTimeFormatOptions, timeZone: TimeZone) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone });
}

/** "Sun 6 Sep", or "Sun 6 Sep 2025" when the date is not in the current year. */
export function formatDayLabel(value: LocalDate, timeZone?: TimeZone): string {
  const d = parseLocalDate(value);
  const currentYear = Number(value.slice(0, 4)) === new Date().getFullYear();
  return formatter(
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(currentYear ? {} : { year: "numeric" }),
      // The label describes a calendar date, not an instant: forcing a zone
      // here could shift it across midnight. parseLocalDate already anchors
      // at local noon, so read it back in the same local frame.
    },
    undefined,
  ).format(d);
}

export function formatMonthLabel(value: LocalDate): string {
  return formatter({ month: "long", year: "numeric" }, undefined).format(parseLocalDate(value));
}

/** Clock time of an instant, in the app's configured zone. */
export function formatTime(date: Date, timeZone?: TimeZone): string {
  return formatter({ hour: "2-digit", minute: "2-digit", hour12: false }, timeZone).format(date);
}

/** "YYYY-MM-DD" for an instant as seen in the given zone. */
export function toLocalDateInZone(date: Date, timeZone?: TimeZone): LocalDate {
  if (!timeZone) return toLocalDate(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA already yields YYYY-MM-DD
}

export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
