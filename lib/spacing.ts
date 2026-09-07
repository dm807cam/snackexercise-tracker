/**
 * How well a day's training is spread across it. Pure functions, no database
 * access, same discipline as lib/scoring.ts and lib/cardio.ts.
 *
 * The premise of this app is that scattered snacks beat one block, and until
 * now nothing in it measured whether the snacks were actually scattered. Thirty
 * effective sets at 19:00 and thirty effective sets spread over six visits to
 * the pull-up bar score identically everywhere else in the app, and they are
 * not the same thing: breaking up sedentary time is a separate exposure from
 * total volume, with its own effects on glycaemic control and its own dose.
 *
 * The measure has to satisfy two things at once, because the user asked for
 * both: MORE bouts is better, and EVENLY SPACED bouts are better. Evenness
 * alone would rate a single mid-afternoon set highly — one event cannot be
 * clustered — so evenness alone is not the metric.
 *
 * SPACING SCORE. Take the day's active window, place the bouts in it, and look
 * at the n + 1 GAPS they cut it into (window start to first bout, between
 * consecutive bouts, last bout to window end). Let p_i be each gap as a
 * fraction of the window, so the p_i sum to 1. Then
 *
 *     score = (1 / m) / sum(p_i^2),    m = max(n + 1, TARGET_BOUTS + 1)
 *
 * sum(p_i^2) is the Simpson concentration of the gaps: it is 1/(n+1) when the
 * gaps are all equal and approaches 1 when one gap swallows the day. Dividing
 * the ideal concentration by the actual one gives 1 for a perfectly spread day
 * and tends to 0 for a day spent entirely in one block.
 *
 * The `m` floor is what makes frequency count. Without it the ideal is measured
 * against however many bouts you happened to do, and one bout at noon scores
 * 0.85 for the crime of being unclusterable. With a floor of TARGET_BOUTS + 1
 * segments, a day is scored against a day that trained every ~2.8 waking hours,
 * and one bout scores about 0.28 — which is the honest answer to "how well was
 * this day broken up".
 *
 * Deliberately NOT weighted by how much each bout contained. This is a measure
 * of how often you interrupted sitting, and a two-minute set of squats
 * interrupts it exactly as well as twenty minutes of them. Volume is already
 * measured, thoroughly, everywhere else.
 */

/** Bouts a well-broken-up day contains — one about every 2.8 waking hours. */
export const TARGET_BOUTS = 5;

/**
 * Entries logged within this many minutes of each other are one bout.
 *
 * Three movements logged in one go at the top of the stairs are one
 * interruption of sitting, not three, and counting them as three would let a
 * single session buy a good score by being logged in pieces.
 */
export const BOUT_MERGE_MIN = 15;

export interface ActiveWindow {
  /** Hour the user is normally up and about, 0..23. */
  startHour: number;
  /** Hour they normally stop, 1..24. */
  endHour: number;
}

export const DEFAULT_ACTIVE_WINDOW: ActiveWindow = { startHour: 8, endHour: 22 };

export interface SpacingResult {
  /**
   * 0..1, or null when the day has nothing logged. Null rather than 0: a rest
   * day is not a badly spread day, and averaging zeros in would turn the metric
   * into a second, worse activity count.
   */
  score: number | null;
  /** Bouts after merging. */
  bouts: number;
  /** Minutes in the longest unbroken stretch, including the window's edges. */
  longestGapMin: number | null;
  /** Minutes since local midnight of each bout, ascending. */
  boutMinutes: number[];
  /** The window the day was actually scored against, after any expansion. */
  window: { startMin: number; endMin: number };
}

/**
 * Merge timestamps into bouts. Input is minutes since local midnight, in any
 * order; output is ascending bout times, each the first moment of its bout.
 */
export function toBouts(
  minutesOfDay: readonly number[],
  mergeWithinMin: number = BOUT_MERGE_MIN,
): number[] {
  const sorted = [...minutesOfDay].filter((m) => Number.isFinite(m)).sort((a, b) => a - b);
  const bouts: number[] = [];
  for (const minute of sorted) {
    const last = bouts[bouts.length - 1];
    if (last === undefined || minute - last > mergeWithinMin) bouts.push(minute);
  }
  return bouts;
}

/**
 * Score one day.
 *
 * The window EXPANDS to cover anything logged outside it, and never contracts.
 * A 05:30 run is genuinely early rather than something that happened at the
 * stroke of eight, and expansion can only make evenness harder to achieve — so
 * an unusual day cannot be used to shrink the day down to the hour it was
 * trained in and score a perfect one.
 */
