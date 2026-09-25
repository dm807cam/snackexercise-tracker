/**
 * The shape of a snack plan, shared by the planner, the API, the database
 * (Snack.plan is this, as JSON) and the guided player. Types only.
 *
 * VERSIONED, because plans are stored: a player opened on a plan written by an
 * older build must still be able to read it, or be told plainly that it cannot.
 */

import type { AxisSlug } from "../muscles";

export const PLAN_VERSION = 1;

export type SnackFocus = "strength" | "cardio" | "mixed";

export type SnackFormat =
  /** One movement, a few sets. */
  | "single"
  /** Two or more movements alternated, round after round. */
  | "circuit"
  /** Work and easy periods alternating: every minute, on the minute. */
  | "intervals"
  /** One steady bout: a brisk walk, a few minutes on a bike. */
  | "continuous";

export interface SnackBlock {
  exerciseId: string;
  name: string;
  slug: string;
  role: "strength" | "cardio";
  /** The muscle group this block was chosen for; null for cardio. */
  axis: AxisSlug | null;
  kind: "reps" | "time";
  /** Sets of this block in each round. */
  sets: number;
  /** Target reps per set — per side when `unilateral`. */
  reps: number | null;
  repRange: [number, number] | null;
  /** Seconds per set — per side when `unilateral`. For intervals, the work period. */
  seconds: number | null;
  /** For intervals: the easy period after each work period. */
  easySeconds: number | null;
  weightKg: number | null;
  unilateral: boolean;
  /** Rest after each set of this block, before the next thing. */
  restSec: number;
  cues: string[];
  /** Muscle groups (and "Cardio") this block trains, most first. */
  serves: string[];
  /** Why this one, in a line. */
  why: string;
  /** How the dose was arrived at, in a line, or null. */
  doseNote: string | null;
  /** What it will use here, e.g. ["chair"]. */
  equipment: string[];
  /** The movement this replaced because it has stopped progressing. */
  progressedFrom: string | null;
  cardioBias: number;
  mets: number | null;
}

export interface SnackPlan {
  version: typeof PLAN_VERSION;
  minutes: number;
  focus: SnackFocus;
  format: SnackFormat;
  /** Times through the blocks. */
  rounds: number;
  /** Rest between rounds. */
  roundRestSec: number;
  blocks: SnackBlock[];
  /** Blocks after the circuit, done once — a cardio finisher. */
  finisher: SnackBlock | null;
  estimatedSec: number;
  headline: string;
  reason: string;
  /** What completing it adds to today's rings, in their own units. */
  expected: { hardSets: number; metMinutes: number };
  contextName: string | null;
  /** Set when nothing could be planned, saying why. */
  empty: string | null;
  /** Movements swapped out of this snack, never to be offered in it again. */
  swappedOut?: string[];
}

/** One block as the user actually did it, sent back when a snack is finished. */
export interface BlockResult {
  exerciseId: string;
  outcome: "done" | "skipped";
  sets: number;
  reps: number | null;
  seconds: number | null;
  weightKg: number | null;
  effort: "easy" | "hard" | "failure" | null;
}
