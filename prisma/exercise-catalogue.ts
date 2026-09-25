/**
 * Starter exercise catalogue.
 *
 * Weighted toward things you can actually do between other things — in a
 * basement with a kettlebell, in a hotel room with a chair and a towel, on a
 * station platform with a flight of stairs — rather than a machine list. Muscle
 * weights are 1.0 primary mover, 0.5 secondary, 0.25 stabiliser.
 *
 * This is a starting point, not a fixed list: anything you log that isn't here
 * gets added as a custom exercise, and the weightings are editable in Settings.
 *
 * Every movement also carries a SNACK PROFILE: what it takes to do it right now.
 * That is what lets the planner answer "what can I do in a hotel room, quietly,
 * in three minutes" rather than proposing barbell rows to someone in an airport.
 * See lib/snack/profile.ts for how each field is read, and lib/snack/equipment.ts
 * for the equipment slugs.
 */

import type { MuscleSlug } from "../lib/muscles";

export interface SnackProfileSeed {
  /**
   * What it needs. Space-separated requirements, each a "|"-separated set of
   * alternatives: "chair|bench" needs either, "door towel" needs both. Empty
   * string means nothing at all.
   */
  equipment: string;
  /** Kit that adds load when it is to hand, without being required. */
  load?: string;
  /** 0 silent, 1 audible, 2 jumping. */
  impact: 0 | 1 | 2;
  /** Needs you to get down on the floor. */
  floor: boolean;
  /** 0 fine in work clothes, 1 warm, 2 needs a shower — at a snack's dose. */
  sweat: 0 | 1 | 2;
  /** A snack-sized set as a rep range... */
  reps?: `${number}-${number}`;
  /** ...or as a hold or bout in seconds. */
  seconds?: number;
  unilateral?: boolean;
  cues?: string[];
}

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
  snack: SnackProfileSeed;
}

