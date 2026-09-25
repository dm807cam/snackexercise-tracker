import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Journal mode for the database file.
 *
 * WAL by default: readers stop blocking the writer, which matters as soon as
 * more than one person uses the app and the nudge scheduler writes alongside
 * their requests. But WAL needs shared memory next to the file and is unsafe on
 * a network filesystem, and the README suggests a NAS as one place to keep the
 * data — so SQLITE_JOURNAL_MODE=DELETE is the escape hatch for an NFS or SMB
 * mount.
 */
function journalMode(): "WAL" | "DELETE" {
  return process.env.SQLITE_JOURNAL_MODE?.toUpperCase() === "DELETE" ? "DELETE" : "WAL";
}

/**
 * Applied to the connection before its first query.
 *
 * `synchronous = NORMAL` is the documented pairing for WAL: durable against an
 * application crash, and at worst loses the last few commits on power loss —
 * never corrupts. `foreign_keys` is better-sqlite3's default already; it is
 * stated because deleting an account relies on the cascade it enables.
 */
function pragmas(): string {
  const mode = journalMode();
  return [
    `PRAGMA journal_mode = ${mode}`,
    `PRAGMA synchronous = ${mode === "WAL" ? "NORMAL" : "FULL"}`,
    "PRAGMA foreign_keys = ON",
    "PRAGMA busy_timeout = 5000",
  ].join(";\n");
}

class TunedSqlite extends PrismaBetterSqlite3 {
  override async connect() {
    const adapter = await super.connect();
    await adapter.executeScript(pragmas());
    return adapter;
  }
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "file:./dev.db";
}

export function createPrismaClient(url: string = databaseUrl()): PrismaClient {
  return new PrismaClient({ adapter: new TunedSqlite({ url }) });
}

// Next.js dev mode re-evaluates modules on every hot reload; without caching on
// globalThis each reload would open another SQLite handle.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaTx?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

/**
 * A SECOND connection, used only for interactive transactions.
 *
 * The better-sqlite3 adapter runs every query of a client on one connection,
 * and only transactions take its mutex. So while one request is inside a
 * transaction, another request's plain query executes on the same connection
 * INSIDE that transaction — its write becomes part of somebody else's unit of
 * work, and vanishes if that transaction rolls back.
 *
 * With transactions on their own connection, SQLite's locking does the job it
 * exists for: a plain write waits (busy_timeout) for the transaction to
 * commit, and a plain read sees only committed data. The adapter's mutex still
 * runs this connection's transactions one at a time.
 */
const transactionClient = globalForPrisma.prismaTx ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaTx = transactionClient;
}

export type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Run `fn` as one transaction. The ONLY way this codebase opens one — never
 * `prisma.$transaction`, for the reason above.
 *
 * Inside `fn`, write through `tx`. A write through the shared `prisma` client
 * would wait for this very transaction to finish, and time out.
 */
export function transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return transactionClient.$transaction(fn, { maxWait: 10_000, timeout: 15_000 });
}

export async function disconnectDatabase(): Promise<void> {
  await Promise.all([prisma.$disconnect(), transactionClient.$disconnect()]);
}
