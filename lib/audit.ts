/**
 * The audit log: who did what to which account, and when.
 *
 * Security-relevant events only — sign-ins, credentials, account changes,
 * administration, bulk exports and imports. Not the training log: logging a
 * set of push-ups is the product, not an event anybody needs to investigate.
 *
 * Writing an audit event never fails the request that caused it. A lost audit
 * row is logged loudly instead; a user locked out because the audit table was
 * busy would be the wrong trade.
 */

import { prisma } from "./db";
import { log } from "./logger";
import { clientIp, userAgent } from "./request-info";

export type AuditAction =
  | "auth.setup"
  | "auth.login"
  | "auth.login_failed"
  | "auth.login_throttled"
  | "auth.logout"
  | "auth.signup"
  | "auth.password_changed"
  | "auth.password_reset"
  | "auth.sessions_revoked"
  | "token.created"
  | "token.revoked"
  | "account.updated"
  | "account.deleted"
  | "account.exported"
  | "account.imported"
  | "admin.invite_created"
  | "admin.reset_link_created"
  | "admin.user_updated"
  | "admin.user_deleted"
  | "admin.settings_updated"
  | "admin.catalogue_updated";

export async function audit(
  action: AuditAction,
  options: {
    actorId?: string | null;
    targetId?: string | null;
    request?: Request;
    detail?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const { actorId = null, targetId = null, request, detail } = options;
  try {
    await prisma.auditEvent.create({
      data: {
        action,
        actorId,
        targetId,
        ip: request ? clientIp(request.headers) : null,
        userAgent: request ? userAgent(request.headers) : null,
        detail: detail ? JSON.stringify(detail).slice(0, 2000) : null,
      },
    });
  } catch (error) {
    log.error("audit event could not be written", { action, actorId, targetId, error });
  }
  log.info("audit", { action, actorId, targetId });
}

export async function purgeOldAuditEvents(retentionDays: number, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const { count } = await prisma.auditEvent.deleteMany({ where: { at: { lt: cutoff } } });
  return count;
}
