/** Display formatting shared across views. */

const KG_PER_LB = 0.45359237;

export type Units = "kg" | "lb";

export function formatWeight(kg: number, units: Units = "kg"): string {
  const value = units === "lb" ? kg / KG_PER_LB : kg;
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units}`;
}

export function toKg(value: number, units: Units): number {
  return units === "lb" ? value * KG_PER_LB : value;
}

export function fromKg(kg: number, units: Units): number {
  return units === "lb" ? kg / KG_PER_LB : kg;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

export function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export interface EntryLike {
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
}

/**
 * Describe an entry's numbers, omitting whatever wasn't recorded rather than
 * padding with zeroes — "3 x 12" and "2 min" are both complete descriptions.
 */
export function formatEntryDetail(entry: EntryLike, units: Units = "kg"): string {
  const parts: string[] = [];

  if (entry.reps != null) {
    parts.push(entry.sets > 1 ? `${entry.sets} x ${entry.reps}` : `${entry.reps} reps`);
  } else if (entry.durationSec != null) {
    parts.push(entry.sets > 1 ? `${entry.sets} x ${formatDuration(entry.durationSec)}` : formatDuration(entry.durationSec));
  } else {
    parts.push(entry.sets === 1 ? "1 set" : `${entry.sets} sets`);
  }

  if (entry.weightKg != null && entry.weightKg > 0) {
    parts.push(formatWeight(entry.weightKg, units));
  }

  return parts.join(" · ");
}
