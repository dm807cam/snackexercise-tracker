/**
 * The snack planner, wired to one user's data: gather what the planner needs,
 * keep the plan, and turn a finished snack into log entries.
 *
 * Everything here is scoped by the user id it is given, like lib/queries.ts.
 * A snack id belonging to someone else is simply not found.
 */

import { z } from "zod";
import { prisma, transaction } from "../db";
import { ApiError } from "../api";
import { addDays, minutesOfDayInZone, type LocalDate } from "../dates";
import { buildDailyGoal } from "../daily-goal";
import { entryMetMinutes } from "../cardio";
import { nextRungs } from "../progression";
import { getAppConfig } from "../app-config";
import { createEntry } from "../entries";
import {
  getDaySummary,
  getEntriesInRange,
  getExercises,
  getPhysiology,
  getSetting,
  loadStats,
  putSetting,
} from "../queries";
import { snackProfile } from "./profile";
import { ANYWHERE, capsOf, type StoredContext } from "./contexts";
import type { LastPerformance } from "./dose";
import type { PreferenceStats } from "./preference";
import { hashSeed } from "./random";
import {
  MAX_SNACK_MINUTES,
  MIN_SNACK_MINUTES,
  planSnack,
  swapBlock,
  type FocusRequest,
  type PlannerExercise,
  type PlannerInput,
} from "./planner";
import { PLAN_VERSION, type BlockResult, type SnackPlan } from "./types";

/** The window needs are read over — the suggestion bar's, so the two agree. */
const NEED_WINDOW_DAYS = 30;
/** How far back "what did you do last time" looks. */
const HISTORY_DAYS = 90;

export const snackRequestSchema = z.object({
  minutes: z.number().int().min(MIN_SNACK_MINUTES).max(MAX_SNACK_MINUTES).default(3),
  focus: z.enum(["auto", "strength", "cardio"]).default("auto"),
  /** A place other than the active one, for this snack only. */
  contextId: z.string().max(40).optional(),
  /** Bumped by "something else": the same situation, a different draw. */
  nonce: z.number().int().min(0).max(1000).default(0),
});

export type SnackRequest = z.infer<typeof snackRequestSchema>;

export const blockResultSchema = z.object({
  exerciseId: z.string().min(1).max(40),
  outcome: z.enum(["done", "skipped"]),
  sets: z.number().int().min(0).max(30),
  reps: z.number().int().min(1).max(500).nullable(),
  seconds: z.number().int().min(1).max(3600).nullable(),
  weightKg: z.number().min(0).max(1000).nullable(),
  effort: z.enum(["easy", "hard", "failure"]).nullable(),
});

export const completionSchema = z.object({
  results: z.array(blockResultSchema).min(1).max(12),
});

/** The user's places, and which one is active. */
export async function getContexts(userId: string) {
  const [contexts, activeId] = await Promise.all([
    prisma.trainingContext.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    getSetting(userId, "activeContextId"),
  ]);
  const active = contexts.find((c) => c.id === activeId) ?? contexts[0] ?? null;
  return { contexts, activeId: active?.id ?? null, active };
}

export async function setActiveContext(userId: string, contextId: string): Promise<void> {
  const context = await prisma.trainingContext.findFirst({ where: { id: contextId, userId }, select: { id: true } });
  if (!context) throw new ApiError("Place not found", 404, "not-found");
  await putSetting(userId, "activeContextId", context.id);
}

async function lastPerformances(userId: string, today: LocalDate): Promise<Map<string, LastPerformance>> {
  const rows = await prisma.setEntry.findMany({
    where: { userId, localDate: { gte: addDays(today, -HISTORY_DAYS) } },
    orderBy: [{ performedAt: "desc" }],
    select: { exerciseId: true, localDate: true, sets: true, reps: true, weightKg: true, durationSec: true, effort: true },
  });
  const byExercise = new Map<string, LastPerformance>();
  for (const row of rows) {
    // The most recent entry that says something about the dose.
    if (byExercise.has(row.exerciseId)) continue;
    if (row.reps == null && row.durationSec == null) continue;
    byExercise.set(row.exerciseId, row);
  }
  return byExercise;
}

async function preferences(userId: string): Promise<Map<string, PreferenceStats>> {
  const rows = await prisma.exercisePreference.findMany({ where: { userId } });
  return new Map(rows.map((r) => [r.exerciseId, r]));
}

