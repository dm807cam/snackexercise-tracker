import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** An event id; returns what came before it. */
  before: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(60).optional(),
});

/** GET /api/admin/audit — the audit log, newest first. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await authenticate(request, { sessionOnly: true, admin: true });
    const params = request.nextUrl.searchParams;
    const { before, limit, action } = querySchema.parse({
      before: params.get("before") ?? undefined,
      limit: params.get("limit") ?? undefined,
      action: params.get("action") ?? undefined,
    });

    const cursor = before ? await prisma.auditEvent.findUnique({ where: { id: before }, select: { at: true } }) : null;
    const events = await prisma.auditEvent.findMany({
      where: {
        ...(action ? { action: { startsWith: action } } : {}),
        ...(cursor ? { OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: before } }] } : {}),
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit,
    });

    // Names beside ids, where the account still exists.
    const ids = [...new Set(events.flatMap((e) => [e.actorId, e.targetId]).filter((v): v is string => Boolean(v)))];
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    return {
      events: events.map((e) => ({
        ...e,
        detail: e.detail ? safeJson(e.detail) : null,
        actorEmail: e.actorId ? (emailById.get(e.actorId) ?? null) : null,
        targetEmail: e.targetId ? (emailById.get(e.targetId) ?? null) : null,
      })),
      next: events.length === limit ? events[events.length - 1].id : null,
    };
  });
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
