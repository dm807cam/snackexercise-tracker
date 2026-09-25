/**
 * A movement's snack profile: what it takes to do it right now, and what a
 * snack-sized dose of it is. Pure functions, no database access.
 *
 * Every field is stored nullable on Exercise, and null means NOT DESCRIBED.
 * The catalogue describes all of its movements; a movement somebody added by
 * hand usually describes none. For those the profile is inferred from the
 * category, conservatively — and where the category says nothing about the
 * kit ("other", "cardio", "odd-object"), the movement is simply never proposed
 * until someone says what it needs. Proposing "Dennis's odd shoulder thing" in
 * an airport because nothing ruled it out would be the planner guessing in the
 * direction that embarrasses the user.
 */

import { type Requirement, parseRequirements, requirementsMet } from "./equipment";

export type Impact = 0 | 1 | 2;
export type Sweat = 0 | 1 | 2;

export type Dose =
  | { kind: "reps"; low: number; high: number }
  | { kind: "time"; seconds: number };

export interface SnackProfile {
  /** What it needs; null when that is unknown. */
  requirements: Requirement[] | null;
  /** Optional kit that adds load. Empty when there is none. */
  load: Requirement[];
  impact: Impact;
  floor: boolean;
  sweat: Sweat;
  dose: Dose;
  unilateral: boolean;
  cues: string[];
  /**
   * Whether the planner may propose it at all: its kit is known, and one bout
   * of it fits in a snack. A hike is a fine thing to log and not a snack.
   */
  snackable: boolean;
  /** False when any of the above was inferred rather than stored. */
  described: boolean;
}

/** The Exercise columns a profile is read from. */
export interface ProfileSource {
  category: string;
  cardioBias: number;
  mets: number | null;
  equipment?: string | null;
  load?: string | null;
  impact?: number | null;
  floor?: boolean | null;
  sweat?: number | null;
  snackReps?: string | null;
  snackSeconds?: number | null;
  unilateral?: boolean | null;
  cues?: string | null;
}

/**
 * The longest single bout that is still a snack.
 *
 * Fifteen minutes. The format this app descends from is minutes, not an hour,
 * and a movement whose natural bout is longer — a hike, a bike ride, a swim —
 * is an outing. It is still logged and still counted; it is just never what the
 * planner offers someone who said they had three minutes.
 */
export const MAX_SNACK_BOUT_SEC = 15 * 60;

/** What an undescribed movement's category implies it needs, or null for "no idea". */
function inferRequirements(category: string): Requirement[] | null {
  switch (category) {
    case "bodyweight":
      return [];
    case "barbell":
      return [["barbell"]];
    case "dumbbell":
      return [["dumbbells"]];
    case "kettlebell":
      return [["kettlebell"]];
    case "machine":
      return [["machines"]];
    default:
      // "cardio", "odd-object", "other": the category names a kind of effort,
      // not a kind of kit, so there is nothing honest to infer.
      return null;
  }
}

function clampLevel(value: number | null | undefined): Impact | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(2, Math.max(0, Math.round(value))) as Impact;
}

/** "8-12" to a rep range, or null if it is not one. */
export function parseRepRange(value: string | null | undefined): { low: number; high: number } | null {
  if (!value) return null;
  const match = /^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/.exec(value);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (low < 1 || high < low) return null;
  return { low, high };
}

export function snackProfile(source: ProfileSource): SnackProfile {
  const bias = Math.min(1, Math.max(0, source.cardioBias ?? 0));
  const mets = source.mets ?? null;

  const storedRequirements = parseRequirements(source.equipment);
  const requirements = storedRequirements ?? inferRequirements(source.category);

  const impact =
    clampLevel(source.impact) ??
    // A vigorous aerobic movement most likely involves leaving the floor; one
    // that is part aerobic is at least audible; resistance work is not.
    (bias >= 0.5 && (mets ?? 0) >= 8 ? 2 : bias > 0 ? 1 : 0);

  // Vigorous work needs a shower; anything else leaves you warm. Nothing is
  // inferred to be fine in work clothes — that is a claim worth stating.
  const sweat = clampLevel(source.sweat) ?? ((mets ?? 0) >= 8 ? 2 : 1);

  // Conservative in the direction that matters: an undescribed bodyweight
  // movement may well need the floor, and assuming otherwise would propose it
  // on a station platform.
  const floor = source.floor ?? source.category === "bodyweight";

  const reps = parseRepRange(source.snackReps);
  const seconds =
    source.snackSeconds != null && Number.isFinite(source.snackSeconds) && source.snackSeconds > 0
      ? Math.round(source.snackSeconds)
      : null;
  const dose: Dose = reps
    ? { kind: "reps", ...reps }
    : seconds
      ? { kind: "time", seconds }
      : bias >= 0.5
        ? { kind: "time", seconds: 60 }
        : { kind: "reps", low: 8, high: 12 };

  const described =
    storedRequirements !== null &&
    source.impact != null &&
    source.floor != null &&
    source.sweat != null &&
    (reps !== null || seconds !== null);

  return {
    requirements,
    load: parseRequirements(source.load) ?? [],
    impact,
    floor,
    sweat,
    dose,
    unilateral: source.unilateral ?? false,
    cues: (source.cues ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    snackable:
      requirements !== null && (dose.kind === "reps" || dose.seconds <= MAX_SNACK_BOUT_SEC),
    described,
  };
}

/** What a place allows. See lib/snack/contexts.ts. */
export interface ContextCaps {
  equipment: ReadonlySet<string>;
  /** Nothing that thumps: impact above 1 is out. */
  quiet: boolean;
  /** Getting down on the floor is fine. */
  floor: boolean;
  /** The most sweat the place tolerates. */
  sweat: Sweat;
}

export type Unfit = "unknown-kit" | "not-a-snack" | "equipment" | "noise" | "floor" | "sweat";

/**
 * Whether a movement can be done here, and if not, the first reason why — in
 * the order a person would give them: you don't have the kit, it's too loud,
 * there's nowhere to lie down, you'd arrive at your meeting soaked.
 */
export function unfitReason(profile: SnackProfile, caps: ContextCaps): Unfit | null {
  if (profile.requirements === null) return "unknown-kit";
  if (!profile.snackable) return "not-a-snack";
  if (!requirementsMet(profile.requirements, caps.equipment)) return "equipment";
  if (caps.quiet && profile.impact > 1) return "noise";
  if (profile.floor && !caps.floor) return "floor";
  if (profile.sweat > caps.sweat) return "sweat";
  return null;
}

export function fitsContext(profile: SnackProfile, caps: ContextCaps): boolean {
  return unfitReason(profile, caps) === null;
}

/** Whether the optional load kit is here, so a weight can be prescribed. */
export function loadAvailable(profile: SnackProfile, caps: ContextCaps): boolean {
  return profile.load.length > 0 && requirementsMet(profile.load, caps.equipment);
}
