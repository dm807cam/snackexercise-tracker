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
  category: "barbell" | "dumbbell" | "kettlebell" | "bodyweight" | "machine" | "odd-object" | "other";
  bodyweight?: boolean;
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
];
