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
  type DayWalking,
  entryMetMinutes,
  type IntensityContext,
  impliedStepsFromEntries,
  stepMetMinutes,
  type CardioInput,
  type StepSettings,
} from "./cardio";
import type { LocalDate } from "./dates";
import { entryEffectiveSets, entryHardSets } from "./scoring";
import { GUIDELINE_TARGETS as DEFAULT_TARGETS, type Targets as TargetsInput } from "./targets";

/**
 * The weekly targets each side is measured against are no longer constants —
 * they are configurable, with the guideline values as the default. See
 * lib/targets.ts, which also explains why raising the cardio target moves the
 * radar's and the calendar's exchange rate with it.
 */
export {
  EFFECTIVE_SETS_PER_HARD_SET,
  GUIDELINE_TARGETS,
  effectiveSetEquivalents,
  metMinutesPerEffectiveSet,
  type Targets,
} from "./targets";

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
  /**
   * The targets this marker was placed against, carried so the breakdown can
   * name them without importing a constant that is no longer the whole truth.
   */
  targets: TargetsInput;
}

/** Below this total dose the marker is not worth drawing. */
const CONFIDENCE_FLOOR = 0.3;

export function buildBalance(params: {
  windowDays: number;
  entries: readonly BalanceEntry[];
  /**
   * Each day's walking, keyed by local date — the count and the brisk minutes
   * the phone reported, which decide how much of the surplus is credited at
   * the brisk rate rather than the incidental one.
   */
  walkingByDate: Readonly<Record<string, DayWalking>>;
  stepSettings: StepSettings;
  /** The weekly doses each side is measured against. Defaults to the guideline. */
  targets?: TargetsInput;
  /**
   * Whose heart rate the MET figures are being read as. Optional: without it
   * the fixed anchor applies, which is what the app did before it could ask.
   */
  intensityContext?: IntensityContext;
}): BalanceResult {
  const {
    windowDays,
    entries,
    walkingByDate,
    stepSettings,
    targets = DEFAULT_TARGETS,
    intensityContext,
  } = params;
  const weeks = windowDays > 0 ? windowDays / 7 : 1;

  let hardSets = 0;
  let effectiveSets = 0;
  let entryMetMin = 0;
  for (const entry of entries) {
    hardSets += entryHardSets(entry);
    effectiveSets += entryEffectiveSets(entry);
    entryMetMin += entryMetMinutes(entry, intensityContext);
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
  for (const [date, walking] of Object.entries(walkingByDate)) {
    const steps = walking?.steps;
    if (steps == null || steps <= 0) continue;
    totalSteps += steps;

    const implied = impliedStepsFromEntries(entriesByDate.get(date) ?? []);
    stepMetMin += stepMetMinutes(steps, stepSettings, implied, walking.activeMinutes);
    creditedSteps += Math.max(0, steps - stepSettings.baseline - implied);
  }

  const metMinutes = entryMetMin + stepMetMin;

  // Window totals in guideline-weeks, deliberately not per-week rates: a
  // 180-day window at the same weekly pace as a 7-day one *should* be more
  // certain, and normalising to a rate would throw that information away.
  const strengthDose = hardSets / targets.strengthHardSetsPerWeek;
  const cardioDose = metMinutes / targets.cardioMetMinutesPerWeek;

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
    targets,
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
