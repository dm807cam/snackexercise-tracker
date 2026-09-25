/**
 * Web Push: how a nudge reaches a phone in someone's pocket.
 *
 * Standard VAPID-signed, end-to-end encrypted Web Push (RFC 8030, 8291, 8292),
 * the same thing every browser's push service speaks — Apple's for a Home
 * Screen app on iOS 16.4 and later, Google's for Chrome and Android, Mozilla's
 * for Firefox. The payload is encrypted to the subscribing browser; the push
 * service carries it without being able to read it.
 *
 * The keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when an operator
 * wants to manage them, and are otherwise generated on first use and kept in
 * the database — so push works on a fresh container with nothing configured,
 * and keeps working across restarts, which matters: new keys would silently
 * orphan every existing subscription.
 */

import webpush from "web-push";
import { prisma } from "./db";
import { config } from "./config";
import { log } from "./logger";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: VapidKeys | null = null;

export async function vapidKeys(): Promise<VapidKeys> {
  if (cached) return cached;
  const fromEnv = config.vapid;
  if (fromEnv) return (cached = fromEnv);

  const stored = await prisma.instanceSetting.findUnique({ where: { key: "vapid" } });
  if (stored) return (cached = JSON.parse(stored.value) as VapidKeys);

  // First use. The pair is one row, so of two replicas racing here exactly one
  // insert succeeds and the other reads the winner's keys back.
  const generated = webpush.generateVAPIDKeys();
  try {
    await prisma.instanceSetting.create({ data: { key: "vapid", value: JSON.stringify(generated) } });
    log.info("generated Web Push (VAPID) keys");
    return (cached = generated);
  } catch {
    const winner = await prisma.instanceSetting.findUniqueOrThrow({ where: { key: "vapid" } });
    return (cached = JSON.parse(winner.value) as VapidKeys);
  }
}

/**
 * Who push services should contact about this sender. They require a mailto:
 * or https: address; Apple rejects anything else.
 */
async function vapidSubject(): Promise<string> {
  if (config.vapidSubject) return config.vapidSubject;
  const appUrl = config.appUrl;
  if (appUrl?.protocol === "https:") return appUrl.origin;
  const admin = await prisma.user.findFirst({
    where: { role: "admin", disabledAt: null, passwordHash: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return `mailto:${admin?.email ?? "admin@example.invalid"}`;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping it goes. */
  url: string;
  /** Replaces an earlier notification with the same tag rather than stacking. */
  tag: string;
  snackId?: string;
}

/** A subscription is given up on after this many consecutive failures. */
const MAX_FAILURES = 5;

/**
 * Send to every device the user has subscribed. Returns how many accepted it.
 * Subscriptions the push service says are gone (404, 410) are deleted; others
 * that keep failing are deleted after a few tries.
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return 0;

  const keys = await vapidKeys();
  const subject = await vapidSubject();
  const body = JSON.stringify(payload);
  let delivered = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        {
          vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          // A nudge is worth nothing an hour late.
          TTL: 15 * 60,
          urgency: "normal",
          timeout: 10_000,
          ...(process.env.HTTPS_PROXY ? { proxy: process.env.HTTPS_PROXY } : {}),
        },
      );
      delivered += 1;
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSuccessAt: new Date(), failures: 0 },
      });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410 || sub.failures + 1 >= MAX_FAILURES) {
        await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
        log.info("push subscription removed", { userId, status, failures: sub.failures + 1 });
      } else {
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { failures: { increment: 1 } } });
        log.warn("push delivery failed", { userId, status, message: (error as Error).message });
      }
    }
  }
  return delivered;
}
