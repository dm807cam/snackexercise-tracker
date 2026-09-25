/**
 * Where the user is, as the planner needs to know it. Pure data.
 *
 * The premise of the app is training that happens wherever the day puts you,
 * and "wherever" has a small number of shapes that recur for almost everybody
 * who travels for work: home, the office, a hotel room, somewhere in transit.
 * Each gets a preset that is honest about what is usually there — a hotel room
 * has a chair, a desk, a wall, a door and a towel; a station platform has a
 * wall and stairs and nowhere you would lie down — and every preset is only a
 * starting point the user edits once.
 */

import { EQUIPMENT_SLUGS, formatEquipmentList } from "./equipment";
import type { ContextCaps, Sweat } from "./profile";

export type ContextKind = "home" | "hotel" | "travel" | "office" | "gym" | "outdoors" | "other";

export interface ContextPreset {
  kind: ContextKind;
  /** The name a new context of this kind starts with. */
  name: string;
  description: string;
  equipment: string[];
  quiet: boolean;
  floor: boolean;
  sweat: Sweat;
}

export const CONTEXT_PRESETS: Record<ContextKind, ContextPreset> = {
  home: {
    kind: "home",
    name: "Home",
    description: "Furniture, a street outside, and whatever kit you own.",
    equipment: ["chair", "table", "wall", "door", "towel", "outdoors"],
    quiet: false,
    floor: true,
    sweat: 2,
  },
  office: {
    kind: "office",
    name: "Office",
    description: "Stay presentable: nothing on the floor, nothing that needs a shower.",
    equipment: ["chair", "table", "wall", "stairs", "door"],
    quiet: true,
    floor: false,
    sweat: 0,
  },
  hotel: {
    kind: "hotel",
    name: "Hotel room",
    description: "A chair, a desk, a towel and a door — and somebody asleep downstairs.",
    equipment: ["chair", "table", "wall", "door", "towel", "bag"],
    quiet: true,
    floor: true,
    sweat: 2,
  },
  travel: {
    kind: "travel",
    name: "On the move",
    description: "Airports, stations, conferences: stairs, a wall, your bag.",
    equipment: ["wall", "stairs", "bag"],
    quiet: true,
    floor: false,
    sweat: 0,
  },
  gym: {
    kind: "gym",
    name: "Gym",
    description: "Everything, including the hotel gym.",
    equipment: EQUIPMENT_SLUGS.filter((slug) => !["outdoors", "bike", "pool", "bag"].includes(slug)),
    quiet: false,
    floor: true,
    sweat: 2,
  },
  outdoors: {
    kind: "outdoors",
    name: "Outdoors",
    description: "A park or a street: room to run, a bench, some steps.",
    equipment: ["outdoors", "stairs", "wall", "bench"],
    quiet: false,
    floor: false,
    sweat: 2,
  },
  other: {
    kind: "other",
    name: "Somewhere else",
    description: "Start from nothing and tick what is there.",
    equipment: [],
    quiet: false,
    floor: true,
    sweat: 2,
  },
};

export const CONTEXT_KINDS = Object.keys(CONTEXT_PRESETS) as ContextKind[];

export function isContextKind(value: string): value is ContextKind {
  return value in CONTEXT_PRESETS;
}

/**
 * The contexts every new account starts with, in the order they are shown.
 * The four places a travelling worker actually spends a week; a gym and a park
 * are one tap away in Settings.
 */
export const DEFAULT_CONTEXT_KINDS: readonly ContextKind[] = ["home", "office", "hotel", "travel"];

/** A row as the database stores it. */
export interface StoredContext {
  id: string;
  name: string;
  kind: string;
  equipment: string;
  quiet: boolean;
  floor: boolean;
  sweat: number;
}

export function capsOf(context: Pick<StoredContext, "equipment" | "quiet" | "floor" | "sweat">): ContextCaps {
  return {
    equipment: new Set(context.equipment.split(/\s+/).filter(Boolean)),
    quiet: context.quiet,
    floor: context.floor,
    sweat: Math.min(2, Math.max(0, Math.round(context.sweat))) as Sweat,
  };
}

/** The row a preset creates. */
export function presetRow(kind: ContextKind, sortOrder = 0) {
  const preset = CONTEXT_PRESETS[kind];
  return {
    name: preset.name,
    kind: preset.kind,
    equipment: formatEquipmentList(preset.equipment),
    quiet: preset.quiet,
    floor: preset.floor,
    sweat: preset.sweat,
    sortOrder,
  };
}

/**
 * What the planner falls back to when the user has not said where they are:
 * nothing but the floor and some room. It proposes only what can be done
 * anywhere, which is never wrong — just sometimes less than was possible.
 */
export const ANYWHERE: ContextCaps = {
  equipment: new Set(),
  quiet: true,
  floor: true,
  sweat: 1,
};