/** Everything the planner needs, for one user, now. */
export async function plannerInputFor(userId: string, request: SnackRequest, extraExclude: string[] = []) {
  const config = await getAppConfig(userId);
  const { today, timeZone } = config;

  const { contexts, active } = await getContexts(userId);
  const context: StoredContext | null = request.contextId
    ? (contexts.find((c) => c.id === request.contextId) ?? null)
    : active;
  if (request.contextId && !context) throw new ApiError("Place not found", 404, "not-found");

  const [exercises, stats, summary, recentEntries, history, prefs, physiology] = await Promise.all([
    getExercises(userId),
    loadStats(userId, NEED_WINDOW_DAYS, today, timeZone, false),
    getDaySummary(userId, today, timeZone, today),
    getEntriesInRange(userId, addDays(today, -3), today),
    lastPerformances(userId, today),
    preferences(userId),
    getPhysiology(userId),
  ]);

  const goal = buildDailyGoal({
    hardSets: summary.hardSets,
    metMinutes: summary.metMinutes,
    stepMetMinutes: summary.stepMetMinutes,
    targets: summary.targets,
  });

  const plannerExercises: PlannerExercise[] = exercises.map((e) => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    cardioBias: e.cardioBias,
    mets: e.mets,
    muscles: e.muscles,
    profile: snackProfile(e),
  }));

  const intensityContext = { physiology, today };
  const stalled = new Map<string, readonly string[]>();
  for (const progress of stats.progress) {
    if (progress.stalled) stalled.set(progress.exerciseId, nextRungs(progress.slug));
  }

  const nowMs = Date.now();
  const input: PlannerInput = {
    nowMs,
    today,
    minutes: request.minutes,
    focus: request.focus as FocusRequest,
    caps: context ? capsOf(context) : ANYWHERE,
    contextName: context?.name ?? null,
    exercises: plannerExercises,
    needs: {
      axes: stats.axes,
      daysSinceCardio: stats.daysSinceCardio,
      cardioMetMinutesPerWeek: stats.balance.detail.metMinutesPerWeek,
      cardioTargetMetMinutesPerWeek: stats.targets.cardioMetMinutesPerWeek,
    },
    rings: {
      strengthRemaining: goal.strength.remaining,
      strengthTarget: goal.strength.target,
      cardioRemaining: goal.cardio.remaining,
      cardioTarget: goal.cardio.target,
    },
    recent: recentEntries.map((entry) => ({
      exerciseId: entry.exercise.id,
      localDate: entry.localDate,
      performedAtMs: new Date(entry.performedAt).getTime(),
      sets: entry.sets,
      effort: entry.effort,
      cardioBias: entry.exercise.cardioBias ?? 0,
      muscles: entry.exercise.muscles,
      metMinutes: entryMetMinutes(entry, intensityContext),
    })),
    history,
    preferences: prefs,
    stalled,
    exclude: new Set(extraExclude),
    // The same situation proposes the same snack until something changes: the
    // day, the place, the minutes, the focus, a snack being logged, or the user
    // asking for something else.
    seed: hashSeed(
      userId,
      today,
      context?.id ?? "anywhere",
      request.minutes,
      request.focus,
      request.nonce,
      summary.spacing.bouts,
      Math.floor(minutesOfDayInZone(new Date(nowMs), timeZone) / 60),
    ),
  };
  return { input, context, config };
}

export function parsePlan(value: string): SnackPlan {
  const plan = JSON.parse(value) as SnackPlan;
  if (plan?.version !== PLAN_VERSION) {
    throw new ApiError("This snack was planned by an older version of the app. Plan a new one.", 409, "stale-plan");
  }
  return plan;
}

