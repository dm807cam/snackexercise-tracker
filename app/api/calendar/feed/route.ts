import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { getAppConfig } from "@/lib/app-config";
import { addDays, zonedDateTimeToInstant } from "@/lib/dates";
import { getActiveWindow, getSettings, getTargetBouts } from "@/lib/queries";
import { publicOrigin } from "@/lib/request-info";
import { renderCalendar, type CalendarEvent } from "@/lib/snack/ics";
import { busyOn, formatMinute, isDayOn, planDay } from "@/lib/snack/schedule";
import { readNudgeSettings } from "@/lib/snack/nudge-settings";
import { todaySchedule } from "@/lib/snack/schedule-service";

export const dynamic = "force-dynamic";

/** How far ahead the feed plans. A week: enough to see, not enough to go stale. */
const DAYS_AHEAD = 7;

/**
 * GET /api/calendar/feed?token=snk_… — the snack plan as a calendar to
 * subscribe to.
 *
 * Calendar apps cannot send an Authorization header, so this one route also
 * accepts the token in the query string — and only a token: never a cookie,
 * and only one carrying the narrow `calendar:read` scope, which can read
 * planned snack times and nothing else. Issue one just for this in Settings.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const token = request.nextUrl.searchParams.get("token");
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    if (token) headers.set("authorization", `Bearer ${token}`);
    const { user } = await authenticate(new Request(request.url, { headers }), { scope: "calendar:read" });

    const [{ timeZone, today }, settings, window, targetBouts, blocks, schedule] = await Promise.all([
      getAppConfig(user.id),
      getSettings(user.id),
      getActiveWindow(user.id),
      getTargetBouts(user.id),
      prisma.busyBlock.findMany({ where: { userId: user.id } }),
      todaySchedule(user.id),
    ]);
    const prefs = readNudgeSettings(settings);
    const origin = publicOrigin(request);
    const minutes = prefs.snackMinutes;

    const events: CalendarEvent[] = [];
    const add = (date: string, slot: { minute: number; number: number }) =>
      events.push({
        uid: `${date}-${slot.number}-${user.id}@snacks`,
        start: zonedDateTimeToInstant(date, formatMinute(slot.minute), timeZone),
        minutes: Math.max(5, minutes),
        title: `Snack (${minutes} min)`,
        description: `Snack ${slot.number} of ${targetBouts} today. Open the app when it comes up: it plans the snack for wherever you are.`,
        url: `${origin}/`,
      });

    if (isDayOn(prefs.days, today)) for (const slot of schedule.slots) add(today, slot);
    for (let offset = 1; offset < DAYS_AHEAD; offset += 1) {
      const date = addDays(today, offset);
      if (!isDayOn(prefs.days, date)) continue;
      const slots = planDay({ nowMin: 0, window, targetBouts, boutMinutes: [], busy: busyOn(blocks, date) });
      for (const slot of slots) add(date, slot);
    }

    return new NextResponse(renderCalendar(events), {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="snacks.ics"',
        "cache-control": "private, max-age=300",
      },
    });
  });
}
