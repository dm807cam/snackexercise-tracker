"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { SnackPlan } from "@/lib/snack/types";
import type { SnackView } from "@/lib/snack/service";
import { PlanPreview } from "./PlanPreview";

export interface PlaceOption {
  id: string;
  name: string;
  kind: string;
}

type Focus = "auto" | "strength" | "cardio";

/** The rest of today's plan, as the nudge job sees it (lib/snack/schedule-service.ts). */
export interface Upcoming {
  /** "HH:MM", in order. Empty when the day's target is met or nothing more fits. */
  times: string[];
  done: number;
  target: number;
  /** The first of `times` has already come. */
  dueNow: boolean;
  /** Nudges will come today: switched on for a device, and today is one of their days. */
  nudgesOn: boolean;
  /** Switched on at all; false means there is something to offer. */
  nudgesEnabled: boolean;
  pausedUntil: string | null;
}

export const MINUTE_OPTIONS = [1, 2, 3, 5, 10] as const;

/**
 * The top of the day: a snack you could do right now, and one tap to start it.
 *
 * Everything the planner needs from the person is on this card and nowhere
 * else — where they are, how long they have, and optionally whether they want
 * strength or cardio — each one tap, with the answer remembered. The proposal
 * shows its reasoning block by block, because a plan that cannot be argued
 * with is a prescription, and this one only knows what was logged.
 */
