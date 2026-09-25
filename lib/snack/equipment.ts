/**
 * What might be to hand. Pure data and pure functions.
 *
 * The vocabulary is deliberately about PLACES as much as kit. The people this
 * app is for spend their days somewhere between a home with a kettlebell, a
 * hotel room with a desk chair and a towel, and a station platform with a
 * flight of stairs — and "no equipment" is the wrong model of the last two.
 * A hotel room has a chair, a wall, a door and a towel, and each of those opens
 * up movements a bare floor does not: incline push-ups, chair dips, towel rows,
 * towel hamstring curls. So the furniture is equipment here, on equal terms
 * with a barbell.
 *
 * A movement states what it needs as REQUIREMENTS, each a set of alternatives:
 * "chair|bench" is one requirement met by either; "door towel" is two, both
 * needed. That is enough to say everything the catalogue needs to say without
 * a query language.
 */

export type EquipmentGroup = "around" | "portable" | "home" | "gym" | "cardio";

export interface EquipmentDef {
  slug: string;
  label: string;
  group: EquipmentGroup;
}

export const EQUIPMENT: readonly EquipmentDef[] = [
  // What is simply around — a hotel room, an office, a station.
  { slug: "chair", label: "Sturdy chair", group: "around" },
  { slug: "table", label: "Desk or sturdy table", group: "around" },
  { slug: "wall", label: "Clear wall", group: "around" },
  { slug: "stairs", label: "Stairs", group: "around" },
  { slug: "door", label: "Door with solid hinges", group: "around" },
  { slug: "towel", label: "Towel", group: "around" },
  { slug: "bag", label: "Loaded bag or suitcase", group: "around" },
  { slug: "outdoors", label: "Somewhere to walk or run outside", group: "around" },
  // Things that fit in a suitcase.
  { slug: "band", label: "Resistance band", group: "portable" },
  { slug: "jump-rope", label: "Jump rope", group: "portable" },
  { slug: "suspension", label: "Suspension trainer or rings", group: "portable" },
  { slug: "ab-wheel", label: "Ab wheel", group: "portable" },
  // A home gym.
  { slug: "pullup-bar", label: "Pull-up bar", group: "home" },
  { slug: "dip-bars", label: "Dip bars", group: "home" },
  { slug: "dumbbells", label: "Dumbbells", group: "home" },
  { slug: "kettlebell", label: "Kettlebell", group: "home" },
  { slug: "barbell", label: "Barbell and rack", group: "home" },
  { slug: "bench", label: "Weight bench", group: "home" },
  { slug: "sandbag", label: "Sandbag", group: "home" },
  // A gym.
  { slug: "machines", label: "Cable and weight machines", group: "gym" },
  { slug: "sled", label: "Sled", group: "gym" },
  { slug: "battle-rope", label: "Battle rope", group: "gym" },
  // Cardio machines, one by one: someone with a rower does not have a treadmill.
  { slug: "treadmill", label: "Treadmill", group: "cardio" },
  { slug: "exercise-bike", label: "Exercise bike", group: "cardio" },
  { slug: "air-bike", label: "Air bike", group: "cardio" },
  { slug: "rower", label: "Rowing machine", group: "cardio" },
  { slug: "elliptical", label: "Elliptical", group: "cardio" },
  { slug: "bike", label: "Bicycle", group: "cardio" },
  { slug: "pool", label: "Swimming pool", group: "cardio" },
] as const;

export const EQUIPMENT_GROUP_LABELS: Record<EquipmentGroup, string> = {
  around: "Around you",
  portable: "In a suitcase",
  home: "Home gym",
  gym: "Gym",
  cardio: "Cardio machines",
};

const BY_SLUG = new Map(EQUIPMENT.map((e) => [e.slug, e]));

export const EQUIPMENT_SLUGS: readonly string[] = EQUIPMENT.map((e) => e.slug);

export function isEquipmentSlug(value: string): boolean {
  return BY_SLUG.has(value);
}

export function equipmentLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

/** One requirement: met by any one of these. */
export type Requirement = readonly string[];

/**
 * Parse a requirement spec.
 *
 * Returns null for null or undefined — "not described", which is a different
 * answer from "" ("needs nothing") and the caller decides what to infer. Unknown
 * slugs are kept rather than dropped: a requirement nobody can meet is the
 * honest reading of a typo, where dropping it would silently turn "needs a
 * sled" into "needs nothing".
 */
export function parseRequirements(spec: string | null | undefined): Requirement[] | null {
  if (spec == null) return null;
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((group) => group.split("|").filter(Boolean))
    .filter((alternatives) => alternatives.length > 0);
}

export function formatRequirements(requirements: readonly Requirement[]): string {
  return requirements.map((alternatives) => alternatives.join("|")).join(" ");
}

/** Whether every requirement has at least one alternative available. */
export function requirementsMet(
  requirements: readonly Requirement[],
  available: ReadonlySet<string>,
): boolean {
  return requirements.every((alternatives) => alternatives.some((slug) => available.has(slug)));
}

/**
 * The first available alternative of each requirement, for saying what the
 * movement will actually use here: "chair" rather than "chair or bench".
 */
export function chosenEquipment(
  requirements: readonly Requirement[],
  available: ReadonlySet<string>,
): string[] {
  const chosen: string[] = [];
  for (const alternatives of requirements) {
    const pick = alternatives.find((slug) => available.has(slug));
    if (pick) chosen.push(pick);
  }
  return chosen;
}

/** Parse a stored equipment list ("chair wall towel") into a set. */
export function parseEquipmentList(value: string | null | undefined): Set<string> {
  return new Set((value ?? "").split(/\s+/).filter((slug) => slug && isEquipmentSlug(slug)));
}

/** The canonical stored form: known slugs only, catalogue order, no repeats. */
export function formatEquipmentList(slugs: Iterable<string>): string {
  const wanted = new Set(slugs);
  return EQUIPMENT_SLUGS.filter((slug) => wanted.has(slug)).join(" ");
}
