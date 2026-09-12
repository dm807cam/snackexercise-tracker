/**
 * How well a day's training is spread across it. Pure functions, no database
 * access, same discipline as lib/scoring.ts and lib/cardio.ts.
 *
 * The premise of this app is that scattered snacks beat one block, and until
 * now nothing in it measured whether the snacks were actually scattered. Thirty
 * effective sets at 19:00 and thirty effective sets spread over six visits to
 * the pull-up bar score identically everywhere else in the app, and they are
 * not the same thing.
 *
 * WHAT THIS SCORE IS, AND IS NOT. It measures HOW WELL YOUR TRAINING WAS
 * DISTRIBUTED. It does not measure sedentary interruption, and the distinction
 * is not pedantry — the two have different doses and only one of them is
 * something this app can observe.
 *
 * The sedentary-interruption literature is about interrupting sitting BY ANY
 * MEANS, and its dose is roughly every 20-30 minutes during sitting, in bouts
 * of 2-5 minutes: Dempsey et al. 2016, Diabetes Care (3 min every 30);
 * Buffey et al. 2022, Sports Medicine (2 min every 20-30 was enough, 1 min
 * every 30 was not); Dunstan et al. 2012, Diabetes Care. That is on the order
 * of 15-25 interruptions across a working day. Standing up to make tea is one
 * of them, and nothing in this app will ever record it.
 *
 * So an earlier version of this header justified the metric by citing that
 * literature directly, which overclaimed: with a target of five bouts it was
 * measuring something an order of magnitude less frequent than the protocols
 * it named, using only logged training as evidence. The exposure it can
 * actually see is training distribution, and that is what it now says.
 *
 * The target it IS anchored to is the exercise-snacks work — Jenkins et al.
 * 2019, Appl Physiol Nutr Metab and Islam et al. 2022 use ~3 vigorous bouts a
 * day; Stamatakis et al. 2022's VILPA finding is 3-4 short vigorous bouts a
 * day. See DEFAULT_TARGET_BOUTS.
 *
 * A user who wants to chase the sedentary-interruption dose instead can say so:
 * the target is configurable, and everything derived from it moves with it.
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
 *     score = (1 / m) / sum(p_i^2),    m = max(n + 1, targetBouts + 1)
 *
 * sum(p_i^2) is the Simpson concentration of the gaps: it is 1/(n+1) when the
 * gaps are all equal and approaches 1 when one gap swallows the day. Dividing
 * the ideal concentration by the actual one gives 1 for a perfectly spread day
 * and tends to 0 for a day spent entirely in one block.
 *
 * The `m` floor is what makes frequency count. Without it the ideal is measured
 * against however many bouts you happened to do, and one bout at noon scores
 * 0.85 for the crime of being unclusterable. With a floor of targetBouts + 1
 * segments, a day is scored against a day that trained every ~2.8 waking hours,
 * and one bout scores about 0.28 — which is the honest answer to "how well was
 * this day broken up".
 *
 * Deliberately NOT weighted by how much each bout contained. This is a measure
 * of DISTRIBUTION, and a two-minute set of squats breaks a day up exactly as
 * well as twenty minutes of them do. Volume is already measured, thoroughly,
 * everywhere else.
 *
 * BOUT LENGTH IS REPORTED, NOT SCORED. Buffey found two minutes of walking
 * effective where one minute was not, so length is not nothing — but that
 * threshold is about walking breaks for glucose, and applying it here would
 * mean the app refusing to count a twenty-second stair sprint it was built to
 * encourage. So `medianBoutMinutes` sits beside the score and says nothing
 * about it, and the user can see for themselves that their typical snack lasts
 * twenty seconds. See `boutDuration` for what counts as evidence of a length.
 */

/**
 * Bouts a well-broken-up training day contains.
 *
 * Five, and now attributed rather than asserted. It sits just above the
 * exercise-snacks protocols this app's format actually descends from — ~3
 * vigorous bouts a day in Jenkins et al. 2019 and Islam et al. 2022, 3-4 short
 * vigorous bouts a day in Stamatakis et al. 2022's VILPA work — which is the
 * literature a TRAINING-distribution score belongs to.
 *
 * It is deliberately NOT the sedentary-interruption dose, which is 15-25
 * interruptions a day and which this app cannot observe: most of those are
 * standing up to make tea. Someone who wants to aim at that can set it, and the
 * merge window and the spacing nudge follow.
 */
export const DEFAULT_TARGET_BOUTS = 5;

export const MIN_TARGET_BOUTS = 2;
export const MAX_TARGET_BOUTS = 24;

