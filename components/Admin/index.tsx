"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Toast, type ToastState } from "@/components/Toast";
import { Button, Field, Section, Segmented, inputStyle } from "@/components/Settings/ui";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  canSignIn: boolean;
  entries: number;
  sessions: number;
  tokens: number;
}

interface InviteRow {
  id: string;
  email: string | null;
  role: string | null;
  createdAt: string;
  expiresAt: string;
}

interface AuditRow {
  id: string;
  at: string;
  action: string;
  actorEmail: string | null;
  targetEmail: string | null;
  ip: string | null;
  detail: unknown;
}

type Registration = "closed" | "invite" | "open";

const REGISTRATION_HINTS: Record<Registration, string> = {
  closed: "Nobody can sign up. New accounts come only from invitations you create here.",
  invite: "Anyone holding an invitation link can create an account. The usual choice.",
  open: "Anyone who can reach the app can create an account. Only sensible on a private network.",
};

function date(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A link to pass on by hand: the app sends no email. */
function LinkBox({ title, url, hint, onDone, onToast }: {
  title: string;
  url: string;
  hint: string;
  onDone: () => void;
  onToast: (message: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg p-3" style={{ ...inputStyle, borderColor: "var(--accent)" }}>
      <p className="text-sm font-medium">{title}</p>
      <code className="block break-all rounded-md px-2 py-2 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {url}
      </code>
      <p className="text-xs text-dim">{hint}</p>
      <div className="flex gap-2">
        <Button tone="primary" onClick={async () => onToast((await copy(url)) ? "Copied" : "Copy it by hand")}>
          Copy
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

/**
 * Running the instance. Deliberately no view into anybody's training: an
 * administrator sees accounts, counts and dates, never a log.
 */
export function AdminView({ currentUserId }: { currentUserId: string }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const onToast = useCallback((message: string, tone?: "error") => setToast({ message, ...(tone ? { tone } : {}) }), []);
  const [busy, setBusy] = useState(false);

  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [settings, setSettings] = useState<{
    registration: Registration;
    hasSharedOpenRouterKey: boolean;
    hasEnvOpenRouterKey: boolean;
  } | null>(null);
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [link, setLink] = useState<{ title: string; url: string; hint: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [sharedKey, setSharedKey] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadUsers = useCallback(async () => setUsers((await api<{ users: UserRow[] }>("/api/admin/users")).users), []);
  const loadInvites = useCallback(
    async () => setInvites((await api<{ invites: InviteRow[] }>("/api/admin/invites")).invites),
    [],
  );
  const loadAudit = useCallback(async (before?: string) => {
    const params = new URLSearchParams({ limit: "30", ...(before ? { before } : {}) });
    const result = await api<{ events: AuditRow[]; next: string | null }>(`/api/admin/audit?${params}`);
    setEvents((current) => (before ? [...current, ...result.events] : result.events));
    setNextCursor(result.next);
  }, []);

  useEffect(() => {
    Promise.all([
      loadUsers(),
      loadInvites(),
      loadAudit(),
      api<NonNullable<typeof settings>>("/api/admin/settings").then(setSettings),
    ]).catch((error: Error) => onToast(error.message, "error"));
  }, [loadUsers, loadInvites, loadAudit, onToast]);

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

  const patchUser = (id: string, patch: { role?: string; disabled?: boolean }, message: string) =>
    run(async () => {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await Promise.all([loadUsers(), loadAudit()]);
      onToast(message);
    });

  return (
    <div className="pb-6">
      <div className="flex items-baseline justify-between pt-4 pb-3">
        <h1 className="text-lg font-semibold">Administration</h1>
        <Link href="/settings" className="text-sm underline" style={{ color: "var(--accent)" }}>
          Settings
        </Link>
      </div>

      {link && (
        <div className="mb-4">
          <LinkBox {...link} onDone={() => setLink(null)} onToast={onToast} />
        </div>
      )}

      <Section title={`People${users ? ` (${users.length})` : ""}`} id="people">
        {users === null ? (
          <p className="text-sm text-dim">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {users.map((user) => {
              const self = user.id === currentUserId;
              return (
                <li key={user.id} className="flex flex-col gap-2 rounded-lg p-3" style={inputStyle}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {user.name ? `${user.name} · ` : ""}
                      {user.email}
                      {self && <span className="text-dim"> · you</span>}
                    </p>
                    <p className="text-xs text-dim">
                      {user.role === "admin" ? "Admin" : "Member"}
                      {user.disabledAt ? " · disabled" : ""}
                      {!user.canSignIn ? " · not yet claimed" : ""} · joined {date(user.createdAt)} · last sign-in{" "}
                      {date(user.lastLoginAt)}
                    </p>
                    <p className="text-xs text-dim">
                      {user.entries} {user.entries === 1 ? "entry" : "entries"} · {user.sessions} signed-in{" "}
                      {user.sessions === 1 ? "device" : "devices"} · {user.tokens} {user.tokens === 1 ? "token" : "tokens"}
                    </p>
                  </div>
                  {!self && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          patchUser(
                            user.id,
                            { role: user.role === "admin" ? "member" : "admin" },
                            user.role === "admin" ? `${user.email} is a member now` : `${user.email} is an admin now`,
                          )
                        }
                      >
                        {user.role === "admin" ? "Make member" : "Make admin"}
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          patchUser(
                            user.id,
                            { disabled: !user.disabledAt },
                            user.disabledAt ? `${user.email} can sign in again` : `${user.email} is disabled and signed out`,
                          )
                        }
                      >
                        {user.disabledAt ? "Enable" : "Disable"}
                      </Button>
                      {!user.disabledAt && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const result = await api<{ url: string; validHours: number }>(
                                `/api/admin/users/${user.id}/reset`,
                                { method: "POST" },
                              );
                              setLink({
                                title: `Password reset link for ${user.email}`,
                                url: result.url,
                                hint: `Works once, for ${result.validHours} hours. Send it to them yourself; it lets whoever holds it set a new password.`,
                              });
                              await loadAudit();
                            })
                          }
                        >
                          Reset link
                        </Button>
                      )}
                      {confirmDelete === user.id ? (
                        <>
                          <Button
                            tone="danger"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
                                setConfirmDelete(null);
                                await Promise.all([loadUsers(), loadAudit()]);
                                onToast(`${user.email} and all of their data deleted`);
                              })
                            }
                          >
                            Delete {user.entries} {user.entries === 1 ? "entry" : "entries"} and the account
                          </Button>
                          <Button onClick={() => setConfirmDelete(null)}>Keep</Button>
                        </>
                      ) : (
                        <Button tone="danger" disabled={busy} onClick={() => setConfirmDelete(user.id)}>
                          Delete…
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Invitations" id="invites">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const email = inviteEmail.trim();
              const result = await api<{ url: string; validHours: number }>("/api/admin/invites", {
                method: "POST",
                body: JSON.stringify({ role: inviteRole, ...(email ? { email } : {}) }),
              });
              setLink({
                title: email ? `Invitation for ${email}` : "Invitation",
                url: result.url,
                hint: `Works once, for ${result.validHours / 24} days${email ? `, and only for ${email}` : ""}. Send it yourself: the app sends no email.`,
              });
              setInviteEmail("");
              await Promise.all([loadInvites(), loadAudit()]);
            });
          }}
        >
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Their email (optional)"
            aria-label="Email to invite"
            className="rounded-lg px-3 py-3 text-base"
            style={inputStyle}
          />
          <Segmented
            label="Role"
            value={inviteRole}
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
            ]}
            onChange={setInviteRole}
          />
          <Button type="submit" tone="primary" disabled={busy}>
            Create invitation link
          </Button>
        </form>

        <Field label="Waiting to be used">
          {invites === null ? (
            <p className="text-sm text-dim">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-dim">None.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{invite.email ?? "Anyone with the link"}</span>
                    <span className="block text-xs text-dim">
                      {invite.role === "admin" ? "Admin" : "Member"} · until {date(invite.expiresAt)}
                    </span>
                  </span>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(`/api/admin/invites/${invite.id}`, { method: "DELETE" });
                        await Promise.all([loadInvites(), loadAudit()]);
                      })
                    }
                  >
                    Withdraw
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Field>
      </Section>

      {settings && (
        <Section title="This instance" id="instance">
          <Field label="Who can sign up" hint={REGISTRATION_HINTS[settings.registration]}>
            <Segmented
              label="Who can sign up"
              value={settings.registration}
              options={[
                { value: "closed", label: "Nobody" },
                { value: "invite", label: "Invited" },
                { value: "open", label: "Anyone" },
              ]}
              onChange={(registration) =>
                run(async () => {
                  await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ registration }) });
                  setSettings({ ...settings, registration });
                  await loadAudit();
                })
              }
            />
          </Field>

          <Field
            label="Shared voice-entry key"
            hint={
              settings.hasSharedOpenRouterKey
                ? "Set. Everyone without a key of their own uses it, and its OpenRouter credit."
                : settings.hasEnvOpenRouterKey
                  ? "Not set here; the OPENROUTER_API_KEY the server was started with is shared instead."
                  : "Not set. Only people who add their own key in Settings can use voice entry."
            }
          >
            <div className="flex gap-2">
              <input
                type="password"
                value={sharedKey}
                onChange={(e) => setSharedKey(e.target.value)}
                placeholder={settings.hasSharedOpenRouterKey ? "•••••••• (set)" : "sk-or-…"}
                aria-label="Shared OpenRouter key"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-base"
                style={inputStyle}
              />
              <Button
                tone="primary"
                disabled={busy || !sharedKey.trim()}
                onClick={() =>
                  run(async () => {
                    await api("/api/admin/settings", {
                      method: "PUT",
                      body: JSON.stringify({ sharedOpenRouterKey: sharedKey.trim() }),
                    });
                    setSharedKey("");
                    setSettings({ ...settings, hasSharedOpenRouterKey: true });
                    await loadAudit();
                    onToast("Shared key saved");
                  })
                }
              >
                Save
              </Button>
              {settings.hasSharedOpenRouterKey && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ sharedOpenRouterKey: "" }) });
                      setSettings({ ...settings, hasSharedOpenRouterKey: false });
                      await loadAudit();
                      onToast("Shared key removed");
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </Field>
        </Section>
      )}

      <Section title="Audit log" id="audit">
        {events.length === 0 ? (
          <p className="text-sm text-dim">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id} className="text-sm">
                <p>
                  <span className="font-medium">{event.action}</span>
                  <span className="text-dim"> · {dateTime(event.at)}</span>
                </p>
                <p className="break-words text-xs text-dim">
                  {event.actorEmail ?? "someone"}
                  {event.targetEmail && event.targetEmail !== event.actorEmail ? ` → ${event.targetEmail}` : ""}
                  {event.ip ? ` · ${event.ip}` : ""}
                  {event.detail ? ` · ${JSON.stringify(event.detail)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <Button disabled={busy} onClick={() => run(() => loadAudit(nextCursor))}>
            Older
          </Button>
        )}
      </Section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
