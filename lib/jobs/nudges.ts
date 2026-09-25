/**
 * The nudge job: once a minute, for everyone who turned nudges on, decide
 * whether a snack is due and, if so, plan it and send it.
 *
 * Planning happens at send time, not in advance, so the snack in the
 * notification is right for this moment: where the user is, what they did an
 * hour ago, what is still owed today. Tapping Start opens exactly that plan.
 */

import { prisma } from "../db";
import { log } from "../logger";
import { count } from "../metrics";
import { getAppConfig } from "../app-config";
import { minutesOfDayInZone, toLocalDateInZone } from "../dates";
import { daySpacing } from "../spacing";
import { getActiveWindow, getEntriesForDate, getSettings, getTargetBouts } from "../queries";
import { sendToUser } from "../push";
import { createSnack } from "../snack/service";
import { busyOn, isDayOn, nudgeDue, planDay } from "../snack/schedule";
import { readNudgeSettings } from "../snack/nudge-settings";

/** Minutes of `instant` on `today` in `zone`, or null if it is not today. */
function minuteToday(instant: Date | null, now: Date, zone: string, today: string): number | null {
  if (!instant || instant <= now) return null;
  return toLocalDateInZone(instant, zone) === today ? minutesOfDayInZone(instant, zone) : 24 * 60;
}

export type NudgeOutcome = "sent" | "undelivered" | "not-due" | "off" | "claimed-elsewhere" | "in-progress";

export async function nudgeUser(userId: string, now: Date = new Date()): Promise<NudgeOutcome> {
  const [{ timeZone, today }, settings] = await Promise.all([getAppConfig(userId), getSettings(userId)]);
  const prefs = readNudgeSettings(settings);
  if (!prefs.enabled || !isDayOn(prefs.days, today)) return "off";

  const nowMin = minutesOfDayInZone(now, timeZone);
  const paused = minuteToday(prefs.pausedUntil, now, timeZone, today);
  if (paused != null && paused >= 24 * 60) return "off";
  const snoozed = minuteToday(prefs.snoozedUntil, now, timeZone, today);

  const [window, targetBouts, entries, blocks, sentRows, inProgress] = await Promise.all([
    getActiveWindow(userId),
    getTargetBouts(userId),
    getEntriesForDate(userId, today),
    prisma.busyBlock.findMany({ where: { userId } }),
    prisma.nudge.findMany({ where: { userId, localDate: today }, orderBy: { sentAt: "asc" } }),
    prisma.snack.count({ where: { userId, localDate: today, status: "started" } }),
  ]);
  // Mid-snack is the worst possible moment for a notification about a snack.
  if (inProgress > 0) return "in-progress";

  const bouts = daySpacing(
    entries.map((e) => minutesOfDayInZone(new Date(e.performedAt), timeZone)),
    window,
    targetBouts,
  ).boutMinutes;
  const busy = busyOn(blocks, today);
  const notBefore = Math.max(paused ?? 0, snoozed ?? 0) || null;

  const slots = planDay({ nowMin, window, targetBouts, boutMinutes: bouts, busy, notBeforeMin: notBefore });
  const due = nudgeDue({
    nowMin,
    slots,
    sent: sentRows.map((n) => ({ slot: n.slot, attempt: n.attempt, sentMin: minutesOfDayInZone(n.sentAt, timeZone) })),
    maxPerDay: prefs.maxPerDay,
    followUp: prefs.followUp,
    snoozedUntilMin: snoozed,
    window,
    busy,
  });
  if (!due) return "not-due";

  // Claim it first. The unique key is what makes this idempotent: a second
  // replica, or an overlapping tick, loses the insert and sends nothing.
  let nudgeId: string;
  try {
    const nudge = await prisma.nudge.create({ data: { userId, localDate: today, slot: due.slot, attempt: due.attempt } });
    nudgeId = nudge.id;
  } catch {
    return "claimed-elsewhere";
  }

  const snack = await createSnack(
    userId,
    { minutes: prefs.snackMinutes, focus: "auto", nonce: due.attempt },
    "nudge",
  );
  await prisma.nudge.update({ where: { id: nudgeId }, data: { snackId: snack.id } });
  count("snack_snacks_planned_total", { trigger: "nudge" });

  const plan = snack.plan;
  const delivered = await sendToUser(userId, {
    title: due.attempt === 0 ? "Time for a snack" : "A snack is still waiting",
    body: plan.empty
      ? "A few minutes free? Open the app for something that fits."
      : `${plan.headline}${plan.contextName ? ` · ${plan.contextName}` : ""}`,
    url: `/snack/${snack.id}`,
    tag: `snack-${today}-${due.slot}`,
    snackId: snack.id,
  });
  await prisma.nudge.update({ where: { id: nudgeId }, data: { delivered } });
  count("snack_nudges_sent_total", { attempt: String(due.attempt) });
  count("snack_push_deliveries_total", { result: delivered > 0 ? "delivered" : "undelivered" });
  return delivered > 0 ? "sent" : "undelivered";
}

/** One pass over everyone who might be due. One person's failure is only theirs. */
export async function runNudges(now: Date = new Date()): Promise<{ users: number; sent: number }> {
  const users = await prisma.user.findMany({
    where: {
      disabledAt: null,
      pushSubscriptions: { some: {} },
      settings: { some: { key: "nudges", value: "on" } },
    },
    select: { id: true },
  });

  let sent = 0;
  for (const { id } of users) {
    try {
      if ((await nudgeUser(id, now)) === "sent") sent += 1;
    } catch (error) {
      log.error("nudge failed", { userId: id, error });
    }
  }
  return { users: users.length, sent };
}
