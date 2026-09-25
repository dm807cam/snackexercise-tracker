/**
 * Today's plan of snacks for one user — the same computation the nudge job
 * makes, so what the app shows is what the scheduler will do.
 */

import { prisma } from "../db";
import { getAppConfig } from "../app-config";
import { minutesOfDayInZone, toLocalDateInZone } from "../dates";
import { daySpacing } from "../spacing";
import { getActiveWindow, getEntriesForDate, getSettings, getTargetBouts } from "../queries";
import { busyOn, formatMinute, isBusyAt, isDayOn, planDay } from "./schedule";
import { readNudgeSettings } from "./nudge-settings";

export async function todaySchedule(userId: string, now: Date = new Date()) {
  const [{ timeZone, today }, settings] = await Promise.all([getAppConfig(userId), getSettings(userId)]);
  const prefs = readNudgeSettings(settings);
  const [window, targetBouts, entries, blocks, devices] = await Promise.all([
    getActiveWindow(userId),
    getTargetBouts(userId),
    getEntriesForDate(userId, today),
    prisma.busyBlock.findMany({ where: { userId }, orderBy: { startMin: "asc" } }),
    prisma.pushSubscription.count({ where: { userId } }),
  ]);

  const nowMin = minutesOfDayInZone(now, timeZone);
  const bouts = daySpacing(
    entries.map((e) => minutesOfDayInZone(new Date(e.performedAt), timeZone)),
    window,
    targetBouts,
  ).boutMinutes;
  const busy = busyOn(blocks, today);

  const future = (instant: Date | null) => (instant && instant > now ? instant : null);
  const pausedUntil = future(prefs.pausedUntil);
  const snoozedUntil = future(prefs.snoozedUntil);
  const onToday = (instant: Date | null) =>
    instant ? (toLocalDateInZone(instant, timeZone) === today ? minutesOfDayInZone(instant, timeZone) : 24 * 60) : 0;
  const notBefore = Math.max(onToday(pausedUntil), onToday(snoozedUntil)) || null;

  const slots = planDay({ nowMin, window, targetBouts, boutMinutes: bouts, busy, notBeforeMin: notBefore });

  return {
    today,
    timeZone,
    window,
    targetBouts,
    done: bouts.length,
    slots: slots.map((s) => ({ ...s, time: formatMinute(s.minute) })),
    /** The next snack's time has come: the day is behind, or it is simply time. */
    dueNow: slots.length > 0 && slots[0].minute <= nowMin,
    busyNow: isBusyAt(busy, nowMin),
    nudges: {
      enabled: prefs.enabled && devices > 0,
      activeToday: prefs.enabled && devices > 0 && isDayOn(prefs.days, today),
      devices,
      followUp: prefs.followUp,
      maxPerDay: prefs.maxPerDay,
      days: prefs.days,
      snackMinutes: prefs.snackMinutes,
      // As strings, so the same shape crosses to a client component as over the API.
      pausedUntil: pausedUntil?.toISOString() ?? null,
      snoozedUntil: snoozedUntil?.toISOString() ?? null,
    },
    busy: blocks.map((b) => ({
      id: b.id,
      days: b.days,
      start: formatMinute(b.startMin),
      end: formatMinute(b.endMin),
      label: b.label,
    })),
  };
}

export type TodaySchedule = Awaited<ReturnType<typeof todaySchedule>>;
