import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * The newest migration this build ships, read from the migrations folder the
 * container applies at start-up. Null when the folder is not there to read, in
 * which case the check falls back to "nothing failed".
 */
async function newestShippedMigration(): Promise<string | null> {
  try {
    const entries = await readdir(path.join(process.cwd(), "prisma", "migrations"), { withFileTypes: true });
    const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return names.at(-1) ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/ready — readiness. Up is not the same as ready to serve: the
 * database must be migrated to the schema this build expects, no migration may
 * have failed half-way, and the shared catalogue must be seeded, or every page
 * that proposes a snack has nothing to propose. A load balancer should send
 * traffic only once this says yes.
 */
export async function GET() {
  const checks: Record<string, boolean> = { database: false, migrations: false, catalogue: false };
  let catalogue = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;

    const failed = await prisma.$queryRaw<{ n: bigint | number }[]>`
      SELECT COUNT(*) AS n FROM _prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
    `;
    const newest = await newestShippedMigration();
    const applied = newest
      ? await prisma.$queryRaw<{ n: bigint | number }[]>`
          SELECT COUNT(*) AS n FROM _prisma_migrations
          WHERE migration_name = ${newest} AND finished_at IS NOT NULL
        `
      : [{ n: 1 }];
    checks.migrations = Number(failed[0]?.n ?? 0) === 0 && Number(applied[0]?.n ?? 0) > 0;

    catalogue = await prisma.exercise.count({ where: { ownerId: null, archived: false } });
    checks.catalogue = catalogue > 0;
  } catch (error) {
    log.warn("readiness check failed", { error });
  }

  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { ok, checks, catalogue },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
