/**
 * Everything the server reads from its environment, read in one place.
 *
 * Every variable is optional: the container starts with none of them set and
 * does the sensible thing for a single box on a home network. Each one exists
 * because some deployment needs it — a reverse proxy, a public hostname, an
 * unattended first boot — and the README says which.
 */

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (value == null || value === "" || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function origin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export type RegistrationMode = "closed" | "invite" | "open";

export function registrationFromEnv(value: string | undefined): RegistrationMode | null {
  return value === "closed" || value === "invite" || value === "open" ? value : null;
}

export const config = {
  /**
   * The address people reach the app at, e.g. https://snacks.example.com.
   * Used for links in invitations, for the push-notification contact, and as
   * the origin state-changing requests must come from. Unset, the app trusts
   * the Host header it is reached by, which is right on a LAN.
   */
  get appUrl(): URL | null {
    return origin(process.env.APP_URL);
  },

  /**
   * Whether cookies carry the Secure flag. Defaults to "whenever the request
   * arrived over HTTPS", which a reverse proxy reports via X-Forwarded-Proto.
   * Forced on when APP_URL is https.
   */
  get cookieSecure(): boolean | null {
    const explicit = process.env.COOKIE_SECURE;
    if (explicit != null && explicit !== "") return flag(explicit, false);
    return this.appUrl?.protocol === "https:" ? true : null;
  },

  /** Days a sign-in lasts without being used. */
  get sessionTtlDays(): number {
    return int(process.env.SESSION_TTL_DAYS, 30, 1, 365);
  },

  /**
   * How many reverse proxies sit in front of the app. Decides which
   * X-Forwarded-For entry is the client: the one the outermost trusted proxy
   * appended. See lib/request-info.ts.
   */
  get trustProxyHops(): number {
    return int(process.env.TRUST_PROXY, 1, 0, 5);
  },

  /** closed | invite | open. A stored admin setting overrides this default. */
  get registration(): RegistrationMode {
    return registrationFromEnv(process.env.REGISTRATION) ?? "invite";
  },

  /** An unattended first boot: create (or claim) the first admin from these. */
  get bootstrapAdmin(): { email: string; password: string; name: string | null } | null {
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return null;
    return { email, password, name: process.env.ADMIN_NAME?.trim() || null };
  },

  /**
   * If set, /setup asks for it. Closes the window in which whoever reaches a
   * fresh instance first becomes its admin.
   */
  get setupToken(): string | null {
    return process.env.SETUP_TOKEN?.trim() || null;
  },

  /** A bearer token for /api/internal/metrics. Unset, the endpoint is off. */
  get metricsToken(): string | null {
    return process.env.METRICS_TOKEN?.trim() || null;
  },

  /** Whether this process runs the nudge scheduler and housekeeping. */
  get schedulerEnabled(): boolean {
    return flag(process.env.SCHEDULER, process.env.NODE_ENV === "production");
  },

  get logLevel(): "debug" | "info" | "warn" | "error" {
    const level = process.env.LOG_LEVEL?.toLowerCase();
    return level === "debug" || level === "warn" || level === "error" ? level : "info";
  },

  /** Days the audit log is kept. */
  get auditRetentionDays(): number {
    return int(process.env.AUDIT_RETENTION_DAYS, 365, 7, 3650);
  },

  get vapid(): { publicKey: string; privateKey: string } | null {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  },

  get vapidSubject(): string | null {
    return process.env.VAPID_SUBJECT?.trim() || null;
  },

  /** The zone a new account starts in, until its owner says otherwise. */
  get defaultTimeZone(): string {
    return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  },
};
