/**
 * Hourly housekeeping: nothing here is urgent, all of it is tidy-up that keeps
 * the database the size of its content rather than of its history.
 */

import { prisma } from "../db";
import { config } from "../config";
import { log } from "../logger";
import { addDays, toLocalDateInZone } from "../dates";
import { purgeExpiredSessions } from "../auth/session";
import { purgeStaleLinks } from "../auth/links";
import { purgeExpiredRateLimits } from "../rate-limit";
import { purgeOldAuditEvents } from "../audit";
import { expireStaleSnacks } from "../snack/service";

/** Nudges are kept this long: long enough to read adherence off them. */
const NUDGE_RETENTION_DAYS = 120;

export async function housekeeping(now: Date = new Date()) {
  // Snacks belong to their owner's day, and zones differ; anything from before
  // yesterday in UTC is yesterday or earlier everywhere on Earth.
  const cutoff = addDays(toLocalDateInZone(now, "UTC"), -1);
  const result = {
    sessions: await purgeExpiredSessions(now),
    rateLimits: await purgeExpiredRateLimits(now),
    links: await purgeStaleLinks(now),
    auditEvents: await purgeOldAuditEvents(config.auditRetentionDays, now),
    snacksExpired: await expireStaleSnacks(cutoff),
    nudges: (
      await prisma.nudge.deleteMany({
        where: { sentAt: { lt: new Date(now.getTime() - NUDGE_RETENTION_DAYS * 86_400_000) } },
      })
    ).count,
  };
  log.info("housekeeping", result);
  return result;
}
