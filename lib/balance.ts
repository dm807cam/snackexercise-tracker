/**
 * The strength-cardio balance marker. Pure functions, no database access.
 *
 * The question is "is my training primarily cardio or primarily strength", and
 * the hard part is that the two sides are measured in incommensurable units:
 * effective sets against MET-minutes. Comparing them directly means inventing
 * an exchange rate, and any exchange rate invented here would be arbitrary.
 *
 * So neither side is compared to the other. Each is compared to ITS OWN weekly
 * guideline dose first, and only the two resulting fractions are compared. That
 * is what makes a marker in the middle mean something real — S = 1 and C = 1
 * both mean "met the guideline", so 50/50 reads as *equally on target for
 * both*, not as *the arbitrary units happened to tie*.
 */

import {
  CARDIO_TARGET_MET_MIN_PER_WEEK,
  entryMetMinutes,
  impliedStepsFromEntries,
  stepMetMinutes,
  type CardioInput,
  type StepSettings,
} from "./cardio";
import type { LocalDate } from "./dates";
import { entryEffectiveSets, entryHardSets } from "./scoring";

/**
 * The reference point of the EFFECTIVE-SET SCALE — the per-muscle-summed
 * quantity the radar, the body map and the calendar are drawn against.
 *
 * Not a dose target. Because a set credits 1.0 / 0.5 / 0.25 across the muscles
 * it trains, the number of effective sets a single hard set generates depends
 * entirely on which movement it was: 1.0 for a triceps extension, 4.25 for a
 * deadlift. Summed into one number that fan-out is an artefact of movement
 * selection, so the dose is measured in hard sets — see
 * STRENGTH_TARGET_HARD_SETS_PER_WEEK below — and this constant survives only to
 * say how far out a line should be drawn.
 */
export const STRENGTH_TARGET_EFFECTIVE_SETS_PER_WEEK = 60;

/**
 * Effective sets one hard set generates, averaged across the catalogue.
 *
 * A property of the DRAWING SCALE and of nothing else. It is close to the
 * catalogue's mean fan-out (~2.0 over the 73 non-pure-cardio movements) but is
 * deliberately a fixed number rather than one computed from the catalogue: the
 * muscle weightings are editable in Settings, and a scale that moved whenever
 * someone adjusted a row would silently restate every past week.
 */
export const EFFECTIVE_SETS_PER_HARD_SET = 2.2;

/**
 * HARD SETS per week that count as meeting the strength guideline — the actual
 * strength dose target, and the number the ring, the marker and the day view
 * are all measured against.
 *
 * ~27 a week. Consistent with the WHO's "muscle-strengthening on 2 or more
 * days" and with the hypertrophy literature's ~10 sets per muscle group per
 * week across the major groups. Derived from the drawing scale above so the two
 * cannot drift, but unlike the old effective-set target it does not move when
 * the muscle weightings are edited, because hard sets do not depend on them.
 *
 * It assumes a logged set is a hard set, which is exactly what an unrated set
 * is counted as (lib/effort.ts). Rating sets as `easy` lowers the dose against
 * an unchanged target, which is the point of rating them.
 */
export const STRENGTH_TARGET_HARD_SETS_PER_WEEK =
  STRENGTH_TARGET_EFFECTIVE_SETS_PER_WEEK / EFFECTIVE_SETS_PER_HARD_SET;

/**
 * Prior strength, in guideline-weeks of imaginary dose. Half a week, split
 * evenly between the two sides.
 *
 * Without it the naive share C/(C+S) is right in the middle of its range and
 * wrong at the edges: one ten-minute walk in an otherwise empty week reads as
 * "100% cardio" on the strength of a single data point. This is the Beta(k/2,
 * k/2) prior whose posterior mean is the formula in `balanceFrom` — with no
 * data it sits at 0.5, and it washes out within a couple of logged weeks.
 */
export const PRIOR_WEIGHT = 0.5;

/**
 * MET-minutes that carry the same fraction of a weekly guideline as one
 * effective set — the app's one and only exchange rate between the two
 * currencies, derived from the two targets rather than invented beside them.
 *
 * It exists so that a chart can put both qualities on one radial scale without
 * ADDING them. Nothing here makes a run into resistance volume: effective sets
 * are still scaled by (1 - cardioBias) everywhere, and the two series stay
 * separate lines with separate colours. This constant only answers "how far out
 * should the cardio line be drawn", and it answers it the same way the calendar
 * already answers "how dark should this day be".
 */
export const MET_MIN_PER_EFFECTIVE_SET =
  CARDIO_TARGET_MET_MIN_PER_WEEK / STRENGTH_TARGET_EFFECTIVE_SETS_PER_WEEK;

/** MET-minutes expressed on the effective-set scale. Never added to real sets. */
export function effectiveSetEquivalents(metMinutes: number): number {
  return metMinutes / MET_MIN_PER_EFFECTIVE_SET;
}

export interface BalanceEntry extends CardioInput {
  id: string;
  performedAt: Date;
  localDate: LocalDate;
  weightKg: number | null;
  /** Scales the strength side, exactly as it does everywhere else. */
  effort?: string | null;
  exercise: CardioInput["exercise"] & {
    id: string;
    name: string;
    muscles: { muscle: string; weight: number }[];
  };
}

