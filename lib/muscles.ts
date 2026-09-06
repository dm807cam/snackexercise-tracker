/**
 * The muscle taxonomy. Single source of truth for the body map, the exercise
 * catalogue and the radar chart.
 *
 * Two levels, deliberately:
 *  - MUSCLES  (~18) are fine-grained enough to shade a body diagram usefully.
 *  - AXES     (12)  group those for the radar chart; 18 spokes is unreadable.
 */

export type BodyView = "front" | "back";

export type MuscleSlug =
  | "chest"
  | "front-delts"
  | "side-delts"
  | "rear-delts"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "traps"
  | "lats"
  | "mid-back"
  | "lower-back"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "adductors"
  | "calves"
  | "neck";

export type AxisSlug =
  | "chest"
  | "shoulders"
  | "back"
  | "biceps"
  | "triceps"
  | "forearms"
  | "core"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "calves"
  | "traps-neck";

export interface MuscleDef {
  slug: MuscleSlug;
  label: string;
  /** Which body diagram(s) this muscle is drawn on. */
  views: BodyView[];
  /** Radar spoke this muscle contributes to. */
  axis: AxisSlug;
}

export const MUSCLES: readonly MuscleDef[] = [
  { slug: "chest", label: "Chest", views: ["front"], axis: "chest" },
  { slug: "front-delts", label: "Front delts", views: ["front"], axis: "shoulders" },
  { slug: "side-delts", label: "Side delts", views: ["front", "back"], axis: "shoulders" },
  { slug: "rear-delts", label: "Rear delts", views: ["back"], axis: "shoulders" },
  { slug: "biceps", label: "Biceps", views: ["front"], axis: "biceps" },
  { slug: "triceps", label: "Triceps", views: ["back"], axis: "triceps" },
  { slug: "forearms", label: "Forearms", views: ["front", "back"], axis: "forearms" },
  { slug: "abs", label: "Abs", views: ["front"], axis: "core" },
  { slug: "obliques", label: "Obliques", views: ["front"], axis: "core" },
  { slug: "traps", label: "Traps", views: ["front", "back"], axis: "traps-neck" },
  { slug: "lats", label: "Lats", views: ["back"], axis: "back" },
  { slug: "mid-back", label: "Mid back", views: ["back"], axis: "back" },
  { slug: "lower-back", label: "Lower back", views: ["back"], axis: "back" },
  { slug: "glutes", label: "Glutes", views: ["back"], axis: "glutes" },
  { slug: "quads", label: "Quads", views: ["front"], axis: "quads" },
  { slug: "hamstrings", label: "Hamstrings", views: ["back"], axis: "hamstrings" },
  { slug: "adductors", label: "Adductors", views: ["front"], axis: "quads" },
  { slug: "calves", label: "Calves", views: ["front", "back"], axis: "calves" },
  { slug: "neck", label: "Neck", views: ["front"], axis: "traps-neck" },
] as const;

export interface AxisDef {
  slug: AxisSlug;
  label: string;
  /** Abbreviated form for the radar chart, where 12 full labels collide. */
  short: string;
}

/** Order matters: this is the clockwise order of the radar spokes. */
export const AXES: readonly AxisDef[] = [
  { slug: "chest", label: "Chest", short: "Chest" },
  { slug: "shoulders", label: "Shoulders", short: "Delts" },
  { slug: "biceps", label: "Biceps", short: "Bi" },
  { slug: "triceps", label: "Triceps", short: "Tri" },
  { slug: "forearms", label: "Forearms", short: "Forearm" },
  { slug: "core", label: "Core", short: "Core" },
  { slug: "quads", label: "Quads", short: "Quads" },
  { slug: "hamstrings", label: "Hamstrings", short: "Hams" },
  { slug: "glutes", label: "Glutes", short: "Glutes" },
  { slug: "calves", label: "Calves", short: "Calves" },
  { slug: "back", label: "Back", short: "Back" },
  { slug: "traps-neck", label: "Traps & neck", short: "Traps" },
] as const;

const MUSCLE_BY_SLUG = new Map(MUSCLES.map((m) => [m.slug, m]));
const AXIS_BY_SLUG = new Map(AXES.map((a) => [a.slug, a]));

export const MUSCLE_SLUGS: readonly MuscleSlug[] = MUSCLES.map((m) => m.slug);
export const AXIS_SLUGS: readonly AxisSlug[] = AXES.map((a) => a.slug);

export function isMuscleSlug(value: string): value is MuscleSlug {
  return MUSCLE_BY_SLUG.has(value as MuscleSlug);
}

export function muscleLabel(slug: string): string {
  return MUSCLE_BY_SLUG.get(slug as MuscleSlug)?.label ?? slug;
}

export function axisLabel(slug: string): string {
  return AXIS_BY_SLUG.get(slug as AxisSlug)?.label ?? slug;
}

export function axisShortLabel(slug: string): string {
  return AXIS_BY_SLUG.get(slug as AxisSlug)?.short ?? slug;
}

export function axisForMuscle(slug: string): AxisSlug | undefined {
  return MUSCLE_BY_SLUG.get(slug as MuscleSlug)?.axis;
}

export function musclesForView(view: BodyView): MuscleDef[] {
  return MUSCLES.filter((m) => m.views.includes(view));
}
