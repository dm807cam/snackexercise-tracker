/**
 * Parsing a step-count CSV export.
 *
 * Anyone with history to backfill is coming from Apple Health, Google Fit,
 * Fitbit or a shortcut that wrote its own file, and no two of them agree on
 * column names, date format, or whether 12,345 has a comma in it. Rather than
 * demand one shape, this finds a date column and a steps column by name, falls
 * back to the first two columns, and skips whatever it cannot read.
 *
 * Pure and unit tested: an import that silently mangles two years of history is
 * much worse than one that refuses the file.
 */

import { isValidLocalDate, type LocalDate } from "./dates";

export interface ParsedStepDay {
  localDate: LocalDate;
  steps: number;
}

export interface StepCsvResult {
  days: ParsedStepDay[];
  /** Rows that could not be read, so the UI can say so rather than pretend. */
  skipped: number;
}

const DATE_HEADERS = ["date", "day", "startdate", "start", "datetime", "timestamp", "localdate"];
const STEP_HEADERS = ["steps", "step", "stepcount", "value", "count", "totalsteps"];

/**
 * Minimal CSV line splitter: handles quoted fields and doubled quotes inside
 * them, which is all a step export ever needs. Not a general CSV parser, and
 * deliberately not — embedded newlines do not occur in this data.
 */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === "," || char === ";" || char === "\t") {
      out.push(field.trim());
      field = "";
    } else field += char;
  }

  out.push(field.trim());
  return out;
}

/** "12,345", "12 345", "8432.0" -> 8432. Anything else -> null. */
export function parseStepValue(raw: string): number | null {
  const cleaned = raw.replace(/[\s,'’]/g, "");
  if (cleaned === "") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 200000) return null;
  return Math.round(value);
}

/**
 * Reduce a date cell to a local "YYYY-MM-DD".
 *
 * ISO timestamps are truncated rather than parsed through Date, because
 * `new Date("2026-09-07T23:30:00")` re-interprets the clock against the
 * runtime's zone and can move the reading to the previous or next day — which
 * is precisely the bug this app denormalises localDate to avoid.
 */
export function parseDateCell(raw: string): LocalDate | null {
  const value = raw.trim();
  if (value === "") return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isValidLocalDate(candidate) ? candidate : null;
  }

  // Slash forms are ambiguous between D/M/Y and M/D/Y. Where the first number
  // cannot be a month it is unambiguous; otherwise the file is refused rather
  // than guessed at, because guessing silently shifts half a year of history.
  const slash = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (slash) {
    const [, a, b, year] = slash;
    const first = Number(a);
    const second = Number(b);
    if (first > 12 && second <= 12) {
      const candidate = `${year}-${pad(second)}-${pad(first)}`;
      return isValidLocalDate(candidate) ? candidate : null;
    }
    return null;
  }

  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function headerIndex(cells: string[], names: string[]): number {
  return cells.findIndex((cell) => names.includes(cell.toLowerCase().replace(/[\s_-]/g, "")));
}

export function parseStepCsv(text: string): StepCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (lines.length === 0) return { days: [], skipped: 0 };

  const first = splitLine(lines[0]);
  let dateColumn = headerIndex(first, DATE_HEADERS);
  let stepColumn = headerIndex(first, STEP_HEADERS);

  // No recognisable header: assume date first, steps second, and read row one
  // as data rather than throwing it away.
  const hasHeader = dateColumn !== -1 && stepColumn !== -1;
  if (!hasHeader) {
    dateColumn = 0;
    stepColumn = 1;
  }

  const days = new Map<LocalDate, number>();
  let skipped = 0;

  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitLine(line);
    const date = parseDateCell(cells[dateColumn] ?? "");
    const steps = parseStepValue(cells[stepColumn] ?? "");

    if (date == null || steps == null) {
      skipped += 1;
      continue;
    }

    // Health exports often carry several rows per day, one per device or per
    // hour. Summing is the only reading that reproduces the daily total.
    days.set(date, (days.get(date) ?? 0) + steps);
  }

  return {
    days: [...days.entries()]
      .map(([localDate, steps]) => ({ localDate, steps: Math.min(steps, 200000) }))
      .sort((a, b) => a.localDate.localeCompare(b.localDate)),
    skipped,
  };
}
