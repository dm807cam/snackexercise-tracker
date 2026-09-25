import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { renderMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * GET /api/internal/metrics — Prometheus exposition, for whoever runs the
 * instance. Off (a 404) unless METRICS_TOKEN is set, and then only with
 * `Authorization: Bearer <METRICS_TOKEN>`. No per-user figures: counts of
 * accounts and devices, never who.
 */
export async function GET(request: NextRequest) {
  const expected = config.metricsToken;
  if (!expected) return apiError("Not found", 404);
  const given = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!given || !sameSecret(given, expected)) {
    return apiError("Unauthorized", 401, undefined, { "www-authenticate": 'Bearer realm="metrics"' });
  }

  const now = new Date();
  const [members, admins, disabled, sessions, subscriptions, nudgesOn, liveTokens] = await Promise.all([
    prisma.user.count({ where: { role: "member", disabledAt: null } }),
    prisma.user.count({ where: { role: "admin", disabledAt: null } }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.pushSubscription.count(),
    prisma.setting.count({ where: { key: "nudges", value: "on" } }),
    prisma.apiToken.count({ where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
  ]);

  const body = renderMetrics([
    { name: "snack_accounts", help: "Accounts that can sign in, by role.", value: members, labels: { role: "member" } },
    { name: "snack_accounts", help: "Accounts that can sign in, by role.", value: admins, labels: { role: "admin" } },
    { name: "snack_accounts_disabled", help: "Disabled accounts.", value: disabled },
    { name: "snack_sessions_active", help: "Unexpired sign-ins.", value: sessions },
    { name: "snack_push_subscriptions", help: "Devices subscribed to nudges.", value: subscriptions },
    { name: "snack_nudges_enabled_accounts", help: "Accounts with nudges switched on.", value: nudgesOn },
    { name: "snack_api_tokens_active", help: "API tokens neither revoked nor expired.", value: liveTokens },
    { name: "snack_process_uptime_seconds", help: "Seconds since this process started.", value: Math.round(process.uptime()) },
  ]);
  return new NextResponse(body, {
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" },
  });
}
