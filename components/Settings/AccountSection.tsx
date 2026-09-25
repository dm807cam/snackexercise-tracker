"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Section, inputStyle } from "./ui";

interface SessionRow {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
}

/** "Safari on iPhone", "Chrome on Android" — enough to recognise a device, no more. */
function deviceName(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "A browser";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iPhone or iPad"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "Mac"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "another system";
  return `${browser} on ${os}`;
}

function when(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export function AccountSection({
  user,
  onToast,
}: {
  user: { email: string; name: string | null; role: string };
  onToast: (message: string, tone?: "error") => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadSessions() {
    try {
      const { sessions } = await api<{ sessions: SessionRow[] }>("/api/me/sessions");
      setSessions(sessions);
    } catch (error) {
      onToast((error as Error).message, "error");
    }
  }

  useEffect(() => {
    void loadSessions();
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

  const emailChanged = email.trim().toLowerCase() !== user.email;

  return (
    <Section title="Account" id="account">
      <Field label="Name" htmlFor="account-name">
        <input
          id="account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() =>
            name.trim() !== (user.name ?? "") &&
            run(async () => {
              await api("/api/me", { method: "PATCH", body: JSON.stringify({ name: name.trim() || null }) });
              onToast("Saved");
              router.refresh();
            })
          }
          autoComplete="name"
          className="w-full rounded-lg px-3 py-3 text-base"
          style={inputStyle}
        />
      </Field>

      <Field label="Email" htmlFor="account-email" hint="What you sign in with.">
        <input
          id="account-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="w-full rounded-lg px-3 py-3 text-base"
          style={inputStyle}
        />
        {emailChanged && (
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Current password"
              aria-label="Current password, to change your email"
              autoComplete="current-password"
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-base"
              style={inputStyle}
            />
            <Button
              tone="primary"
              disabled={busy || !emailPassword}
              onClick={() =>
                run(async () => {
                  await api("/api/me", {
                    method: "PATCH",
                    body: JSON.stringify({ email: email.trim(), currentPassword: emailPassword }),
                  });
                  setEmailPassword("");
                  onToast("Email changed");
                  router.refresh();
                })
              }
            >
              Change
            </Button>
          </div>
        )}
      </Field>

      <Field label="Password" hint="Changing it signs you out everywhere else.">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const result = await api<{ otherSessionsEnded: number }>("/api/me/password", {
                method: "POST",
                body: JSON.stringify({ currentPassword: current, newPassword: next }),
              });
              setCurrent("");
              setNext("");
              onToast(
                result.otherSessionsEnded > 0
                  ? `Password changed; ${result.otherSessionsEnded} other ${result.otherSessionsEnded === 1 ? "device" : "devices"} signed out`
                  : "Password changed",
              );
              void loadSessions();
            });
          }}
        >
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            aria-label="Current password"
            autoComplete="current-password"
            className="rounded-lg px-3 py-3 text-base"
            style={inputStyle}
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password (10 characters or more)"
            aria-label="New password"
            autoComplete="new-password"
            className="rounded-lg px-3 py-3 text-base"
            style={inputStyle}
          />
          <Button type="submit" tone="primary" disabled={busy || !current || next.length < 10}>
            Change password
          </Button>
        </form>
      </Field>

      <Field label="Signed in on">
        {sessions === null ? (
          <p className="text-sm text-dim">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">
                    {deviceName(session.userAgent)}
                    {session.current && <span className="text-dim"> · this device</span>}
                  </span>
                  <span className="block text-xs text-dim">last used {when(session.lastSeenAt)}</span>
                </span>
                {!session.current && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(`/api/me/sessions/${session.id}`, { method: "DELETE" });
                        await loadSessions();
                      })
                    }
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {sessions && sessions.length > 1 && (
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { ended } = await api<{ ended: number }>("/api/me/sessions", { method: "DELETE" });
                  onToast(`Signed out of ${ended} other ${ended === 1 ? "device" : "devices"}`);
                  await loadSessions();
                })
              }
            >
              Sign out everywhere else
            </Button>
          )}
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/api/auth/logout", { method: "POST" });
                router.replace("/login");
                router.refresh();
              })
            }
          >
            Sign out
          </Button>
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="tap inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold"
              style={inputStyle}
            >
              Administration
            </Link>
          )}
        </div>
      </Field>

      <Field
        label="Delete account"
        hint="Removes the account and everything in it — entries, days, places, snacks. Export your data first; this cannot be undone."
      >
        {!deleting ? (
          <Button tone="danger" onClick={() => setDeleting(true)}>
            Delete my account…
          </Button>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Password to confirm"
              aria-label="Password to confirm deleting your account"
              autoComplete="current-password"
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-base"
              style={inputStyle}
            />
            <Button
              tone="danger"
              disabled={busy || !deletePassword}
              onClick={() =>
                run(async () => {
                  await api("/api/me", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) });
                  router.replace("/login");
                  router.refresh();
                })
              }
            >
              Delete
            </Button>
          </div>
        )}
      </Field>
    </Section>
  );
}
