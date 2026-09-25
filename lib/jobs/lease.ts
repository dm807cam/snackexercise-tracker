/**
 * Leases on background jobs, so that however many replicas run, each job runs
 * on one of them at a time.
 *
 * A lease is a row: whoever holds it until `expiresAt` runs the job. Taking an
 * expired lease is one conditional UPDATE, which SQLite serialises, so two
 * replicas finding it expired cannot both take it; the loser's update matches
 * nothing. The nudge job does not rely on this alone — every nudge is also
 * guarded by a unique key — but the lease saves doing the work twice.
 */

import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";

export const HOLDER = `${hostname()}:${process.pid}:${randomBytes(4).toString("hex")}`;

export async function acquireLease(name: string, ttlMs: number, now: Date = new Date(), holder = HOLDER): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + ttlMs);
  const { count } = await prisma.jobLease.updateMany({
    where: { name, OR: [{ expiresAt: { lt: now } }, { holder }] },
    data: { holder, expiresAt },
  });
  if (count === 1) return true;
  try {
    await prisma.jobLease.create({ data: { name, holder, expiresAt } });
    return true;
  } catch {
    // Somebody else holds it, or created it a moment before us.
    return false;
  }
}

export async function releaseLease(name: string, holder = HOLDER): Promise<void> {
  await prisma.jobLease.deleteMany({ where: { name, holder } });
}
