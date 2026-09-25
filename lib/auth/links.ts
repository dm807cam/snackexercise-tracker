/**
 * One-time links: invitations and password resets.
 *
 * The app has no mail server and does not want one — it is a container on
 * somebody's shelf. So an admin creates the link and hands it over however they
 * like, and the link carries the whole credential: 32 random bytes, stored only
 * as a hash, spent on first use, and dead after a few days either way.
 */

import { prisma, type TransactionClient } from "../db";
import { hashToken, randomToken } from "./tokens";

export type LinkPurpose = "invite" | "reset";

export const LINK_TTL_HOURS: Record<LinkPurpose, number> = {
  // Long enough to reach someone over a weekend.
  invite: 7 * 24,
  // Short: a reset link is a password, and it may sit in a chat history.
  reset: 24,
};

export async function issueLink(input: {
  purpose: LinkPurpose;
  email?: string | null;
  userId?: string | null;
  role?: "admin" | "member";
  createdById?: string | null;
}): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS[input.purpose] * 3_600_000);

  // A new reset link supersedes any earlier one for the same account.
  if (input.purpose === "reset" && input.userId) {
    await prisma.authLink.deleteMany({ where: { purpose: "reset", userId: input.userId, usedAt: null } });
  }

  const link = await prisma.authLink.create({
    data: {
      purpose: input.purpose,
      tokenHash: hashToken(token),
      email: input.email ?? null,
      userId: input.userId ?? null,
      role: input.role ?? "member",
      createdById: input.createdById ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt, id: link.id };
}

/** A live link, without spending it — for showing the form it opens. */
export async function peekLink(token: string, purpose: LinkPurpose, now: Date = new Date()) {
  if (!token || token.length > 100) return null;
  const link = await prisma.authLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link || link.purpose !== purpose || link.usedAt || link.expiresAt <= now) return null;
  return link;
}

/**
 * Spend a link inside the caller's transaction. The conditional update is the
 * guard: of two requests racing with the same link, exactly one sees count 1.
 */
export async function consumeLink(
  tx: TransactionClient,
  token: string,
  purpose: LinkPurpose,
  now: Date = new Date(),
) {
  const tokenHash = hashToken(token);
  const { count } = await tx.authLink.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) return null;
  return tx.authLink.findUnique({ where: { tokenHash } });
}

export async function purgeStaleLinks(now: Date = new Date()): Promise<number> {
  // Kept a week past expiry or use, so "this link was already used" can still
  // be told apart from "this link never existed" for a while.
  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  const { count } = await prisma.authLink.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
  });
  return count;
}
