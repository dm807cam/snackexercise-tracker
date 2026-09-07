/** Display formatting shared across views. */

const KG_PER_LB = 0.45359237;
const METRES_PER_MILE = 1609.344;

export type Units = "kg" | "lb";
export type DistanceUnits = "km" | "mi";

/**
 * Distance follows the weight setting rather than asking a second question:
 * nobody wants their loads in pounds and their runs in kilometres.
 */
export function distanceUnitsFor(units: Units): DistanceUnits {
  return units === "lb" ? "mi" : "km";
}

export function formatDistance(metres: number, units: Units = "kg"): string {
  const distanceUnits = distanceUnitsFor(units);
  const value = distanceUnits === "mi" ? metres / METRES_PER_MILE : metres / 1000;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(2)} ${distanceUnits}`;
}

export function toMetres(value: number, units: Units): number {
  return distanceUnitsFor(units) === "mi" ? value * METRES_PER_MILE : value * 1000;
}

export function fromMetres(metres: number, units: Units): number {
  return distanceUnitsFor(units) === "mi" ? metres / METRES_PER_MILE : metres / 1000;
}

/**
 * Minutes per km or mile — "5:17/km". The number a runner actually recognises;
 * neither a raw duration nor a raw distance says whether it was a hard run.
 */
export function formatPace(metres: number, seconds: number, units: Units = "kg"): string | null {
  if (metres <= 0 || seconds <= 0) return null;

  const distanceUnits = distanceUnitsFor(units);
  const perUnit = seconds / (distanceUnits === "mi" ? metres / METRES_PER_MILE : metres / 1000);
  if (!Number.isFinite(perUnit) || perUnit > 3600) return null;

  const minutes = Math.floor(perUnit / 60);
  const secs = Math.round(perUnit % 60);
  // 4:60/km is not a pace; carry it.
  const carried = secs === 60 ? { m: minutes + 1, s: 0 } : { m: minutes, s: secs };
  return `${carried.m}:${String(carried.s).padStart(2, "0")}/${distanceUnits}`;
}

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
  distanceM?: number | null;
  avgHeartRate?: number | null;
}

/**
 * Describe an entry's numbers, omitting whatever wasn't recorded rather than
 * padding with zeroes — "3 x 12", "2 min" and "5.2 km · 27:30 · 5:17/km" are
 * all complete descriptions of different things.
 */
export function formatEntryDetail(entry: EntryLike, units: Units = "kg"): string {
  const parts: string[] = [];

  // A run is described by where it went, not by how many sets of it there were.
  if (entry.distanceM != null && entry.distanceM > 0) {
    parts.push(formatDistance(entry.distanceM, units));
    if (entry.durationSec != null && entry.durationSec > 0) {
      parts.push(formatDuration(entry.durationSec));
      const pace = formatPace(entry.distanceM, entry.durationSec, units);
      if (pace) parts.push(pace);
    }
    if (entry.avgHeartRate != null) parts.push(`${entry.avgHeartRate} bpm`);
    return parts.join(" · ");
  }

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

  if (entry.avgHeartRate != null) parts.push(`${entry.avgHeartRate} bpm`);

  return parts.join(" · ");
}