export const EXERCISE_CATALOGUE: CatalogueEntry[] = [
  // ---- Push: horizontal ----
  {
    name: "Bench press", category: "barbell",
    muscles: { chest: 1, "front-delts": 0.5, triceps: 0.5 },
    snack: { equipment: "barbell bench", impact: 0, floor: false, sweat: 1, reps: "5-8",
      cues: ["Shoulder blades pinned back and down", "Bar to the lower chest, feet planted", "Safeties set, or a spotter"] },
  },
  {
    name: "Dumbbell bench press", category: "dumbbell",
    muscles: { chest: 1, "front-delts": 0.5, triceps: 0.5 },
    snack: { equipment: "dumbbells bench", impact: 0, floor: false, sweat: 1, reps: "8-12",
      cues: ["Elbows about 45° from your sides", "Lower under control to chest level"] },
  },
  {
    name: "Incline dumbbell press", category: "dumbbell",
    muscles: { chest: 1, "front-delts": 0.5, triceps: 0.5 },
    snack: { equipment: "dumbbells bench", impact: 0, floor: false, sweat: 1, reps: "8-12" },
  },
  {
    name: "Push-up", category: "bodyweight", bodyweight: true,
    muscles: { chest: 1, triceps: 0.5, "front-delts": 0.5, abs: 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 1, reps: "6-15",
      cues: ["Hands under shoulders, body in one straight line", "Chest to a fist above the floor, then press away", "Stop a rep or two before the form goes"] },
  },
  {
    name: "Diamond push-up", category: "bodyweight", bodyweight: true,
    muscles: { triceps: 1, chest: 0.5, "front-delts": 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 1, reps: "5-12",
      cues: ["Thumbs and index fingers touching under your chest", "Elbows travel back along your ribs"] },
  },
  {
    name: "Dip", category: "bodyweight", bodyweight: true,
    muscles: { chest: 1, triceps: 1, "front-delts": 0.5 },
    snack: { equipment: "dip-bars", impact: 0, floor: false, sweat: 1, reps: "5-12",
      cues: ["Slight forward lean, shoulders pulled down", "Upper arms to parallel, no deeper"] },
  },
  {
    name: "Dumbbell fly", category: "dumbbell",
    muscles: { chest: 1, "front-delts": 0.25 },
    snack: { equipment: "dumbbells bench", impact: 0, floor: false, sweat: 0, reps: "10-15" },
  },
  {
    name: "Incline push-up", category: "bodyweight", bodyweight: true,
    muscles: { chest: 1, triceps: 0.5, "front-delts": 0.5, abs: 0.25 },
    snack: { equipment: "table|chair|bench", impact: 0, floor: false, sweat: 0, reps: "8-15",
      cues: ["Hands on the edge of a desk, or a chair braced against a wall", "Body straight from head to heel", "The lower the hands, the harder it gets"] },
  },
  {
    name: "Wall push-up", category: "bodyweight", bodyweight: true,
    muscles: { chest: 1, triceps: 0.5, "front-delts": 0.5 },
    snack: { equipment: "wall", impact: 0, floor: false, sweat: 0, reps: "12-20",
      cues: ["Feet a long step back from the wall", "Slow down, quick up"] },
  },

  // ---- Push: vertical ----
  {
    name: "Overhead press", category: "barbell",
    muscles: { "front-delts": 1, "side-delts": 0.5, triceps: 0.5, abs: 0.25 },
    snack: { equipment: "barbell", impact: 0, floor: false, sweat: 1, reps: "5-8",
      cues: ["Glutes squeezed, ribs down", "Press straight up; head through at the top"] },
  },
  {
    name: "Dumbbell shoulder press", category: "dumbbell",
    muscles: { "front-delts": 1, "side-delts": 0.5, triceps: 0.5 },
    snack: { equipment: "dumbbells", impact: 0, floor: false, sweat: 1, reps: "8-12" },
  },
  {
    name: "Kettlebell press", category: "kettlebell",
    muscles: { "front-delts": 1, "side-delts": 0.5, triceps: 0.5, abs: 0.25 },
    snack: { equipment: "kettlebell", impact: 0, floor: false, sweat: 1, reps: "5-10", unilateral: true,
      cues: ["Bell in the rack, forearm vertical", "Press and finish with the biceps by your ear"] },
  },
  {
    name: "Push press", category: "barbell",
    muscles: { "front-delts": 1, triceps: 0.5, quads: 0.25, "side-delts": 0.5 },
    snack: { equipment: "barbell", impact: 1, floor: false, sweat: 2, reps: "5-8" },
  },
  {
    name: "Pike push-up", category: "bodyweight", bodyweight: true,
    muscles: { "front-delts": 1, triceps: 0.5, "side-delts": 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 1, reps: "5-12",
      cues: ["Hips high; lower your head to a spot just ahead of your hands", "Elbows at about 45°"] },
  },
  {
    name: "Handstand hold", category: "bodyweight", bodyweight: true,
    muscles: { "front-delts": 1, triceps: 0.5, abs: 0.5, traps: 0.25 },
    snack: { equipment: "wall", impact: 1, floor: true, sweat: 1, seconds: 20,
      cues: ["Chest to the wall: walk the feet up rather than kicking", "Push the floor away; stack wrists, shoulders, hips"] },
  },

  // ---- Pull: vertical ----
  {
    name: "Pull-up", category: "bodyweight", bodyweight: true,
    muscles: { lats: 1, biceps: 0.5, "mid-back": 0.5, forearms: 0.25 },
    snack: { equipment: "pullup-bar", impact: 0, floor: false, sweat: 1, reps: "3-10",
      cues: ["Start from a dead hang, shoulders drawn down", "Chin over the bar without craning", "All the way down, under control"] },
  },
  {
    name: "Chin-up", category: "bodyweight", bodyweight: true,
    muscles: { lats: 1, biceps: 1, "mid-back": 0.5, forearms: 0.25 },
    snack: { equipment: "pullup-bar", impact: 0, floor: false, sweat: 1, reps: "3-10",
      cues: ["Palms facing you, shoulder-width", "Lead with the chest"] },
  },
  {
    name: "Lat pulldown", category: "machine",
    muscles: { lats: 1, biceps: 0.5, "mid-back": 0.5 },
    snack: { equipment: "machines", impact: 0, floor: false, sweat: 1, reps: "8-12" },
  },
  {
    name: "Dead hang", category: "bodyweight", bodyweight: true,
    muscles: { forearms: 1, lats: 0.5, traps: 0.25 },
    snack: { equipment: "pullup-bar", impact: 0, floor: false, sweat: 0, seconds: 30,
      cues: ["Grip hard and let the shoulders open", "Breathe slowly"] },
  },

  // ---- Pull: horizontal ----
  {
    name: "Barbell row", category: "barbell",
    muscles: { "mid-back": 1, lats: 1, biceps: 0.5, "lower-back": 0.5, "rear-delts": 0.5 },
    snack: { equipment: "barbell", impact: 0, floor: false, sweat: 1, reps: "6-10" },
  },
  {
    name: "Dumbbell row", category: "dumbbell",
    muscles: { lats: 1, "mid-back": 1, biceps: 0.5, "rear-delts": 0.25 },
    snack: { equipment: "dumbbells", impact: 0, floor: false, sweat: 1, reps: "8-12", unilateral: true,
      cues: ["Brace a hand on a bench, chair or your thigh", "Elbow to the hip; pause at the top"] },
  },
  {
    name: "Kettlebell row", category: "kettlebell",
    muscles: { lats: 1, "mid-back": 1, biceps: 0.5, "rear-delts": 0.25 },
    snack: { equipment: "kettlebell", impact: 0, floor: false, sweat: 1, reps: "8-12", unilateral: true },
  },
  {
    name: "Inverted row", category: "bodyweight", bodyweight: true,
    muscles: { "mid-back": 1, lats: 0.5, biceps: 0.5, "rear-delts": 0.5 },
    snack: { equipment: "suspension|barbell", impact: 0, floor: false, sweat: 1, reps: "6-12",
      cues: ["Body in one line, heels down", "Pull the chest to the handles"] },
  },
  {
    name: "Towel row", category: "bodyweight", bodyweight: true,
    muscles: { "mid-back": 1, lats: 0.5, biceps: 0.5, "rear-delts": 0.5, forearms: 0.25 },
    snack: { equipment: "door towel", impact: 0, floor: false, sweat: 0, reps: "8-12",
      cues: ["Open a sturdy door and face its edge; loop the towel round both handles", "Feet either side of the door, lean back on straight arms", "Row your chest to the door's edge, elbows back", "Check the hinges are solid before you lean"] },
  },
  {
    name: "Band row", category: "other",
    muscles: { "mid-back": 1, lats: 0.5, biceps: 0.5, "rear-delts": 0.25 },
    snack: { equipment: "band door|pullup-bar", impact: 0, floor: false, sweat: 0, reps: "12-15",
      cues: ["Anchor the band in a shut door, at chest height", "Squeeze the shoulder blades together at the end"] },
  },
  {
    name: "Band pull-apart", category: "other",
    muscles: { "rear-delts": 1, "mid-back": 0.5, traps: 0.25 },
    snack: { equipment: "band", impact: 0, floor: false, sweat: 0, reps: "15-20",
      cues: ["Arms straight at shoulder height", "Pull the band to your chest by spreading the hands"] },
  },
  {
    name: "Face pull", category: "machine",
    muscles: { "rear-delts": 1, "mid-back": 0.5, traps: 0.5 },
    snack: { equipment: "machines|band", impact: 0, floor: false, sweat: 0, reps: "12-15" },
  },
  {
    name: "Reverse fly", category: "dumbbell",
    muscles: { "rear-delts": 1, "mid-back": 0.5, traps: 0.25 },
    snack: { equipment: "dumbbells|band", impact: 0, floor: false, sweat: 0, reps: "10-15" },
  },
  {
    name: "Prone Y-T-W raise", category: "bodyweight", bodyweight: true,
    muscles: { "rear-delts": 1, "mid-back": 0.5, traps: 0.5, "lower-back": 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "5-8",
      cues: ["Face down, forehead on a folded towel", "Lift the arms into a Y, then a T, then a W — one rep", "Thumbs up, squeeze between the shoulder blades"] },
  },
  {
    name: "Superman", category: "bodyweight", bodyweight: true,
    muscles: { "lower-back": 1, glutes: 0.5, "mid-back": 0.25, "rear-delts": 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "10-15",
      cues: ["Face down, lift arms and legs together", "Hold for two seconds at the top"] },
  },

  // ---- Shoulders / arms ----
  {
    name: "Lateral raise", category: "dumbbell",
    muscles: { "side-delts": 1, traps: 0.25 },
    snack: { equipment: "dumbbells|band", impact: 0, floor: false, sweat: 0, reps: "10-15",
      cues: ["Lead with the elbows, stop at shoulder height", "Slower on the way down"] },
  },
  {
    name: "Front raise", category: "dumbbell",
    muscles: { "front-delts": 1 },
    snack: { equipment: "dumbbells|band", impact: 0, floor: false, sweat: 0, reps: "10-15" },
  },
  {
    name: "Shrug", category: "dumbbell",
    muscles: { traps: 1, forearms: 0.25 },
    snack: { equipment: "dumbbells|kettlebell|barbell|bag", impact: 0, floor: false, sweat: 0, reps: "10-15" },
  },
  {
    name: "Upright row", category: "barbell",
    muscles: { "side-delts": 1, traps: 1, biceps: 0.25 },
    snack: { equipment: "barbell|dumbbells|band", impact: 0, floor: false, sweat: 0, reps: "10-12" },
  },
  {
    name: "Barbell curl", category: "barbell",
    muscles: { biceps: 1, forearms: 0.5 },
    snack: { equipment: "barbell", impact: 0, floor: false, sweat: 0, reps: "8-12" },
  },
  {
    name: "Dumbbell curl", category: "dumbbell",
    muscles: { biceps: 1, forearms: 0.5 },
    snack: { equipment: "dumbbells", impact: 0, floor: false, sweat: 0, reps: "8-12" },
  },
  {
    name: "Hammer curl", category: "dumbbell",
    muscles: { biceps: 1, forearms: 1 },
    snack: { equipment: "dumbbells", impact: 0, floor: false, sweat: 0, reps: "8-12" },
  },
  {
    name: "Towel curl", category: "bodyweight", bodyweight: true,
    muscles: { biceps: 1, forearms: 0.5 },
    snack: { equipment: "towel", impact: 0, floor: false, sweat: 0, reps: "6-10", unilateral: true,
      cues: ["Loop a towel under one foot, hold both ends", "Curl up while the leg pushes down against you", "Three seconds up, three down"] },
  },
  {
    name: "Triceps extension", category: "dumbbell",
    muscles: { triceps: 1 },
    snack: { equipment: "dumbbells|band", impact: 0, floor: false, sweat: 0, reps: "10-15" },
  },
  {
    name: "Chair dip", category: "bodyweight", bodyweight: true,
    muscles: { triceps: 1, chest: 0.5, "front-delts": 0.5 },
    snack: { equipment: "chair|bench", impact: 0, floor: false, sweat: 0, reps: "8-15",
      cues: ["Chair against a wall so it cannot slide", "Shoulders down, elbows straight back", "Bend the knees to make it easier"] },
  },
  {
    name: "Skull crusher", category: "barbell",
    muscles: { triceps: 1 },
    snack: { equipment: "barbell|dumbbells", impact: 0, floor: false, sweat: 0, reps: "8-12" },
  },
  {
    name: "Triceps pushdown", category: "machine",
    muscles: { triceps: 1 },
    snack: { equipment: "machines|band", impact: 0, floor: false, sweat: 0, reps: "10-15" },
  },
  {
    name: "Wrist curl", category: "dumbbell",
    muscles: { forearms: 1 },
    snack: { equipment: "dumbbells", impact: 0, floor: false, sweat: 0, reps: "12-20" },
  },
  {
    name: "Neck curl", category: "other",
    muscles: { neck: 1 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "10-15",
      cues: ["Lie face up with your head just off the edge of the bed", "Slow nods; no load until it feels easy"] },
  },
  {
    name: "Neck isometric hold", category: "bodyweight", bodyweight: true,
    muscles: { neck: 1, traps: 0.25 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 0, seconds: 40,
      cues: ["Press your head into your palm — front, back, each side", "Ten seconds each, head still, about half effort"] },
  },

  // ---- Squat pattern ----
  {
    name: "Back squat", category: "barbell",
    muscles: { quads: 1, glutes: 1, "lower-back": 0.5, adductors: 0.5, hamstrings: 0.25 },
    snack: { equipment: "barbell", impact: 0, floor: false, sweat: 2, reps: "5-8" },
  },
  {
    name: "Front squat", category: "barbell",
    muscles: { quads: 1, glutes: 0.5, abs: 0.5, "lower-back": 0.5 },
    snack: { equipment: "barbell", impact: 0, floor: false, sweat: 2, reps: "5-8" },
  },
  {
    name: "Goblet squat", category: "kettlebell",
    muscles: { quads: 1, glutes: 0.5, abs: 0.5, adductors: 0.25 },
    snack: { equipment: "kettlebell|dumbbells", impact: 0, floor: false, sweat: 1, reps: "8-12",
      cues: ["Weight held at the chest, elbows inside the knees", "Sit down between your heels"] },
  },
  {
    name: "Bodyweight squat", category: "bodyweight", bodyweight: true,
    muscles: { quads: 1, glutes: 0.5, adductors: 0.25 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 0, reps: "12-25",
      cues: ["Feet shoulder-width, sit between your heels", "Knees follow the toes, chest proud"] },
  },
  {
    name: "Split squat", category: "dumbbell",
    muscles: { quads: 1, glutes: 1, adductors: 0.25 },
    snack: { equipment: "", load: "dumbbells|kettlebell", impact: 0, floor: false, sweat: 1, reps: "8-12", unilateral: true,
      cues: ["Long stance; drop the back knee straight down", "Front heel stays heavy"] },
  },
  {
    name: "Bulgarian split squat", category: "dumbbell",
    muscles: { quads: 1, glutes: 1, adductors: 0.5, hamstrings: 0.25 },
    snack: { equipment: "chair|bench", load: "dumbbells|kettlebell", impact: 0, floor: false, sweat: 1, reps: "6-12", unilateral: true,
      cues: ["Rear foot laces-down on a chair or the edge of the bed", "Torso tall, front knee over the toes"] },
  },
  {
    name: "Lunge", category: "dumbbell",
    muscles: { quads: 1, glutes: 1, hamstrings: 0.25, adductors: 0.25 },
    snack: { equipment: "", load: "dumbbells|kettlebell", impact: 0, floor: false, sweat: 1, reps: "8-12", unilateral: true },
  },
  {
    name: "Reverse lunge", category: "bodyweight", bodyweight: true,
    muscles: { quads: 1, glutes: 1, hamstrings: 0.25, adductors: 0.25 },
    snack: { equipment: "", load: "dumbbells|kettlebell", impact: 0, floor: false, sweat: 1, reps: "8-12", unilateral: true,
      cues: ["Step back, not forward — kinder on the knees and fits a small room", "Push through the front heel to stand"] },
  },
  {
    name: "Step-up", category: "dumbbell",
    muscles: { quads: 1, glutes: 1, calves: 0.25 },
    snack: { equipment: "stairs|bench|chair", load: "dumbbells|kettlebell", impact: 0, floor: false, sweat: 1, reps: "8-12", unilateral: true,
      cues: ["Whole foot on the step; drive through the heel", "Don't push off the back leg"] },
  },
  {
    name: "Pistol squat", category: "bodyweight", bodyweight: true,
    muscles: { quads: 1, glutes: 0.5, abs: 0.5, calves: 0.25 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 1, reps: "3-8", unilateral: true,
      cues: ["Hold a door frame for balance until you own the bottom"] },
  },
  {
    name: "Cossack squat", category: "bodyweight", bodyweight: true,
    muscles: { adductors: 1, quads: 1, glutes: 0.5 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 1, reps: "5-8", unilateral: true,
      cues: ["Wide stance; sit into one hip, the other leg straight, toes up", "Only as deep as the heel stays down"] },
  },
  {
    name: "Wall sit", category: "bodyweight", bodyweight: true,
    muscles: { quads: 1, glutes: 0.5, adductors: 0.25 },
    snack: { equipment: "wall", impact: 0, floor: false, sweat: 0, seconds: 45,
      cues: ["Back flat to the wall, thighs parallel to the floor", "Hands off the thighs"] },
  },

  // ---- Hinge pattern ----
  {
    name: "Deadlift", category: "barbell",
    muscles: { hamstrings: 1, glutes: 1, "lower-back": 1, traps: 0.5, forearms: 0.5, lats: 0.25 },
    snack: { equipment: "barbell", impact: 1, floor: false, sweat: 2, reps: "3-6" },
  },
  {
    name: "Romanian deadlift", category: "barbell",
    muscles: { hamstrings: 1, glutes: 1, "lower-back": 0.5, forearms: 0.25 },
    snack: { equipment: "barbell|dumbbells|kettlebell", impact: 0, floor: false, sweat: 1, reps: "8-10",
      cues: ["Soft knees, push the hips back", "Weight close to the legs; stop when the back wants to round"] },
  },
  {
    name: "Kettlebell swing", category: "kettlebell",
    muscles: { glutes: 1, hamstrings: 1, "lower-back": 0.5, abs: 0.25, forearms: 0.25 },
    snack: { equipment: "kettlebell", impact: 1, floor: false, sweat: 2, reps: "15-20",
      cues: ["Hinge, don't squat: hips back, shins vertical", "Snap the hips; the arms are just ropes"] },
  },
  {
    name: "Kettlebell snatch", category: "kettlebell",
    muscles: { glutes: 1, hamstrings: 0.5, "front-delts": 0.5, traps: 0.5, forearms: 0.5 },
    snack: { equipment: "kettlebell", impact: 1, floor: false, sweat: 2, reps: "5-10", unilateral: true },
  },
  {
    name: "Single-leg deadlift", category: "dumbbell",
    muscles: { hamstrings: 1, glutes: 1, "lower-back": 0.5 },
    snack: { equipment: "", load: "dumbbells|kettlebell", impact: 0, floor: false, sweat: 0, reps: "8-12", unilateral: true,
      cues: ["Hips square; reach the free leg back long", "Soft knee on the standing leg"] },
  },
  {
    name: "Good morning", category: "barbell",
    muscles: { hamstrings: 1, "lower-back": 1, glutes: 0.5 },
    snack: { equipment: "barbell", impact: 0, floor: false, sweat: 1, reps: "8-12" },
  },
  {
    name: "Hip thrust", category: "barbell",
    muscles: { glutes: 1, hamstrings: 0.5 },
    snack: { equipment: "barbell bench", impact: 0, floor: true, sweat: 1, reps: "8-12" },
  },
  {
    name: "Glute bridge", category: "bodyweight", bodyweight: true,
    muscles: { glutes: 1, hamstrings: 0.5 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "12-20",
      cues: ["Heels close to the hips; drive through them", "Squeeze at the top for a second"] },
  },
  {
    name: "Single-leg glute bridge", category: "bodyweight", bodyweight: true,
    muscles: { glutes: 1, hamstrings: 0.5 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "8-12", unilateral: true,
      cues: ["One foot planted, the other knee pulled to the chest", "Hips level at the top"] },
  },
  {
    name: "Towel hamstring curl", category: "bodyweight", bodyweight: true,
    muscles: { hamstrings: 1, glutes: 0.5, "lower-back": 0.25 },
    snack: { equipment: "towel", impact: 0, floor: true, sweat: 1, reps: "6-12",
      cues: ["Heels on a towel on a smooth floor, hips up in a bridge", "Pull the heels in without letting the hips drop", "Slide out slowly — that is where the work is"] },
  },
  {
    name: "Hamstring walkout", category: "bodyweight", bodyweight: true,
    muscles: { hamstrings: 1, glutes: 0.5, abs: 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "6-10",
      cues: ["From a bridge, walk the heels out in small steps, then back", "Keep the hips up as long as you can"] },
  },
  {
    name: "Back extension", category: "bodyweight", bodyweight: true,
    muscles: { "lower-back": 1, glutes: 0.5, hamstrings: 0.5 },
    snack: { equipment: "machines", impact: 0, floor: false, sweat: 1, reps: "10-15" },
  },

  // ---- Carries / odd objects ----
  {
    name: "Farmer's carry", category: "odd-object",
    muscles: { forearms: 1, traps: 1, abs: 0.5, obliques: 0.5, quads: 0.25 },
    snack: { equipment: "dumbbells|kettlebell|bag", impact: 0, floor: false, sweat: 1, seconds: 40,
      cues: ["Tall, shoulders packed down", "Short, quick steps — a corridor will do"] },
  },
  {
    name: "Suitcase carry", category: "odd-object",
    muscles: { obliques: 1, forearms: 1, traps: 0.5, abs: 0.5 },
    snack: { equipment: "dumbbells|kettlebell|bag", impact: 0, floor: false, sweat: 1, seconds: 30, unilateral: true,
      cues: ["Weight in one hand; don't lean away from it", "Your actual suitcase counts"] },
  },
  {
    name: "Sandbag carry", category: "odd-object",
    muscles: { abs: 1, "lower-back": 0.5, traps: 0.5, forearms: 0.5, quads: 0.5 },
    snack: { equipment: "sandbag", impact: 0, floor: false, sweat: 2, seconds: 40 },
  },
  {
    name: "Sandbag clean", category: "odd-object",
    muscles: { glutes: 1, "lower-back": 1, traps: 0.5, biceps: 0.25, quads: 0.5 },
    snack: { equipment: "sandbag", impact: 2, floor: false, sweat: 2, reps: "5-8" },
  },
  {
    name: "Sled push", category: "odd-object",
    muscles: { quads: 1, glutes: 1, calves: 0.5, abs: 0.25 },
    snack: { equipment: "sled", impact: 0, floor: false, sweat: 2, seconds: 20 },
  },

  // ---- Core ----
  {
    name: "Plank", category: "bodyweight", bodyweight: true,
    muscles: { abs: 1, obliques: 0.5, "front-delts": 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, seconds: 45,
      cues: ["Elbows under shoulders, glutes squeezed", "Ribs down; don't let the hips sag"] },
  },
  {
    name: "Side plank", category: "bodyweight", bodyweight: true,
    muscles: { obliques: 1, abs: 0.5 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, seconds: 30, unilateral: true,
      cues: ["Elbow under the shoulder, body in one line", "Push the hip up to the ceiling"] },
  },
  {
    name: "Plank shoulder tap", category: "bodyweight", bodyweight: true,
    muscles: { abs: 1, obliques: 0.5, "front-delts": 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 1, seconds: 30,
      cues: ["High plank, feet wide", "Tap the opposite shoulder without the hips rocking"] },
  },
  {
    name: "Hanging leg raise", category: "bodyweight", bodyweight: true,
    muscles: { abs: 1, forearms: 0.5, obliques: 0.25 },
    snack: { equipment: "pullup-bar", impact: 0, floor: false, sweat: 1, reps: "6-12" },
  },
  {
    name: "Sit-up", category: "bodyweight", bodyweight: true,
    muscles: { abs: 1, obliques: 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "12-20" },
  },
  {
    name: "Russian twist", category: "bodyweight", bodyweight: true,
    muscles: { obliques: 1, abs: 0.5 },
    snack: { equipment: "", load: "dumbbells|kettlebell", impact: 0, floor: true, sweat: 0, reps: "16-30" },
  },
  {
    name: "Ab wheel rollout", category: "other",
    muscles: { abs: 1, obliques: 0.5, lats: 0.25 },
    snack: { equipment: "ab-wheel", impact: 0, floor: true, sweat: 1, reps: "6-12" },
  },
  {
    name: "Hollow hold", category: "bodyweight", bodyweight: true,
    muscles: { abs: 1, obliques: 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, seconds: 30,
      cues: ["Lower back pressed into the floor", "Arms and legs long; bend the knees to make it easier"] },
  },
  {
    name: "Dead bug", category: "bodyweight", bodyweight: true,
    muscles: { abs: 1, obliques: 0.25 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "10-16",
      cues: ["Lower back glued to the floor", "Opposite arm and leg reach out slowly, then swap"] },
  },
  {
    name: "Bird dog", category: "bodyweight", bodyweight: true,
    muscles: { "lower-back": 0.5, abs: 0.5, glutes: 0.5 },
    snack: { equipment: "", impact: 0, floor: true, sweat: 0, reps: "8-12", unilateral: true,
      cues: ["On all fours, reach the opposite arm and leg long", "Hold for two seconds; the hips stay level"] },
  },
  {
    name: "Pallof press", category: "other",
    muscles: { obliques: 1, abs: 0.5 },
    snack: { equipment: "band door|pullup-bar|machines", impact: 0, floor: false, sweat: 0, reps: "8-12", unilateral: true,
      cues: ["Band anchored at chest height, stand side-on", "Press out and hold; don't let it turn you"] },
  },

  // ---- Calves ----
  {
    name: "Calf raise", category: "bodyweight", bodyweight: true,
    muscles: { calves: 1 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 0, reps: "15-25",
      cues: ["Full range: heels low to high — a step edge helps", "Pause at the top"] },
  },
  {
    name: "Single-leg calf raise", category: "bodyweight", bodyweight: true,
    muscles: { calves: 1 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 0, reps: "10-15", unilateral: true,
      cues: ["A fingertip on the wall for balance, nothing more", "Slow down, pause at the top"] },
  },
  {
    name: "Standing calf raise", category: "dumbbell",
    muscles: { calves: 1 },
    snack: { equipment: "dumbbells", impact: 0, floor: false, sweat: 0, reps: "10-15" },
  },

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
  //
  // A cardio profile's `seconds` is one bout. Anything whose bout runs past a
  // quarter of an hour — a hike, a bike ride, a swim — is an outing rather than
  // a snack, and the planner never proposes it (lib/snack/profile.ts).
  {
    name: "Run", category: "cardio", bodyweight: true, cardioBias: 1, mets: 9.8,
    muscles: { quads: 0.25, hamstrings: 0.25, calves: 0.25 },
    snack: { equipment: "outdoors", impact: 2, floor: false, sweat: 2, seconds: 600 },
  },
  {
    name: "Treadmill run", category: "cardio", bodyweight: true, cardioBias: 1, mets: 9.8,
    muscles: { quads: 0.25, hamstrings: 0.25, calves: 0.25 },
    snack: { equipment: "treadmill", impact: 1, floor: false, sweat: 2, seconds: 600 },
  },
  {
    name: "Walk", category: "cardio", bodyweight: true, cardioBias: 1, mets: 3.5,
    muscles: { calves: 0.25, quads: 0.25 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 0, seconds: 600,
      cues: ["Brisk: you can talk, but you would rather not sing", "Take the long way round — a corridor, a platform, the stairs"] },
  },
  {
    name: "Hike", category: "cardio", bodyweight: true, cardioBias: 1, mets: 6,
    muscles: { calves: 0.25, quads: 0.25, glutes: 0.25 },
    snack: { equipment: "outdoors", impact: 0, floor: false, sweat: 2, seconds: 3600 },
  },
  {
    name: "Cycle", category: "cardio", bodyweight: true, cardioBias: 1, mets: 7.5,
    muscles: { quads: 0.25, calves: 0.25 },
    snack: { equipment: "bike outdoors", impact: 0, floor: false, sweat: 2, seconds: 1800 },
  },
  {
    name: "Stationary bike", category: "cardio", cardioBias: 1, mets: 6.8,
    muscles: { quads: 0.25, calves: 0.25 },
    snack: { equipment: "exercise-bike", impact: 0, floor: false, sweat: 2, seconds: 300 },
  },
  {
    name: "Assault bike", category: "cardio", cardioBias: 0.9, mets: 10,
    muscles: { quads: 0.25, "front-delts": 0.25, lats: 0.25 },
    snack: { equipment: "air-bike", impact: 0, floor: false, sweat: 2, seconds: 60 },
  },
  {
    name: "Row (erg)", category: "cardio", cardioBias: 0.8, mets: 7,
    muscles: { lats: 0.5, "mid-back": 0.5, quads: 0.5, biceps: 0.25 },
    snack: { equipment: "rower", impact: 0, floor: false, sweat: 2, seconds: 300 },
  },
  {
    name: "Swim", category: "cardio", bodyweight: true, cardioBias: 1, mets: 7,
    muscles: { lats: 0.25, "front-delts": 0.25, triceps: 0.25 },
    snack: { equipment: "pool", impact: 0, floor: false, sweat: 2, seconds: 1800 },
  },
  {
    name: "Jump rope", category: "cardio", bodyweight: true, cardioBias: 1, mets: 11,
    muscles: { calves: 0.5, forearms: 0.25 },
    snack: { equipment: "jump-rope", impact: 2, floor: false, sweat: 2, seconds: 60 },
  },
  {
    name: "Stair climb", category: "cardio", bodyweight: true, cardioBias: 1, mets: 9,
    muscles: { quads: 0.25, glutes: 0.25, calves: 0.25 },
    snack: { equipment: "stairs", impact: 1, floor: false, sweat: 0, seconds: 30,
      cues: ["Every step, not every other; drive through the whole foot", "Brisk rather than flat out — you arrive at the meeting warm, not wet", "Walk back down — that is the rest"] },
  },
  {
    name: "Stair sprint", category: "cardio", bodyweight: true, cardioBias: 1, mets: 12,
    muscles: { quads: 0.25, glutes: 0.25, calves: 0.25 },
    snack: { equipment: "stairs", impact: 1, floor: false, sweat: 1, seconds: 20,
      cues: ["As fast as is safe, a hand near the rail", "About three flights; walk back down", "The exercise-snack studies used exactly this: 20 seconds, a few times a day"] },
  },
  {
    name: "Elliptical", category: "cardio", cardioBias: 1, mets: 5,
    muscles: { quads: 0.25, glutes: 0.25 },
    snack: { equipment: "elliptical", impact: 0, floor: false, sweat: 2, seconds: 300 },
  },
  {
    name: "Burpee", category: "bodyweight", bodyweight: true, cardioBias: 0.5, mets: 8,
    muscles: { chest: 0.5, quads: 0.5, "front-delts": 0.5, abs: 0.5, triceps: 0.25 },
    snack: { equipment: "", impact: 2, floor: true, sweat: 2, reps: "5-10",
      cues: ["Chest to the floor, jump at the top", "Step back instead of jumping to keep it quiet"] },
  },
  {
    name: "Squat jump", category: "bodyweight", bodyweight: true, cardioBias: 0.4, mets: 8,
    muscles: { quads: 1, glutes: 0.5, calves: 0.5 },
    snack: { equipment: "", impact: 2, floor: false, sweat: 2, reps: "6-10",
      cues: ["Quarter squat, then jump", "Land softly and quietly, knees tracking the toes"] },
  },
  {
    name: "Mountain climber", category: "bodyweight", bodyweight: true, cardioBias: 0.6, mets: 8,
    muscles: { abs: 1, "front-delts": 0.25, quads: 0.25 },
    snack: { equipment: "", impact: 1, floor: true, sweat: 2, seconds: 30,
      cues: ["High plank, hips level", "Drive the knees fast, feet light"] },
  },
  {
    name: "Battle rope", category: "cardio", cardioBias: 0.6, mets: 8,
    muscles: { "front-delts": 0.5, forearms: 0.5, abs: 0.25 },
    snack: { equipment: "battle-rope", impact: 1, floor: false, sweat: 2, seconds: 30 },
  },
  {
    name: "Shadow boxing", category: "cardio", bodyweight: true, cardioBias: 0.8, mets: 7.8,
    muscles: { "front-delts": 0.5, obliques: 0.25, calves: 0.25 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 1, seconds: 60,
      cues: ["Light on the feet, hands up", "Straight punches, turn the hips into them"] },
  },
  {
    name: "Jumping jacks", category: "cardio", bodyweight: true, cardioBias: 1, mets: 8,
    muscles: { calves: 0.25, "side-delts": 0.25 },
    snack: { equipment: "", impact: 2, floor: false, sweat: 1, seconds: 45 },
  },
  {
    name: "Step jacks", category: "cardio", bodyweight: true, cardioBias: 1, mets: 4.5,
    muscles: { calves: 0.25, "side-delts": 0.25 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 1, seconds: 60,
      cues: ["A jumping jack without the jump: step one foot out as the arms go up", "Quick feet — quiet enough for a hotel room"] },
  },
  {
    name: "High knees", category: "cardio", bodyweight: true, cardioBias: 1, mets: 8,
    muscles: { quads: 0.25, calves: 0.25, abs: 0.25 },
    snack: { equipment: "", impact: 2, floor: false, sweat: 2, seconds: 30 },
  },
  {
    name: "Marching high knees", category: "cardio", bodyweight: true, cardioBias: 1, mets: 4,
    muscles: { quads: 0.25, abs: 0.25 },
    snack: { equipment: "", impact: 0, floor: false, sweat: 1, seconds: 60,
      cues: ["Knees to hip height, arms pumping", "Fast, but no hop — nobody downstairs hears it"] },
  },
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
