/**
 * How much of a movement to do in this snack. Pure.
 *
 * The catalogue says what a snack-sized set of push-ups usually is (6-15). The
 * user's own history says what a set of push-ups is FOR THEM, and that is the
 * number worth proposing: fifteen is a joke to one person and out of reach for
 * another, and a target nobody can hit, or nobody needs to try for, is ignored.
 *
 * DOUBLE PROGRESSION, driven by the effort the user reported last time — the
 * one signal lib/effort.ts already collects:
 *
 *   easy     two more reps (or ten more seconds): there was plenty left
 *   hard     one more: that is what progressive overload is
 *   failure  one fewer: the stimulus is nearly all there two reps short of
 *            failure, and a snack you can repeat three times a day beats one
 *            that leaves you unable to
 *   unrated  the same again
 *
 * Nothing progresses on a movement trained earlier TODAY: that is repetition,
 * not a new session, and "one more than an hour ago" compounds into nonsense
 * over five snacks.
 *
 * When reps outgrow the top of the range on a LOADED movement, the load goes up
 * and the reps restart at the bottom — the double-progression step. When the
 * movement can be loaded but there is no weight here (a hotel room), it is
 * prescribed as bodyweight and says so, rather than asking for a dumbbell that
 * does not exist.
 */

import type { Dose } from "./profile";

export interface LastPerformance {
  localDate: string;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  effort: string | null;
}

export interface Prescription {
  kind: "reps" | "time";
  /** Target reps per set (per side when unilateral). */
  reps: number | null;
  repRange: [number, number] | null;
  /** Seconds per set (per side when unilateral). */
  seconds: number | null;
  weightKg: number | null;
  /** One line explaining the number, or null when there is nothing to say. */
  note: string | null;
}

/** The smallest sensible jump in load at a given weight. */
export function loadStep(kg: number): number {
  if (kg < 10) return 1;
  if (kg < 40) return 2;
  return 2.5;
}

function roundLoad(kg: number): number {
  return Math.round(kg * 2) / 2;
}

function describe(last: LastPerformance, kind: "reps" | "time"): string {
  const effort = last.effort ? ` (${last.effort})` : "";
  if (kind === "time") return `last time ${last.durationSec}s${effort}`;
  const load = last.weightKg ? ` × ${last.weightKg} kg` : "";
  return `last time ${last.reps}${load}${effort}`;
}

export function prescribe(input: {
  dose: Dose;
  last: LastPerformance | undefined;
  /** Whether weights for this movement are here — its own kit, or its optional load. */
  loadHere: boolean;
  today: string;
}): Prescription {
  const { dose, last, loadHere, today } = input;
  const sameDay = last?.localDate === today;

  if (dose.kind === "time") {
    const base = dose.seconds;
    if (!last?.durationSec) {
      return { kind: "time", reps: null, repRange: null, seconds: base, weightKg: null, note: null };
    }
    const d = last.durationSec;
    let seconds = d;
    if (!sameDay) {
      if (last.effort === "easy") seconds = d + Math.max(10, Math.round(d * 0.1));
      else if (last.effort === "hard") seconds = d + 5;
      else if (last.effort === "failure") seconds = d - 5;
    }
    // To the nearest five seconds, rounded the way the change was going, so a
    // step up is never rounded back to where it started.
    if (seconds > d) seconds = Math.ceil(seconds / 5) * 5;
    else if (seconds < d) seconds = Math.floor(seconds / 5) * 5;
    seconds = Math.min(600, Math.max(10, seconds));
    return {
      kind: "time",
      reps: null,
      repRange: null,
      seconds,
      weightKg: null,
      note: seconds === d ? `${describe(last, "time")} — same again` : `${describe(last, "time")} → ${seconds}s`,
    };
  }

  const range: [number, number] = [dose.low, dose.high];
  const opening = Math.round(dose.low + (dose.high - dose.low) * 0.3);

  if (!last?.reps) {
    return {
      kind: "reps",
      reps: opening,
      repRange: range,
      seconds: null,
      weightKg: null,
      note: "a first go: stop with two reps still in you",
    };
  }

  const lastLoad = last.weightKg && last.weightKg > 0 ? last.weightKg : null;

  // Loaded last time, but no weight here: bodyweight, and say so.
  if (lastLoad && !loadHere) {
    return {
      kind: "reps",
      reps: Math.min(dose.high, Math.max(dose.low, last.reps)),
      repRange: range,
      seconds: null,
      weightKg: null,
      note: "no weights here, so bodyweight — slow the lowering to make it count",
    };
  }

  let reps = last.reps;
  if (!sameDay) {
    if (last.effort === "easy") reps += 2;
    else if (last.effort === "hard") reps += 1;
    else if (last.effort === "failure") reps -= 1;
  }
  reps = Math.min(100, Math.max(1, reps));

  let weightKg = lastLoad;
  if (lastLoad && reps > dose.high && last.effort !== "failure") {
    // The double-progression step: heavier, and back to the bottom of the range.
    weightKg = roundLoad(lastLoad + loadStep(lastLoad));
    reps = dose.low;
  }

  const note =
    weightKg !== lastLoad
      ? `${describe(last, "reps")} → ${reps} × ${weightKg} kg`
      : reps === last.reps
        ? `${describe(last, "reps")} — same again`
        : `${describe(last, "reps")} → ${reps}`;
  return { kind: "reps", reps, repRange: range, seconds: null, weightKg, note };
}