export function daySpacing(
  minutesOfDay: readonly number[],
  window: ActiveWindow = DEFAULT_ACTIVE_WINDOW,
  targetBouts: number = TARGET_BOUTS,
): SpacingResult {
  const bouts = toBouts(minutesOfDay);

  let startMin = clampMinute(window.startHour * 60);
  let endMin = clampMinute(window.endHour * 60);
  if (endMin <= startMin) {
    startMin = DEFAULT_ACTIVE_WINDOW.startHour * 60;
    endMin = DEFAULT_ACTIVE_WINDOW.endHour * 60;
  }

  for (const bout of bouts) {
    if (bout < startMin) startMin = bout;
    if (bout > endMin) endMin = bout;
  }

  const span = endMin - startMin;
  const base = {
    bouts: bouts.length,
    boutMinutes: bouts,
    window: { startMin, endMin },
  };

  if (bouts.length === 0 || span <= 0) {
    return { ...base, score: null, longestGapMin: bouts.length === 0 ? null : 0 };
  }

  const gaps: number[] = [];
  let cursor = startMin;
  for (const bout of bouts) {
    gaps.push(bout - cursor);
    cursor = bout;
  }
  gaps.push(endMin - cursor);

  let concentration = 0;
  for (const gap of gaps) {
    const share = gap / span;
    concentration += share * share;
  }

  const segments = Math.max(gaps.length, targetBouts + 1);
  const score = concentration > 0 ? 1 / segments / concentration : 1;

  return {
    ...base,
    score: round3(Math.min(1, Math.max(0, score))),
    longestGapMin: Math.round(Math.max(...gaps)),
  };
}

export interface SpacingSummary {
  /** Mean daily score over days that had something logged; null if none did. */
  score: number | null;
  /** Days that contributed to that mean. */
  ratedDays: number;
  /** Mean bouts per logged day. */
  boutsPerDay: number;
  /** Mean longest-gap across logged days, in minutes. */
  longestGapMin: number | null;
  /** Bouts per hour of the day, 24 buckets — where the training actually lands. */
  byHour: number[];
  /** The best and worst logged days in the window, for a concrete comparison. */
  best: { date: string; score: number } | null;
  worst: { date: string; score: number } | null;
  window: ActiveWindow;
}

/** Roll per-day results up across a window. Days with nothing logged are skipped. */
export function summariseSpacing(
  days: ReadonlyMap<string, SpacingResult> | ReadonlyArray<[string, SpacingResult]>,
  window: ActiveWindow = DEFAULT_ACTIVE_WINDOW,
): SpacingSummary {
  const entries = Array.isArray(days) ? days : [...(days as ReadonlyMap<string, SpacingResult>)];

  const byHour = new Array(24).fill(0) as number[];
  let scoreSum = 0;
  let gapSum = 0;
  let bouts = 0;
  let rated = 0;
  let best: { date: string; score: number } | null = null;
  let worst: { date: string; score: number } | null = null;

  for (const [date, day] of entries) {
    for (const minute of day.boutMinutes) {
      const hour = Math.min(23, Math.max(0, Math.floor(minute / 60)));
      byHour[hour] += 1;
    }
    if (day.score == null) continue;

    rated += 1;
    scoreSum += day.score;
    bouts += day.bouts;
    gapSum += day.longestGapMin ?? 0;

    if (!best || day.score > best.score) best = { date, score: day.score };
    if (!worst || day.score < worst.score) worst = { date, score: day.score };
  }

  return {
    score: rated > 0 ? round3(scoreSum / rated) : null,
    ratedDays: rated,
    boutsPerDay: rated > 0 ? round2(bouts / rated) : 0,
    longestGapMin: rated > 0 ? Math.round(gapSum / rated) : null,
    byHour,
    best,
    worst,
    window,
  };
}

/** Plain-English band for a score, so the number is not the only thing shown. */
export function spacingLabel(score: number | null): string {
  if (score == null) return "Nothing logged";
  if (score >= 0.75) return "Well spread";
  if (score >= 0.5) return "Fairly spread";
  if (score >= 0.3) return "Bunched";
  return "One block";
}

/** "6h 20m" — a gap is read as a duration, never as 380. */
export function formatGap(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1440, Math.max(0, Math.round(value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
