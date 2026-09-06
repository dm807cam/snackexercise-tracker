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
 * Display formatting.
 *
 * Labels are assembled from fixed tables rather than Intl's locale patterns.
 * Node and the browser can ship different ICU data — en-GB renders the same
 * date as "Sun 6 Sept" in one and "Sun, 6 Sept" in the other — which silently
 * breaks React hydration. Fixed tables render identically everywhere.
 *
 * Intl is still used where it does real work: converting an instant into the
 * app's configured timezone. Even there the pieces are read via formatToParts
 * and assembled here, so the punctuation is ours and not the locale's.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "Sun 6 Sep", or "Sun 6 Sep 2025" when the date is not in the current year. */
export function formatDayLabel(value: LocalDate, currentYear?: number): string {
  const d = parseLocalDate(value);
  const year = d.getFullYear();
  const label = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const reference = currentYear ?? new Date().getFullYear();
  return year === reference ? label : `${label} ${year}`;
}

export function formatMonthLabel(value: LocalDate): string {
  const d = parseLocalDate(value);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Clock time of an instant, in the app's configured zone. */
export function formatTime(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  // "24:05" is a legal ICU rendering of midnight; the app always shows 00.
  return `${hour === "24" ? "00" : hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** "YYYY-MM-DD" for an instant as seen in the given zone. */
export function toLocalDateInZone(date: Date, timeZone?: string): LocalDate {
  if (!timeZone) return toLocalDate(date);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
