import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { putSetting } from "@/lib/queries";
import { userAgent } from "@/lib/request-info";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000).refine((url) => url.startsWith("https://"), { message: "Push endpoints are https" }),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** GET /api/push/subscriptions — how many devices will receive nudges. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const devices = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastSuccessAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { devices };
  });
}

/**
 * POST /api/push/subscriptions — this browser wants nudges. Turning nudges on
 * from a device is also what switches them on for the account.
 *
 * A device belongs to whoever subscribed it last: two people sharing a tablet
 * must not keep receiving each other's nudges.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const { endpoint, keys } = subscriptionSchema.parse(await request.json());
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent(request.headers) },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent(request.headers), failures: 0 },
    });
    await putSetting(user.id, "nudges", "on");
    return { ok: true };
  });
}

/** DELETE /api/push/subscriptions — `{ endpoint }`: this browser no longer wants them. */
export async function DELETE(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await request.json());
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
    const left = await prisma.pushSubscription.count({ where: { userId: user.id } });
    if (left === 0) await putSetting(user.id, "nudges", "off");
    return { ok: true, devices: left };
  });
}