export function snackView(row: {
  id: string;
  localDate: string;
  status: string;
  trigger: string;
  minutes: number;
  plan: string;
  contextId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  return {
    id: row.id,
    localDate: row.localDate,
    status: row.status,
    trigger: row.trigger,
    minutes: row.minutes,
    contextId: row.contextId,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    plan: parsePlan(row.plan),
  };
}

export type SnackView = ReturnType<typeof snackView>;

/** Plan a snack and keep it, so the player can resume it and the result can be read against it. */
export async function createSnack(userId: string, request: SnackRequest, trigger: "now" | "nudge" = "now") {
  const { input, context, config } = await plannerInputFor(userId, request);
  const plan = planSnack(input);
  const row = await prisma.snack.create({
    data: {
      userId,
      localDate: config.today,
      contextId: context?.id ?? null,
      trigger,
      minutes: plan.minutes,
      plan: JSON.stringify(plan),
    },
  });
  return snackView(row);
}

export async function findSnack(userId: string, id: string) {
  const row = await prisma.snack.findFirst({ where: { id, userId } });
  if (!row) throw new ApiError("Snack not found", 404, "not-found");
  return row;
}

function assertOpen(row: { status: string }) {
  if (row.status === "done" || row.status === "skipped" || row.status === "expired") {
    throw new ApiError(`This snack is already ${row.status}.`, 409, "snack-closed");
  }
}

export async function startSnack(userId: string, id: string) {
  const row = await findSnack(userId, id);
  assertOpen(row);
  const updated = await prisma.snack.update({
    where: { id: row.id },
    data: { status: "started", startedAt: row.startedAt ?? new Date() },
  });
  return snackView(updated);
}

async function bumpPreference(
  db: Pick<typeof prisma, "exercisePreference">,
  userId: string,
  exerciseId: string,
  field: "done" | "skipped" | "swapped",
) {
  await db.exercisePreference.upsert({
    where: { userId_exerciseId: { userId, exerciseId } },
    create: { userId, exerciseId, [field]: 1 },
    update: { [field]: { increment: 1 } },
  });
}

/**
 * Swap one block for something else that does the same job here. The movement
 * swapped out counts against it in the preference model, and is never offered
 * again in this snack.
 */
export async function swapInSnack(userId: string, id: string, target: { index: number } | "finisher") {
  const row = await findSnack(userId, id);
  assertOpen(row);
  const plan = parsePlan(row.plan);
  const current = target === "finisher" ? plan.finisher : plan.blocks[target.index];
  if (!current) throw new ApiError("No such block in this snack", 400);

  const swappedOut = [...new Set([...(plan.swappedOut ?? []), current.exerciseId])];
  const { input } = await plannerInputFor(
    userId,
    { minutes: plan.minutes, focus: "auto", contextId: row.contextId ?? undefined, nonce: swappedOut.length },
    swappedOut,
  );
  const swapped = swapBlock(input, plan, target);
  if (!swapped) throw new ApiError("Nothing else here does that job. Try skipping it instead.", 409, "no-alternative");

  await bumpPreference(prisma, userId, current.exerciseId, "swapped");
  const updated = await prisma.snack.update({
    where: { id: row.id },
    data: { plan: JSON.stringify({ ...swapped, swappedOut }) },
  });
  return snackView(updated);
}

/**
 * Turn what the user actually did into log entries — through the same
 * createEntry path as every other way of logging — and close the snack.
 *
 * Only movements that are in the plan are accepted: this endpoint logs a snack,
 * it is not a second, unvalidated way into the log.
 */
export async function completeSnack(userId: string, id: string, results: BlockResult[]) {
  const row = await findSnack(userId, id);
  assertOpen(row);
  const plan = parsePlan(row.plan);
  const inPlan = new Set([...plan.blocks.map((b) => b.exerciseId), ...(plan.finisher ? [plan.finisher.exerciseId] : [])]);
  for (const result of results) {
    if (!inPlan.has(result.exerciseId)) throw new ApiError("That movement is not part of this snack", 400);
  }

  const { timeZone } = await getAppConfig(userId);
  const done = results.filter((r) => r.outcome === "done" && r.sets > 0);

  const entries = await transaction(async (tx) => {
    const created = [];
    for (const result of done) {
      created.push(
        await createEntry(
          userId,
          timeZone,
          {
            exerciseId: result.exerciseId,
            sets: result.sets,
            reps: result.reps,
            durationSec: result.seconds,
            weightKg: result.weightKg,
            effort: result.effort,
            source: "manual",
          },
          { snackId: row.id, source: "snack", db: tx },
        ),
      );
    }
    for (const result of results) {
      await bumpPreference(tx, userId, result.exerciseId, result.outcome === "done" ? "done" : "skipped");
    }
    await tx.snack.update({
      where: { id: row.id },
      data: {
        status: done.length > 0 ? "done" : "skipped",
        startedAt: row.startedAt ?? new Date(),
        finishedAt: new Date(),
      },
    });
    return created;
  });

  const updated = await prisma.snack.findUniqueOrThrow({ where: { id: row.id } });
  return { snack: snackView(updated), entries };
}

/** "Not now." About the moment, not the movements, so no preference is touched. */
export async function skipSnack(userId: string, id: string) {
  const row = await findSnack(userId, id);
  assertOpen(row);
  const updated = await prisma.snack.update({
    where: { id: row.id },
    data: { status: "skipped", finishedAt: new Date() },
  });
  return snackView(updated);
}

/** A day's snacks, newest first, for the day page and adherence. */
export async function snacksOn(userId: string, localDate: LocalDate) {
  const rows = await prisma.snack.findMany({
    where: { userId, localDate },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => {
    try {
      return snackView(row);
    } catch {
      return null;
    }
  }).filter((s): s is SnackView => s !== null);
}

/** Housekeeping: yesterday's unfinished snacks are not coming back. */
export async function expireStaleSnacks(before: LocalDate): Promise<number> {
  const { count } = await prisma.snack.updateMany({
    where: { localDate: { lt: before }, status: { in: ["proposed", "started"] } },
    data: { status: "expired" },
  });
  return count;
}
