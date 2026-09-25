/**
 * Structured logs: one JSON object per line on stdout (errors on stderr), which
 * is what `docker logs`, Loki, CloudWatch and every other collector already
 * know how to read. No dependency — the whole contract is JSON.stringify.
 *
 * Never log a credential. Callers pass ids and counts, not tokens, passwords,
 * cookies or API keys, and `redact` below catches the obvious field names if
 * one slips into a context object anyway.
 */

import { config } from "./config";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEYS =
  /^(password|passwordHash|token|tokenHash|secret|cookie|authorization|apiKey|api_key|openrouterKey|p256dh|auth|setupToken|privateKey)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value !== "object") return value;
  if (depth > 4) return "[deep]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SECRET_KEYS.test(key) ? "[redacted]" : redact(inner, depth + 1);
  }
  return out;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[config.logLevel]) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};

export { redact as redactForLog };
