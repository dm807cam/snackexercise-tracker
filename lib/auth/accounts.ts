/**
 * Creating accounts, and the one-time claiming of a database that predates
 * them. Database logic only — no request, no cookies — so the seed can run the
 * same first-admin path unattended that /setup runs interactively.
 */

import { z } from "zod";
import { prisma, transaction, type TransactionClient } from "../db";
import type { PrismaClient, User } from "../../generated/prisma/client";
import { DEFAULT_CONTEXT_KINDS, presetRow } from "../snack/contexts";
import { hashPassword, passwordProblem } from "./password";

/**
 * The account migration 20260925090000 creates to own a database that already
 * held somebody's log. It has no password until /setup claims it.
 */
export const LEGACY_OWNER_ID = "legacy-owner";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Enter a valid email address" }));

export const nameSchema = z.string().trim().min(1).max(80);

export class AccountError extends Error {
  constructor(
    message: string,
    readonly code: "already-set-up" | "email-taken" | "weak-password" | "not-found" | "last-admin",
    readonly status = 400,
  ) {
    super(message);
  }
}

type Db = PrismaClient | TransactionClient;

/** True until an enabled admin with a password exists. */
export async function needsSetup(db: Db = prisma): Promise<boolean> {
  const admin = await db.user.findFirst({
    where: { role: "admin", passwordHash: { not: null }, disabledAt: null },
    select: { id: true },
  });
  return admin === null;
}

/**
 * What a new account starts with: the four places a travelling worker spends a
 * week, with Home active. Idempotent, so claiming the legacy owner — which has
 * a history but no places — gets them too.
 */
export async function provisionAccount(db: Db, userId: string): Promise<void> {
  const existing = await db.trainingContext.count({ where: { userId } });
  if (existing > 0) return;

  const created = [];
  for (const [index, kind] of DEFAULT_CONTEXT_KINDS.entries()) {
    created.push(await db.trainingContext.create({ data: { userId, ...presetRow(kind, index) } }));
  }
  await db.setting.upsert({
    where: { userId_key: { userId, key: "activeContextId" } },
    create: { userId, key: "activeContextId", value: created[0].id },
    update: {},
  });
}

function checkPassword(password: string, email: string, name?: string | null) {
  const problem = passwordProblem(password, { email, name: name ?? undefined });
  if (problem) throw new AccountError(problem, "weak-password");
}

/**
 * The first admin. Claims the legacy owner when there is one waiting, so
 * whoever installed the app keeps the history they logged before accounts
 * existed; otherwise creates a fresh account.
 *
 * Re-checks `needsSetup` inside the transaction: two browsers racing through
 * /setup must not both end up admins.
 */
export async function createFirstAdmin(input: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<{ user: User; claimedLegacy: boolean }> {
  const email = emailSchema.parse(input.email);
  checkPassword(input.password, email, input.name);
  const passwordHash = await hashPassword(input.password);

  return transaction(async (tx) => {
    if (!(await needsSetup(tx))) {
      throw new AccountError("This instance already has an administrator.", "already-set-up", 409);
    }

    const legacy = await tx.user.findUnique({ where: { id: LEGACY_OWNER_ID } });
    const clash = await tx.user.findUnique({ where: { email } });

    let user: User;
    let claimedLegacy = false;
    if (legacy && legacy.passwordHash === null) {
      if (clash && clash.id !== legacy.id) {
        throw new AccountError("That address already belongs to an account.", "email-taken", 409);
      }
      user = await tx.user.update({
        where: { id: legacy.id },
        data: { email, name: input.name ?? null, passwordHash, role: "admin", disabledAt: null },
      });
      claimedLegacy = true;
    } else if (clash) {
      // An account with this address exists but no usable admin does — every
      // admin was disabled, say. Setup does not hand out someone else's
      // account; an operator restores access with the reset command instead.
      throw new AccountError("That address already belongs to an account.", "email-taken", 409);
    } else {
      user = await tx.user.create({
        data: { email, name: input.name ?? null, passwordHash, role: "admin" },
      });
    }

    await provisionAccount(tx, user.id);
    return { user, claimedLegacy };
  });
}

export interface PreparedAccount {
  email: string;
  name: string | null;
  passwordHash: string;
  role: "admin" | "member";
}

/**
 * Validate and hash, OUTSIDE any transaction: scrypt takes a tenth of a second
 * on purpose, and SQLite holds its write lock for the whole of a transaction.
 */
export async function prepareAccount(input: {
  email: string;
  password: string;
  name?: string | null;
  role?: "admin" | "member";
}): Promise<PreparedAccount> {
  const email = emailSchema.parse(input.email);
  checkPassword(input.password, email, input.name);
  return {
    email,
    name: input.name ?? null,
    passwordHash: await hashPassword(input.password),
    role: input.role ?? "member",
  };
}

export async function insertAccount(db: Db, account: PreparedAccount): Promise<User> {
  const clash = await db.user.findUnique({ where: { email: account.email }, select: { id: true } });
  if (clash) throw new AccountError("That address already belongs to an account.", "email-taken", 409);

  const user = await db.user.create({ data: account });
  await provisionAccount(db, user.id);
  return user;
}

/** An ordinary account, from an invitation or open registration. */
export async function createAccount(
  input: { email: string; password: string; name?: string | null; role?: "admin" | "member" },
  db: Db = prisma,
): Promise<User> {
  return insertAccount(db, await prepareAccount(input));
}

/**
 * Whether removing admin rights from (or deleting, or disabling) this account
 * would leave the instance with nobody able to administer it.
 */
export async function isLastAdmin(userId: string, db: Db = prisma): Promise<boolean> {
  const others = await db.user.count({
    where: { role: "admin", disabledAt: null, passwordHash: { not: null }, id: { not: userId } },
  });
  return others === 0;
}
