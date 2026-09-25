/**
 * Fixed-window rate limits, kept in the database.
 *
 * Not in memory: a restart would reset every counter, and a second replica
 * would keep its own. Each hit is ONE atomic statement — Prisma's upsert on
 * SQLite is a native INSERT ... ON CONFLICT DO UPDATE — so two requests cannot
 * both read "one slot left" and both take it. The only race left is two
 * requests arriving just after a window expired, which can each restart the
 * window at 1; that under-counts by one, once, and is not worth a lock.
 */

import { prisma } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSec: number;
}

export async function hitRateLimit(
  key: string,
  limit: number,
  windowSec: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const resetAt = new Date(now.getTime() + windowSec * 1000);

  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, resetAt },
    update: { count: { increment: 1 } },
  });

  if (row.resetAt <= now) {
    // A stale window: this hit opens a fresh one.
    await prisma.rateLimit.updateMany({
      where: { key, resetAt: { lte: now } },
      data: { count: 1, resetAt },
    });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (row.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)),
    };
  }
  return { allowed: true, remaining: limit - row.count, retryAfterSec: 0 };
}

/** Whether a key is currently over its limit, without spending a slot. */
export async function isRateLimited(key: string, limit: number, now: Date = new Date()): Promise<boolean> {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  return Boolean(row && row.resetAt > now && row.count >= limit);
}

export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

export async function purgeExpiredRateLimits(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
  return count;
}
