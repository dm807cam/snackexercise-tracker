"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { TodaySchedule } from "@/lib/snack/schedule-service";
import { Button, Field, Section, Toggle, inputStyle } from "./ui";

type DeviceState =
  | "checking"
  /** No Web Push here at all. */
  | "unsupported"
  /** iPhone or iPad in Safari: push works only once added to the Home Screen. */
  | "ios-browser"
  | "denied"
  | "off"
  | "on";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS = 31;
const ALL_DAYS = 127;

interface BusyDraft {
  days: number;
  start: string;
  end: string;
  label: string;
}

/** The VAPID public key, base64url, as the bytes PushManager wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIosBrowser(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

function describeUntil(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

function daysLabel(days: number): string {
  if (days === ALL_DAYS) return "every day";
  if (days === WEEKDAYS) return "weekdays";
  if (days === 96) return "weekends";
  return DAY_NAMES.filter((_, i) => days & (1 << i))
    .map((name) => name.slice(0, 3))
    .join(", ");
}

/**
 * Nudges: the app telling you a snack is due, rather than waiting to be
 * remembered. Off until switched on from a device, because switching on is
 * what subscribes that device, and nothing should buzz a phone unasked.
 */
export function NudgesSection({
  initial,
  onToast,
}: {
  initial: TodaySchedule;
  onToast: (message: string, tone?: "error") => void;
}) {
  const [schedule, setSchedule] = useState(initial);
  const [device, setDevice] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [blocks, setBlocks] = useState<BusyDraft[]>(
    initial.busy.map((b) => ({ days: b.days, start: b.start, end: b.end, label: b.label ?? "" })),
  );
  const [blocksDirty, setBlocksDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let state: DeviceState;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        state = isIosBrowser() ? "ios-browser" : "unsupported";
      } else if (Notification.permission === "denied") {
        state = "denied";
      } else {
        const subscription = await currentSubscription().catch(() => null);
        state = subscription && Notification.permission === "granted" ? "on" : "off";
      }
      if (!cancelled) setDevice(state);
    })();
    return () => {
      cancelled = true;
    };
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

  async function refresh() {
    setSchedule(await api<TodaySchedule>("/api/schedule"));
  }

  async function putSchedule(patch: Record<string, unknown>) {
    setSchedule(await api<TodaySchedule>("/api/schedule", { method: "PUT", body: JSON.stringify(patch) }));
  }

  const turnOn = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "denied" : "off");
        throw new Error("Notifications were not allowed, so there is nothing to send nudges to.");
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await api<{ publicKey: string }>("/api/push/key");
      let subscription = await registration.pushManager.getSubscription();
      // A subscription made with another server key cannot be sent to: replace it.
      if (subscription) {
        const existing = subscription.options.applicationServerKey;
        const wanted = keyBytes(publicKey);
        const same =
          existing != null &&
          existing.byteLength === wanted.byteLength &&
          new Uint8Array(existing).every((byte, i) => byte === wanted[i]);
        if (!same) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      await api("/api/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setDevice("on");
      await refresh();
      onToast("Nudges are on for this device");
    });

  const turnOffHere = () =>
    run(async () => {
      const subscription = await currentSubscription();
      if (subscription) {
        await api("/api/push/subscriptions", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe().catch(() => false);
      }
      setDevice("off");
      await refresh();
      onToast("No more nudges on this device");
    });

  const pause = (hours: number | null) =>
    run(async () => {
      await api("/api/nudges/pause", { method: "POST", body: JSON.stringify({ hours }) });
      await refresh();
      onToast(hours == null ? "Nudges resumed" : "Nudges paused");
    });

  function hoursToMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.max(0.25, (midnight.getTime() - now.getTime()) / 3_600_000);
  }

  const { nudges } = schedule;
  const paused = nudges.pausedUntil;
  const next = schedule.slots[0];

  return (
    <Section title="Nudges" id="nudges">
      <p className="text-xs text-dim">
        A notification when a snack is due, spread across your waking hours and planned for wherever you are at that
        moment. Tap Start and it is ready to go; tap “In 30 min” and it comes back.
      </p>

      <div className="rounded-lg px-3 py-2 text-sm" style={inputStyle} aria-live="polite">
        {schedule.slots.length === 0 ? (
          <p>
            {schedule.done >= schedule.targetBouts
              ? `All ${schedule.targetBouts} snacks done today. Nothing more planned.`
              : "Nothing more fits in today's waking hours."}
          </p>
        ) : (
          <p>
            {schedule.dueNow ? (
              <>A snack is due now</>
            ) : (
              <>
                Next snack around <strong className="tabular-nums">{next.time}</strong>
              </>
            )}
            {schedule.slots.length > 1 && (
              <span className="text-dim">
                {" "}
                · then {schedule.slots.slice(1, 4).map((s) => s.time).join(", ")}
                {schedule.slots.length > 4 ? "…" : ""}
              </span>
            )}
          </p>
        )}
        <p className="text-xs text-dim">
          {schedule.done} of {schedule.targetBouts} done today
          {schedule.busyNow ? " · busy right now" : ""}
          {nudges.enabled && !nudges.activeToday ? " · no nudges on this day" : ""}
        </p>
      </div>

      <Field label="This device">
        {device === "checking" ? (
          <p className="text-sm text-dim">Checking…</p>
        ) : device === "unsupported" ? (
          <p className="text-sm text-dim">
            This browser cannot receive notifications from a web app. Try Chrome, Edge, Firefox or Safari on a recent
            system.
          </p>
        ) : device === "ios-browser" ? (
          <p className="text-sm">
            On iPhone and iPad, notifications work once the app is on your Home Screen: tap Share, then{" "}
            <strong>Add to Home Screen</strong>, open it from there and come back here.
          </p>
        ) : device === "denied" ? (
          <p className="text-sm">
            Notifications are blocked for this site. Allow them in the browser&apos;s site settings, then come back.
          </p>
        ) : device === "on" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { delivered } = await api<{ delivered: number }>("/api/push/test", { method: "POST" });
                  onToast(`Sent to ${delivered} ${delivered === 1 ? "device" : "devices"}`);
                })
              }
            >
              Send a test
            </Button>
            <Button disabled={busy} onClick={turnOffHere}>
              Turn off here
            </Button>
          </div>
        ) : (
          <Button tone="primary" disabled={busy} onClick={turnOn}>
            Turn on nudges
          </Button>
        )}
        {nudges.devices > 0 && (
          <p className="mt-2 text-xs text-dim">
            Nudges go to {nudges.devices} {nudges.devices === 1 ? "device" : "devices"}.
            {nudges.enabled && device !== "on" && (
              <>
                {" "}
                <button
                  type="button"
                  className="underline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await putSchedule({ nudges: false });
                      onToast("Nudges are off everywhere");
                    })
                  }
                >
                  Turn off everywhere
                </button>
              </>
            )}
          </p>
        )}
      </Field>

      {nudges.enabled && (
        <>
          <Field label="Quiet for a while" hint="A meeting-heavy afternoon, a flight, a holiday.">
            {paused ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">Paused until {describeUntil(paused)}</p>
                <Button disabled={busy} onClick={() => pause(null)}>
                  Resume
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => pause(1)}>
                  1 hour
                </Button>
                <Button disabled={busy} onClick={() => pause(hoursToMidnight())}>
                  Rest of today
                </Button>
                <Button disabled={busy} onClick={() => pause(72)}>
                  3 days
                </Button>
                <Button disabled={busy} onClick={() => pause(24 * 7)}>
                  A week
                </Button>
              </div>
            )}
          </Field>

          <Field label="On these days">
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days to send nudges on">
              {DAY_LETTERS.map((letter, i) => {
                const bit = 1 << i;
                const on = (nudges.days & bit) !== 0;
                return (
                  <button
                    key={DAY_NAMES[i]}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={DAY_NAMES[i]}
                    disabled={busy || (on && nudges.days === bit)}
                    onClick={() => run(() => putSchedule({ days: nudges.days ^ bit }))}
                    className="tap rounded-md py-2 text-sm font-medium"
                    style={{
                      background: on ? "var(--accent)" : "var(--surface-2)",
                      color: on ? "var(--accent-contrast)" : "var(--text-dim)",
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </Field>

          <Toggle
            label="Remind me once more"
            hint="If a snack is still waiting 45 minutes after the first nudge. Never more than that."
            checked={nudges.followUp}
            disabled={busy}
            onChange={(followUp) => run(() => putSchedule({ followUp }))}
          />

          <Field label="At most, per day" htmlFor="nudge-max">
            <select
              id="nudge-max"
              value={nudges.maxPerDay}
              disabled={busy}
              onChange={(e) => run(() => putSchedule({ maxPerDay: Number(e.target.value) }))}
              className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
              style={inputStyle}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "nudge" : "nudges"}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field
        label="Busy times"
        hint="Nudges never land in these; a snack that would is moved to when they end. Your waking hours and snacks-a-day target are under Spreading it out."
      >
        <ul className="flex flex-col gap-2">
          {blocks.map((block, index) => (
            <li key={index} className="flex flex-col gap-2 rounded-lg p-2" style={inputStyle}>
              <div className="flex items-center gap-2">
                <input
                  value={block.label}
                  onChange={(e) => {
                    setBlocks((all) => all.map((b, i) => (i === index ? { ...b, label: e.target.value } : b)));
                    setBlocksDirty(true);
                  }}
                  placeholder="Label (optional)"
                  aria-label="Label"
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setBlocks((all) => all.filter((_, i) => i !== index));
                    setBlocksDirty(true);
                  }}
                  className="tap rounded-md px-2 text-sm text-dim"
                  aria-label="Remove this busy time"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={block.start}
                  onChange={(e) => {
                    setBlocks((all) => all.map((b, i) => (i === index ? { ...b, start: e.target.value } : b)));
                    setBlocksDirty(true);
                  }}
                  aria-label="Starts"
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm tabular-nums"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                />
                <span className="text-xs text-dim">to</span>
                <input
                  type="time"
                  value={block.end}
                  onChange={(e) => {
                    setBlocks((all) => all.map((b, i) => (i === index ? { ...b, end: e.target.value } : b)));
                    setBlocksDirty(true);
                  }}
                  aria-label="Ends"
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm tabular-nums"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                />
              </div>
              <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
                {DAY_LETTERS.map((letter, i) => {
                  const bit = 1 << i;
                  const on = (block.days & bit) !== 0;
                  return (
                    <button
                      key={DAY_NAMES[i]}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={DAY_NAMES[i]}
                      onClick={() => {
                        const days = block.days ^ bit;
                        if (days === 0) return;
                        setBlocks((all) => all.map((b, j) => (j === index ? { ...b, days } : b)));
                        setBlocksDirty(true);
                      }}
                      className="rounded py-1 text-xs font-medium"
                      style={{
                        background: on ? "var(--accent)" : "var(--surface)",
                        color: on ? "var(--accent-contrast)" : "var(--text-dim)",
                      }}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-dim">{daysLabel(block.days)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            disabled={busy || blocks.length >= 30}
            onClick={() => {
              setBlocks((all) => [...all, { days: WEEKDAYS, start: "09:00", end: "10:00", label: "" }]);
              setBlocksDirty(true);
            }}
          >
            Add a busy time
          </Button>
          {blocksDirty && (
            <Button
              tone="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await putSchedule({
                    busy: blocks.map((b) => ({ days: b.days, start: b.start, end: b.end, label: b.label.trim() || null })),
                  });
                  setBlocksDirty(false);
                  onToast("Busy times saved");
                })
              }
            >
              Save busy times
            </Button>
          )}
        </div>
      </Field>
    </Section>
  );
}