export interface BalanceResult {
  /** Cardio's share of the total dose, 0..1. The marker's position. */
  cardioShare: number;
  /** Posterior sd of that share — the width of the marker's band. */
  uncertainty: number;
  /** Signed form for a diverging scale: -1 all strength, +1 all cardio. */
  index: number;
  /** Strength dose in guideline-weeks. */
  strengthDose: number;
  /** Cardio dose in guideline-weeks. */
  cardioDose: number;
  /** Raw numbers behind the doses, for the breakdown under the gradient. */
  detail: {
    /**
     * The dose, in hard sets — normalised for how many muscles each movement
     * fans out across, so a deadlift session and a curl session of the same
     * size read as the same size.
     */
    hardSets: number;
    hardSetsPerWeek: number;
    /** The same work on the drawing scale — what the radar's spokes sum to. */
    effectiveSets: number;
    effectiveSetsPerWeek: number;
    metMinutes: number;
    metMinutesPerWeek: number;
    /** MET-minutes of the cardio dose that came from step counts. */
    stepMetMinutes: number;
    /** Steps credited after baseline and de-duplication. */
    creditedSteps: number;
    totalSteps: number;
  };
  /**
   * False when there is too little logged for the share to mean anything, and
   * the UI should say so rather than draw a needle on a band half the width of
   * the bar. A marker placed precisely on no evidence is a lie.
   */
  confident: boolean;
  windowDays: number;
}

/** Below this total dose the marker is not worth drawing. */
const CONFIDENCE_FLOOR = 0.3;

export function buildBalance(params: {
  windowDays: number;
  entries: readonly BalanceEntry[];
  /** Step counts for the days in the window, keyed by local date. */
  stepsByDate: Readonly<Record<string, number | null | undefined>>;
  stepSettings: StepSettings;
}): BalanceResult {
  const { windowDays, entries, stepsByDate, stepSettings } = params;
  const weeks = windowDays > 0 ? windowDays / 7 : 1;

  let hardSets = 0;
  let effectiveSets = 0;
  let entryMetMin = 0;
  for (const entry of entries) {
    hardSets += entryHardSets(entry);
    effectiveSets += entryEffectiveSets(entry);
    entryMetMin += entryMetMinutes(entry);
  }

  // De-duplicate steps against logged foot-based cardio day by day: the run
  // that produced those steps happened on one specific day, and spreading the
  // correction across the window would under-credit every other day.
  const entriesByDate = new Map<string, BalanceEntry[]>();
  for (const entry of entries) {
    const list = entriesByDate.get(entry.localDate);
    if (list) list.push(entry);
    else entriesByDate.set(entry.localDate, [entry]);
  }

  let stepMetMin = 0;
  let creditedSteps = 0;
  let totalSteps = 0;
  for (const [date, steps] of Object.entries(stepsByDate)) {
    if (steps == null || steps <= 0) continue;
    totalSteps += steps;

    const implied = impliedStepsFromEntries(entriesByDate.get(date) ?? []);
    stepMetMin += stepMetMinutes(steps, stepSettings, implied);
    creditedSteps += Math.max(0, steps - stepSettings.baseline - implied);
  }

  const metMinutes = entryMetMin + stepMetMin;

  // Window totals in guideline-weeks, deliberately not per-week rates: a
  // 180-day window at the same weekly pace as a 7-day one *should* be more
  // certain, and normalising to a rate would throw that information away.
  const strengthDose = hardSets / STRENGTH_TARGET_HARD_SETS_PER_WEEK;
  const cardioDose = metMinutes / CARDIO_TARGET_MET_MIN_PER_WEEK;

  const { cardioShare, uncertainty } = balanceFrom(strengthDose, cardioDose);

  return {
    cardioShare,
    uncertainty,
    index: 2 * cardioShare - 1,
    strengthDose: round(strengthDose),
    cardioDose: round(cardioDose),
    detail: {
      hardSets: round(hardSets),
      hardSetsPerWeek: round(hardSets / weeks),
      // Both are real sums over the same entries, not one converted into the
      // other: the dose above is what the marker is placed on, and this is the
      // figure the radar's spokes actually add up to.
      effectiveSets: round(effectiveSets),
      effectiveSetsPerWeek: round(effectiveSets / weeks),
      metMinutes: Math.round(metMinutes),
      metMinutesPerWeek: Math.round(metMinutes / weeks),
      stepMetMinutes: Math.round(stepMetMin),
      creditedSteps: Math.round(creditedSteps),
      totalSteps: Math.round(totalSteps),
    },
    confident: strengthDose + cardioDose >= CONFIDENCE_FLOOR,
    windowDays,
  };
}

/**
 * Posterior mean and standard deviation of cardio's share of the dose, under a
 * Beta(k/2, k/2) prior.
 *
 * Treating each guideline-week of dose as evidence about "what fraction of a
 * unit of training is cardio" gives a Beta posterior, whose mean is the shrunk
 * share and whose sd is the honest width of the answer. One distribution
 * supplies both the marker and its band, and the band narrows as the window
 * fills — which is the whole reason the doses above are window totals.
 */
export function balanceFrom(
  strengthDose: number,
  cardioDose: number,
): { cardioShare: number; uncertainty: number } {
  const s = Math.max(0, strengthDose);
  const c = Math.max(0, cardioDose);

  const total = s + c + PRIOR_WEIGHT;
  const share = (c + PRIOR_WEIGHT / 2) / total;
  const uncertainty = Math.sqrt((share * (1 - share)) / (total + 1));

  return { cardioShare: round3(share), uncertainty: round3(uncertainty) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
