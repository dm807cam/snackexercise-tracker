import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness. Is the process up, and can it reach its database?
 *
 * Deliberately says nothing about WHY when the answer is no: this endpoint is
 * unauthenticated, and a database error message is a map of the deployment.
 * The reason is in the logs.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
