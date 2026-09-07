/**
 * Starter exercise catalogue.
 *
 * Weighted toward things you can actually grab in a basement gym — barbell,
 * dumbbell, kettlebell, bodyweight and odd objects — rather than a machine
 * list. Muscle weights are 1.0 primary mover, 0.5 secondary, 0.25 stabiliser.
 *
 * This is a starting point, not a fixed list: anything you log that isn't here
 * gets added as a custom exercise, and the weightings are editable in Settings.
 */

import type { MuscleSlug } from "../lib/muscles";

export interface CatalogueEntry {
  name: string;
  category:
    | "barbell"
    | "dumbbell"
    | "kettlebell"
    | "bodyweight"
    | "machine"
    | "odd-object"
    | "cardio"
    | "other";
  bodyweight?: boolean;
  /**
   * How aerobic the movement is, 0..1. Omitted means 0 — pure resistance work,
   * which is what everything below the cardio section is.
   */
  cardioBias?: number;
  /** Default METs when neither heart rate nor pace is known. */
  mets?: number;
  muscles: Partial<Record<MuscleSlug, number>>;
}

export const EXERCISE_CATALOGUE: CatalogueEntry[] = [
  // ---- Push: horizontal ----
  { name: "Bench press", category: "barbell", muscles: { chest: 1, "front-delts": 0.5, triceps: 0.5 } },
  { name: "Dumbbell bench press", category: "dumbbell", muscles: { chest: 1, "front-delts": 0.5, triceps: 0.5 } },
  { name: "Incline dumbbell press", category: "dumbbell", muscles: { chest: 1, "front-delts": 0.5, triceps: 0.5 } },
  { name: "Push-up", category: "bodyweight", bodyweight: true, muscles: { chest: 1, triceps: 0.5, "front-delts": 0.5, abs: 0.25 } },
  { name: "Diamond push-up", category: "bodyweight", bodyweight: true, muscles: { triceps: 1, chest: 0.5, "front-delts": 0.25 } },
  { name: "Dip", category: "bodyweight", bodyweight: true, muscles: { chest: 1, triceps: 1, "front-delts": 0.5 } },
  { name: "Dumbbell fly", category: "dumbbell", muscles: { chest: 1, "front-delts": 0.25 } },

  // ---- Push: vertical ----
  { name: "Overhead press", category: "barbell", muscles: { "front-delts": 1, "side-delts": 0.5, triceps: 0.5, abs: 0.25 } },
  { name: "Dumbbell shoulder press", category: "dumbbell", muscles: { "front-delts": 1, "side-delts": 0.5, triceps: 0.5 } },
  { name: "Kettlebell press", category: "kettlebell", muscles: { "front-delts": 1, "side-delts": 0.5, triceps: 0.5, abs: 0.25 } },
  { name: "Push press", category: "barbell", muscles: { "front-delts": 1, triceps: 0.5, quads: 0.25, "side-delts": 0.5 } },
  { name: "Pike push-up", category: "bodyweight", bodyweight: true, muscles: { "front-delts": 1, triceps: 0.5, "side-delts": 0.25 } },
  { name: "Handstand hold", category: "bodyweight", bodyweight: true, muscles: { "front-delts": 1, triceps: 0.5, abs: 0.5, traps: 0.25 } },

  // ---- Pull: vertical ----
  { name: "Pull-up", category: "bodyweight", bodyweight: true, muscles: { lats: 1, biceps: 0.5, "mid-back": 0.5, forearms: 0.25 } },
  { name: "Chin-up", category: "bodyweight", bodyweight: true, muscles: { lats: 1, biceps: 1, "mid-back": 0.5, forearms: 0.25 } },
  { name: "Lat pulldown", category: "machine", muscles: { lats: 1, biceps: 0.5, "mid-back": 0.5 } },
  { name: "Dead hang", category: "bodyweight", bodyweight: true, muscles: { forearms: 1, lats: 0.5, traps: 0.25 } },

  // ---- Pull: horizontal ----
  { name: "Barbell row", category: "barbell", muscles: { "mid-back": 1, lats: 1, biceps: 0.5, "lower-back": 0.5, "rear-delts": 0.5 } },
  { name: "Dumbbell row", category: "dumbbell", muscles: { lats: 1, "mid-back": 1, biceps: 0.5, "rear-delts": 0.25 } },
  { name: "Kettlebell row", category: "kettlebell", muscles: { lats: 1, "mid-back": 1, biceps: 0.5, "rear-delts": 0.25 } },
  { name: "Inverted row", category: "bodyweight", bodyweight: true, muscles: { "mid-back": 1, lats: 0.5, biceps: 0.5, "rear-delts": 0.5 } },
  { name: "Face pull", category: "machine", muscles: { "rear-delts": 1, "mid-back": 0.5, traps: 0.5 } },
  { name: "Reverse fly", category: "dumbbell", muscles: { "rear-delts": 1, "mid-back": 0.5, traps: 0.25 } },

  // ---- Shoulders / arms ----
  { name: "Lateral raise", category: "dumbbell", muscles: { "side-delts": 1, traps: 0.25 } },
  { name: "Front raise", category: "dumbbell", muscles: { "front-delts": 1 } },
  { name: "Shrug", category: "dumbbell", muscles: { traps: 1, forearms: 0.25 } },
  { name: "Upright row", category: "barbell", muscles: { "side-delts": 1, traps: 1, biceps: 0.25 } },
  { name: "Barbell curl", category: "barbell", muscles: { biceps: 1, forearms: 0.5 } },
  { name: "Dumbbell curl", category: "dumbbell", muscles: { biceps: 1, forearms: 0.5 } },
  { name: "Hammer curl", category: "dumbbell", muscles: { biceps: 1, forearms: 1 } },
  { name: "Triceps extension", category: "dumbbell", muscles: { triceps: 1 } },
  { name: "Skull crusher", category: "barbell", muscles: { triceps: 1 } },
  { name: "Triceps pushdown", category: "machine", muscles: { triceps: 1 } },
  { name: "Wrist curl", category: "dumbbell", muscles: { forearms: 1 } },
  { name: "Neck curl", category: "other", muscles: { neck: 1 } },

  // ---- Squat pattern ----
  { name: "Back squat", category: "barbell", muscles: { quads: 1, glutes: 1, "lower-back": 0.5, adductors: 0.5, hamstrings: 0.25 } },
  { name: "Front squat", category: "barbell", muscles: { quads: 1, glutes: 0.5, abs: 0.5, "lower-back": 0.5 } },
  { name: "Goblet squat", category: "kettlebell", muscles: { quads: 1, glutes: 0.5, abs: 0.5, adductors: 0.25 } },
  { name: "Bodyweight squat", category: "bodyweight", bodyweight: true, muscles: { quads: 1, glutes: 0.5, adductors: 0.25 } },
  { name: "Split squat", category: "dumbbell", muscles: { quads: 1, glutes: 1, adductors: 0.25 } },
  { name: "Bulgarian split squat", category: "dumbbell", muscles: { quads: 1, glutes: 1, adductors: 0.5, hamstrings: 0.25 } },
  { name: "Lunge", category: "dumbbell", muscles: { quads: 1, glutes: 1, hamstrings: 0.25, adductors: 0.25 } },
  { name: "Step-up", category: "dumbbell", muscles: { quads: 1, glutes: 1, calves: 0.25 } },
  { name: "Pistol squat", category: "bodyweight", bodyweight: true, muscles: { quads: 1, glutes: 0.5, abs: 0.5, calves: 0.25 } },

  // ---- Hinge pattern ----
  { name: "Deadlift", category: "barbell", muscles: { hamstrings: 1, glutes: 1, "lower-back": 1, traps: 0.5, forearms: 0.5, lats: 0.25 } },
  { name: "Romanian deadlift", category: "barbell", muscles: { hamstrings: 1, glutes: 1, "lower-back": 0.5, forearms: 0.25 } },
  { name: "Kettlebell swing", category: "kettlebell", muscles: { glutes: 1, hamstrings: 1, "lower-back": 0.5, abs: 0.25, forearms: 0.25 } },
  { name: "Kettlebell snatch", category: "kettlebell", muscles: { glutes: 1, hamstrings: 0.5, "front-delts": 0.5, traps: 0.5, forearms: 0.5 } },
  { name: "Single-leg deadlift", category: "dumbbell", muscles: { hamstrings: 1, glutes: 1, "lower-back": 0.5 } },
  { name: "Good morning", category: "barbell", muscles: { hamstrings: 1, "lower-back": 1, glutes: 0.5 } },
  { name: "Hip thrust", category: "barbell", muscles: { glutes: 1, hamstrings: 0.5 } },
  { name: "Glute bridge", category: "bodyweight", bodyweight: true, muscles: { glutes: 1, hamstrings: 0.5 } },
  { name: "Back extension", category: "bodyweight", bodyweight: true, muscles: { "lower-back": 1, glutes: 0.5, hamstrings: 0.5 } },

  // ---- Carries / odd objects ----
  { name: "Farmer's carry", category: "odd-object", muscles: { forearms: 1, traps: 1, abs: 0.5, obliques: 0.5, quads: 0.25 } },
  { name: "Suitcase carry", category: "odd-object", muscles: { obliques: 1, forearms: 1, traps: 0.5, abs: 0.5 } },
  { name: "Sandbag carry", category: "odd-object", muscles: { abs: 1, "lower-back": 0.5, traps: 0.5, forearms: 0.5, quads: 0.5 } },
  { name: "Sandbag clean", category: "odd-object", muscles: { glutes: 1, "lower-back": 1, traps: 0.5, biceps: 0.25, quads: 0.5 } },
  { name: "Sled push", category: "odd-object", muscles: { quads: 1, glutes: 1, calves: 0.5, abs: 0.25 } },

  // ---- Core ----
  { name: "Plank", category: "bodyweight", bodyweight: true, muscles: { abs: 1, obliques: 0.5, "front-delts": 0.25 } },
  { name: "Side plank", category: "bodyweight", bodyweight: true, muscles: { obliques: 1, abs: 0.5 } },
  { name: "Hanging leg raise", category: "bodyweight", bodyweight: true, muscles: { abs: 1, forearms: 0.5, obliques: 0.25 } },
  { name: "Sit-up", category: "bodyweight", bodyweight: true, muscles: { abs: 1, obliques: 0.25 } },
  { name: "Russian twist", category: "bodyweight", bodyweight: true, muscles: { obliques: 1, abs: 0.5 } },
  { name: "Ab wheel rollout", category: "other", muscles: { abs: 1, obliques: 0.5, lats: 0.25 } },
  { name: "Hollow hold", category: "bodyweight", bodyweight: true, muscles: { abs: 1, obliques: 0.25 } },

  // ---- Calves ----
  { name: "Calf raise", category: "bodyweight", bodyweight: true, muscles: { calves: 1 } },
  { name: "Standing calf raise", category: "dumbbell", muscles: { calves: 1 } },

  // ---- Cardio ----
  //
  // Muscle mappings here are deliberately thin, and none of them is a primary
  // mover. They exist so a run still lights something on the body map, not so
  // it can claim leg volume: effective sets are scaled by (1 - cardioBias), so
  // at bias 1.0 these weightings contribute exactly nothing to the radar or
  // the "needs attention" list. They start to matter at bias 0.3-0.5, which is
  // where they should — a burpee really does train the chest a little.
  //
  // METs are Compendium of Physical Activities values, used only as a fallback
  // when the entry records neither a pace nor a heart rate.
  { name: "Run", category: "cardio", bodyweight: true, cardioBias: 1, mets: 9.8, muscles: { quads: 0.25, hamstrings: 0.25, calves: 0.25 } },
  { name: "Treadmill run", category: "cardio", bodyweight: true, cardioBias: 1, mets: 9.8, muscles: { quads: 0.25, hamstrings: 0.25, calves: 0.25 } },
  { name: "Walk", category: "cardio", bodyweight: true, cardioBias: 1, mets: 3.5, muscles: { calves: 0.25, quads: 0.25 } },
  { name: "Hike", category: "cardio", bodyweight: true, cardioBias: 1, mets: 6, muscles: { calves: 0.25, quads: 0.25, glutes: 0.25 } },
  { name: "Cycle", category: "cardio", bodyweight: true, cardioBias: 1, mets: 7.5, muscles: { quads: 0.25, calves: 0.25 } },
  { name: "Stationary bike", category: "cardio", cardioBias: 1, mets: 6.8, muscles: { quads: 0.25, calves: 0.25 } },
  { name: "Assault bike", category: "cardio", cardioBias: 0.9, mets: 10, muscles: { quads: 0.25, "front-delts": 0.25, lats: 0.25 } },
  { name: "Row (erg)", category: "cardio", cardioBias: 0.8, mets: 7, muscles: { lats: 0.5, "mid-back": 0.5, quads: 0.5, biceps: 0.25 } },
  { name: "Swim", category: "cardio", bodyweight: true, cardioBias: 1, mets: 7, muscles: { lats: 0.25, "front-delts": 0.25, triceps: 0.25 } },
  { name: "Jump rope", category: "cardio", bodyweight: true, cardioBias: 1, mets: 11, muscles: { calves: 0.5, forearms: 0.25 } },
  { name: "Stair climb", category: "cardio", bodyweight: true, cardioBias: 1, mets: 9, muscles: { quads: 0.25, glutes: 0.25, calves: 0.25 } },
  { name: "Elliptical", category: "cardio", cardioBias: 1, mets: 5, muscles: { quads: 0.25, glutes: 0.25 } },
  { name: "Burpee", category: "bodyweight", bodyweight: true, cardioBias: 0.5, mets: 8, muscles: { chest: 0.5, quads: 0.5, "front-delts": 0.5, abs: 0.5, triceps: 0.25 } },
  { name: "Mountain climber", category: "bodyweight", bodyweight: true, cardioBias: 0.6, mets: 8, muscles: { abs: 1, "front-delts": 0.25, quads: 0.25 } },
  { name: "Battle rope", category: "cardio", cardioBias: 0.6, mets: 8, muscles: { "front-delts": 0.5, forearms: 0.5, abs: 0.25 } },
  { name: "Shadow boxing", category: "cardio", bodyweight: true, cardioBias: 0.8, mets: 7.8, muscles: { "front-delts": 0.5, obliques: 0.25, calves: 0.25 } },
];

/**
 * Movements already in the catalogue that are partly aerobic. Kept separate
 * from the list above because these rows exist in every database that has ever
 * run this app, so they need updating rather than creating — the seed skips
 * anything whose slug it already finds.
 */
export const CARDIO_BIAS_BACKFILL: { name: string; cardioBias: number; mets: number }[] = [
  { name: "Kettlebell swing", cardioBias: 0.4, mets: 9.8 },
  { name: "Kettlebell snatch", cardioBias: 0.4, mets: 9.8 },
  { name: "Sled push", cardioBias: 0.3, mets: 8 },
  { name: "Sandbag carry", cardioBias: 0.3, mets: 8 },
  { name: "Farmer's carry", cardioBias: 0.25, mets: 6.5 },
  { name: "Suitcase carry", cardioBias: 0.25, mets: 6.5 },
];