export function SnackNow({
  initialPlan,
  places,
  activePlaceId,
  defaultMinutes,
  nudge,
  resumable,
  upcoming,
  onStart,
  onPick,
  onError,
}: {
  initialPlan: SnackPlan | null;
  places: PlaceOption[];
  activePlaceId: string | null;
  defaultMinutes: number;
  /** "3h 20m since your last snack" — the spacing nudge, when it has something to say. */
  nudge: string | null;
  /** A snack started earlier and not finished. */
  resumable: SnackView | null;
  upcoming: Upcoming;
  onStart: (snack: SnackView) => void;
  /** Log one of the planned movements by hand instead. */
  onPick: (exerciseId: string) => void;
  onError: (message: string) => void;
}) {
  const [plan, setPlan] = useState<SnackPlan | null>(initialPlan);
  const [placeId, setPlaceId] = useState(activePlaceId);
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [focus, setFocus] = useState<Focus>("auto");
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const first = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ minutes: String(minutes), focus, nonce: String(nonce) });
      if (placeId) params.set("contextId", placeId);
      const { plan: next } = await api<{ plan: SnackPlan }>(`/api/snacks/preview?${params}`);
      setPlan(next);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [minutes, focus, nonce, placeId, onError]);

  useEffect(() => {
    // The server rendered the first plan; only re-plan once something changes.
    if (first.current) {
      first.current = false;
      return;
    }
    void refresh();
  }, [refresh]);

  async function choosePlace(id: string) {
    setPlaceId(id);
    setNonce(0);
    try {
      await api("/api/contexts/active", { method: "PUT", body: JSON.stringify({ contextId: id }) });
    } catch (error) {
      onError((error as Error).message);
    }
  }

  async function chooseMinutes(value: number) {
    setMinutes(value);
    setNonce(0);
    // Remembered, so the card opens on the length this person actually has.
    api("/api/settings", { method: "PUT", body: JSON.stringify({ snackMinutes: String(value) }) }).catch(() => {});
  }

  async function start() {
    if (!plan || plan.empty) return;
    setStarting(true);
    try {
      const { snack } = await api<{ snack: SnackView }>("/api/snacks", {
        method: "POST",
        body: JSON.stringify({ minutes, focus, nonce, ...(placeId ? { contextId: placeId } : {}) }),
      });
      const { snack: started } = await api<{ snack: SnackView }>(`/api/snacks/${snack.id}/start`, { method: "POST" });
      onStart(started);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="surface mb-3 rounded-xl px-4 py-3" aria-labelledby="snack-now-title">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="snack-now-title" className="text-sm font-semibold">
            Snack now
          </h2>
          {nudge && <p className="text-xs text-dim">{nudge}</p>}
        </div>
        {/* What kind: a segmented control, like Settings', so it reads as one
            question with three answers rather than three more chips. */}
        <div
          className="grid shrink-0 grid-cols-3 gap-0.5 rounded-lg p-0.5"
          style={{ background: "var(--surface-2)" }}
          role="radiogroup"
          aria-label="What kind of snack"
        >
          {(["auto", "strength", "cardio"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === focus}
              onClick={() => {
                setFocus(value);
                setNonce(0);
              }}
              className="tap rounded-md px-2 text-xs font-medium"
              style={{
                background: value === focus ? "var(--surface)" : "transparent",
                color: value === focus ? "var(--text)" : "var(--text-dim)",
              }}
            >
              {value === "auto" ? "Any" : value === "strength" ? "Strength" : "Cardio"}
            </button>
          ))}
        </div>
      </div>

      {resumable && (
        <button
          type="button"
          onClick={() => onStart(resumable)}
          className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          Pick up where you left off — {resumable.plan.headline}
        </button>
      )}

      {places.length > 0 && (
        <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Where are you?">
          {places.map((place) => (
            <Chip key={place.id} active={place.id === placeId} onClick={() => choosePlace(place.id)} role="radio">
              {place.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Minutes you have">
        {MINUTE_OPTIONS.map((value) => (
          <Chip
            key={value}
            active={value === minutes}
            onClick={() => chooseMinutes(value)}
            role="radio"
            compact
            label={`${value} ${value === 1 ? "minute" : "minutes"}`}
          >
            {value}m
          </Chip>
        ))}
      </div>

      <div className="mt-3" aria-busy={loading} style={{ opacity: loading ? 0.5 : 1, transition: "opacity 150ms" }}>
        {!plan ? (
          <p className="text-sm text-dim">Planning…</p>
        ) : plan.empty ? (
          <p className="text-sm">
            {plan.empty}{" "}
            <Link href="/settings#places" className="underline" style={{ color: "var(--accent)" }}>
              Places
            </Link>
          </p>
        ) : (
          <>
            <p className="text-base font-medium">{plan.headline}</p>
            <p className="mb-2 text-xs text-dim">{plan.reason}</p>
            <PlanPreview plan={plan} onPick={onPick} />
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={start}
          disabled={!plan || Boolean(plan.empty) || starting || loading}
          className="flex-1 rounded-xl py-3 text-base font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
        >
          {starting ? "Starting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          disabled={loading || !plan || Boolean(plan.empty)}
          className="tap rounded-xl px-4 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          Something else
        </button>
      </div>

      <UpcomingLine upcoming={upcoming} />
    </section>
  );
}

/** One line under the card: when the next snack is planned, and whether anything will say so. */
function UpcomingLine({ upcoming }: { upcoming: Upcoming }) {
  const paused = upcoming.pausedUntil ? new Date(upcoming.pausedUntil) : null;
  const next = upcoming.times[0];
  let text: string;
  if (upcoming.done >= upcoming.target) text = `All ${upcoming.target} snacks done today.`;
  else if (!next) text = "Nothing more fits in today's waking hours.";
  else if (upcoming.dueNow && !paused)
    text = `A snack is due now${upcoming.times[1] ? `; the one after around ${upcoming.times[1]}` : ""}.`;
  else if (paused && upcoming.nudgesOn)
    text = `Nudges paused until ${paused.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}; next snack planned around ${next}.`;
  else text = `${upcoming.nudgesOn ? "Next nudge" : "Next snack planned"} around ${next}.`;

  return (
    <p className="mt-2 text-xs text-dim">
      {text}{" "}
      {!upcoming.nudgesEnabled && upcoming.done < upcoming.target && (
        <Link href="/settings#nudges" className="underline" style={{ color: "var(--accent)" }}>
          Get nudged
        </Link>
      )}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
  role,
  compact = false,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  role?: "radio";
  compact?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? active : undefined}
      aria-label={label}
      onClick={onClick}
      className={`tap shrink-0 rounded-full text-sm ${compact ? "px-2.5 py-1.5" : "px-3 py-1.5"}`}
      style={{
        background: active ? "var(--accent)" : "var(--surface-2)",
        color: active ? "var(--accent-contrast)" : "var(--text)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      {children}
    </button>
  );
}