/**
 * Entries logged within this many minutes of each other are one bout.
 *
 * Three movements logged in one go at the top of the stairs are one
 * interruption, not three, and counting them as three would let a single
 * session buy a good score by being logged in pieces.
 *
 * DERIVED FROM THE TARGET rather than fixed at fifteen minutes, because the two
 * have to move together. At five bouts in a fourteen-hour window the ideal gap
 * is 140 minutes and a fifteen-minute merge is a tenth of it — unobjectionable.
 * At a target of twenty the ideal gap is forty minutes, and a fifteen-minute
 * merge would swallow genuinely separate breaks, quietly making the higher
 * target unreachable.
 */
export function mergeWindowFor(
  targetBouts: number,
  window: ActiveWindow = DEFAULT_ACTIVE_WINDOW,
): number {
  const span = Math.max(60, (window.endHour - window.startHour) * 60);
  const idealGap = span / (Math.max(1, targetBouts) + 1);
  return Math.min(15, Math.max(3, Math.round(idealGap * 0.1)));
}

/** Clamp a configured target to something a day can actually be scored against. */
export function normaliseTargetBouts(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return DEFAULT_TARGET_BOUTS;
  return Math.min(MAX_TARGET_BOUTS, Math.max(MIN_TARGET_BOUTS, Math.round(value)));
}

export interface ActiveWindow {
  /** Hour the user is normally up and about, 0..23. */
  startHour: number;
  /** Hour they normally stop, 1..24. */
  endHour: number;
}

export const DEFAULT_ACTIVE_WINDOW: ActiveWindow = { startHour: 8, endHour: 22 };

/**
 * One logged thing, as the spacing metric sees it: when it happened, and how
 * much movement it recorded.
 *
 * A bare number is still accepted and means "at this minute, length unknown",
 * which is what a set of ten push-ups is.
 */
export interface BoutEvent {
  /** Minutes since local midnight. */
  minuteOfDay: number;
  /**
   * Seconds of movement the entry actually recorded: `durationSec` times the
   * set count, since `durationSec` is stored per set. Null or absent for the
   * many entries that record reps and nothing else.
   */
  movementSec?: number | null;
}

export type SpacingEvent = number | BoutEvent;

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
  /**
   * How long each bout lasted in minutes, aligned index-for-index with
   * `boutMinutes`. Null where the app has no evidence either way.
   */
  boutDurationMin: (number | null)[];
  /**
   * Median length of the bouts whose length is known, or null when none is.
   *
   * Reported BESIDE the score rather than folded into it. Buffey et al. 2022
   * found two minutes of walking effective where one was not, so length plainly
   * matters — but the app's own premise is that a two-minute set counts, and
   * filtering short bouts out of the score would contradict it on evidence that
   * is about walking breaks rather than about training. Showing the number lets
   * the user see that their typical snack is twenty seconds long without the
   * app deciding on their behalf that it did not happen.
   */
  medianBoutMinutes: number | null;
  /** How many of `bouts` contributed a known length to that median. */
  timedBouts: number;
  /** The window the day was actually scored against, after any expansion. */
  window: { startMin: number; endMin: number };
}

interface GroupedBout {
  /** First entry in the bout. */
  startMin: number;
  /** Last entry in the bout; equal to `startMin` when the bout is one entry. */
  endMin: number;
  /** Recorded movement seconds summed across the bout's entries. */
  movementSec: number;
}

function normaliseEvent(event: SpacingEvent): { minuteOfDay: number; movementSec: number } | null {
  if (typeof event === "number") {
    return Number.isFinite(event) ? { minuteOfDay: event, movementSec: 0 } : null;
  }
  if (!event || !Number.isFinite(event.minuteOfDay)) return null;
  const sec = event.movementSec;
  return {
    minuteOfDay: event.minuteOfDay,
    movementSec: sec != null && Number.isFinite(sec) && sec > 0 ? sec : 0,
  };
}

/**
 * Merge events into bouts, keeping each bout's extent and recorded movement.
 *
 * The merge anchors on the bout's FIRST entry, not its most recent one. Chaining
 * off the latest entry would let a long unbroken session of near-misses collapse
 * into one enormous "bout", which is the opposite of what the merge is for.
 */
function groupBouts(
  events: readonly SpacingEvent[],
  mergeWithinMin: number,
): GroupedBout[] {
  const sorted = events
    .map(normaliseEvent)
    .filter((e): e is { minuteOfDay: number; movementSec: number } => e !== null)
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);

  const bouts: GroupedBout[] = [];
  for (const event of sorted) {
    const last = bouts[bouts.length - 1];
    if (last === undefined || event.minuteOfDay - last.startMin > mergeWithinMin) {
      bouts.push({
        startMin: event.minuteOfDay,
        endMin: event.minuteOfDay,
        movementSec: event.movementSec,
      });
    } else {
      last.endMin = event.minuteOfDay;
      last.movementSec += event.movementSec;
    }
  }
  return bouts;
}

