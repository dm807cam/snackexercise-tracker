"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { SCOPES, type Scope } from "@/lib/auth/scopes";
import { Button, Field, Section, inputStyle } from "./ui";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface Issued {
  token: string;
  name: string;
  scopes: Scope[];
}

const EXPIRY_OPTIONS = [
  { days: 0, label: "Until I revoke it" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "A year" },
];

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tokens for everything that is not a person at a browser: an iOS Shortcut
 * posting steps at 23:50, a calendar app subscribing to the snack plan, a
 * script. Each gets only the scopes it needs and can be revoked on its own,
 * so nothing ever needs the account password.
 */
export function TokensSection({ onToast }: { onToast: (message: string, tone?: "error") => void }) {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<Scope>>(new Set(["read", "metrics:write"]));
  const [expiry, setExpiry] = useState(0);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  async function load() {
    try {
      const result = await api<{ tokens: TokenRow[] }>("/api/me/tokens");
      setTokens(result.tokens);
    } catch (error) {
      onToast((error as Error).message, "error");
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onToast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const issue = (tokenName: string, tokenScopes: Scope[], expiresInDays?: number) =>
    run(async () => {
      const result = await api<Issued>("/api/me/tokens", {
        method: "POST",
        body: JSON.stringify({ name: tokenName, scopes: tokenScopes, ...(expiresInDays ? { expiresInDays } : {}) }),
      });
      setIssued(result);
      setName("");
      await load();
    });

  const calendarUrl = issued ? `${origin}/api/calendar/feed?token=${issued.token}` : "";
  const isCalendar = issued?.scopes.length === 1 && issued.scopes[0] === "calendar:read";

  return (
    <Section title="Apps and automations" id="tokens">
      <p className="text-xs text-dim">
        A token lets a Shortcut, a script or a calendar app use your account without your password. Give each one only
        what it needs; revoke it here and it stops working at once.
      </p>

      {issued && (
        <div className="flex flex-col gap-2 rounded-lg p-3" style={{ ...inputStyle, borderColor: "var(--accent)" }}>
          <p className="text-sm font-medium">
            {isCalendar ? "Your snack calendar" : `“${issued.name}” — copy it now`}
          </p>
          <p className="text-xs text-dim">
            {isCalendar
              ? "Subscribe to this address in Apple Calendar, Google Calendar or Outlook. It shows the week's planned snacks and nothing else."
              : "This is the only time the token is shown; only a fingerprint of it is kept."}
          </p>
          <code
            className="block break-all rounded-md px-2 py-2 text-xs"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {isCalendar ? calendarUrl : issued.token}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              tone="primary"
              onClick={async () =>
                onToast((await copy(isCalendar ? calendarUrl : issued.token)) ? "Copied" : "Copy it by hand", undefined)
              }
            >
              Copy
            </Button>
            {isCalendar && (
              <a
                href={calendarUrl.replace(/^https?:/, "webcal:")}
                className="tap inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold"
                style={inputStyle}
              >
                Open in calendar
              </a>
            )}
            <Button onClick={() => setIssued(null)}>Done</Button>
          </div>
          {!isCalendar && (
            <p className="text-xs text-dim">
              Send it as a header: <code>Authorization: Bearer {issued.token.slice(0, 8)}…</code>. For steps from an iOS
              Shortcut, add that header to the <strong>Get Contents of URL</strong> action that PUTs to{" "}
              <code>{origin}/api/metrics/&lt;date&gt;</code>.
            </p>
          )}
        </div>
      )}

      <Field
        label="Snack plan in your calendar"
        hint="See the day's planned snacks next to your meetings. Issues a token that can read planned snack times and nothing else."
      >
        <Button disabled={busy} onClick={() => issue("Calendar feed", ["calendar:read"])}>
          Get a calendar link
        </Button>
      </Field>

      <Field label="Your tokens">
        {tokens === null ? (
          <p className="text-sm text-dim">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-dim">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-sm">
                  <span className="block truncate">
                    {token.name} <code className="text-xs text-dim">{token.prefix}…</code>
                  </span>
                  <span className="block text-xs text-dim">
                    {token.scopes.join(", ")} ·{" "}
                    {token.lastUsedAt ? `last used ${day(token.lastUsedAt)}` : "never used"}
                    {token.expiresAt ? ` · until ${day(token.expiresAt)}` : ""}
                  </span>
                </span>
                <Button
                  tone="danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api(`/api/me/tokens/${token.id}`, { method: "DELETE" });
                      await load();
                      onToast(`${token.name} revoked`);
                    })
                  }
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="New token">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const expiresInDays = expiry || undefined;
            void issue(name.trim(), [...scopes], expiresInDays);
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What it is for, e.g. Steps Shortcut"
            aria-label="Token name"
            maxLength={60}
            className="rounded-lg px-3 py-3 text-base"
            style={inputStyle}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-dim">It may</legend>
            {(Object.keys(SCOPES) as Scope[]).map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.has(scope)}
                  onChange={(e) =>
                    setScopes((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(scope);
                      else next.delete(scope);
                      return next;
                    })
                  }
                  className="h-5 w-5"
                  style={{ accentColor: "var(--accent)" }}
                />
                {SCOPES[scope]}
              </label>
            ))}
          </fieldset>
          <select
            value={expiry}
            onChange={(e) => setExpiry(Number(e.target.value))}
            aria-label="Expires"
            className="rounded-lg px-3 py-3 text-base"
            style={inputStyle}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="submit" tone="primary" disabled={busy || !name.trim() || scopes.size === 0}>
            Create token
          </Button>
        </form>
      </Field>
    </Section>
  );
}