/**
 * How long a bout lasted, in minutes, or null when the app cannot say.
 *
 * Two independent LOWER BOUNDS, and the larger wins because both are
 * observations rather than estimates:
 *
 * - the SPAN from the bout's first entry to its last. Three movements logged
 *   between 18:00 and 18:05 is five minutes the user demonstrably spent at it.
 * - the RECORDED movement time, `durationSec` x sets summed over the bout. A
 *   twenty-minute run is a single entry with a zero span and twenty real
 *   minutes in it.
 *
 * A lone untimed entry — one set of ten push-ups — has neither, and is null
 * rather than zero. The app does not know whether it took twenty seconds or
 * five minutes, and "0" would be a claim rather than an absence.
 */
function boutDuration(bout: GroupedBout): number | null {
  const minutes = Math.max(bout.endMin - bout.startMin, bout.movementSec / 60);
  // Two decimals, not one: these are often well under a minute, and rounding a
  // 45-second snack to 0.8 min would render it as "50s".
  return minutes > 0 ? round2(minutes) : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return round2(value);
}

/**
 * Merge timestamps into bouts. Input is minutes since local midnight (or
 * `BoutEvent`s), in any order; output is ascending bout times, each the first
 * moment of its bout.
 */
export function toBouts(
  events: readonly SpacingEvent[],
  mergeWithinMin: number = mergeWindowFor(DEFAULT_TARGET_BOUTS),
): number[] {
  return groupBouts(events, mergeWithinMin).map((bout) => bout.startMin);
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
  events: readonly SpacingEvent[],
  window: ActiveWindow = DEFAULT_ACTIVE_WINDOW,
  targetBouts: number = DEFAULT_TARGET_BOUTS,
): SpacingResult {
  // Merged on the CONFIGURED window, not the expanded one: an early run
  // widening the day must not also widen what counts as one bout.
  const grouped = groupBouts(events, mergeWindowFor(targetBouts, window));
  const bouts = grouped.map((bout) => bout.startMin);
  const durations = grouped.map(boutDuration);
  const known = durations.filter((d): d is number => d != null);

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
    boutDurationMin: durations,
    medianBoutMinutes: median(known),
    timedBouts: known.length,
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
  /**
   * Median length of every bout in the window whose length is known — pooled
   * across days rather than a mean of per-day medians, so one busy Saturday
   * does not weigh the same as one Tuesday lunchtime set.
   */
  medianBoutMinutes: number | null;
  /** Bouts that contributed a known length, and bouts in total. */
  timedBouts: number;
  totalBouts: number;
  /** Bouts per hour of the day, 24 buckets — where the training actually lands. */
  byHour: number[];
  /** The best and worst logged days in the window, for a concrete comparison. */
  best: { date: string; score: number } | null;
  worst: { date: string; score: number } | null;
  window: ActiveWindow;
  /** The target the scores were measured against, so the page can name it. */
  targetBouts: number;
}

/** Roll per-day results up across a window. Days with nothing logged are skipped. */
export function summariseSpacing(
  days: ReadonlyMap<string, SpacingResult> | ReadonlyArray<[string, SpacingResult]>,
  window: ActiveWindow = DEFAULT_ACTIVE_WINDOW,
  targetBouts: number = DEFAULT_TARGET_BOUTS,
): SpacingSummary {
  const entries = Array.isArray(days) ? days : [...(days as ReadonlyMap<string, SpacingResult>)];

  const byHour = new Array(24).fill(0) as number[];
  const durations: number[] = [];
  let scoreSum = 0;
  let gapSum = 0;
  let bouts = 0;
  let totalBouts = 0;
  let rated = 0;
  let best: { date: string; score: number } | null = null;
  let worst: { date: string; score: number } | null = null;

  for (const [date, day] of entries) {
    for (const minute of day.boutMinutes) {
      const hour = Math.min(23, Math.max(0, Math.floor(minute / 60)));
      byHour[hour] += 1;
    }
    // Pooled before the score check, and across every day: how long a snack
    // lasts is a fact about the snack, not about how well the day was spread.
    totalBouts += day.bouts;
    for (const duration of day.boutDurationMin) {
      if (duration != null) durations.push(duration);
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
    medianBoutMinutes: median(durations),
    timedBouts: durations.length,
    totalBouts,
    byHour,
    best,
    worst,
    window,
    targetBouts: normaliseTargetBouts(targetBouts),
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

/**
 * A bout length, which is usually minutes but is sometimes seconds — and a
 * twenty-second stair sprint rounded to "0m" would read as a bug.
 */
export function formatBoutLength(minutes: number): string {
  if (minutes < 1) return `${Math.max(5, Math.round((minutes * 60) / 5) * 5)}s`;
  return formatGap(minutes);
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
