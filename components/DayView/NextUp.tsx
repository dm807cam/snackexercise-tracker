"use client";

import type { Suggestion } from "@/lib/suggest";

/**
 * The bar at the top of the day: what to do next, and why.
 *
 * Deliberately one line and one tap. The app already knows which muscle group
 * has waited longest and which movement in the catalogue trains it; making the
 * user do that join in their head, at the top of the stairs, with four minutes,
 * is the app being lazy. Tapping it opens the log sheet with the movement
 * already chosen.
 *
 * It always shows its reasoning and always shows two alternatives, because a
 * suggestion that cannot be argued with is a prescription, and this one has no
 * idea what equipment is to hand or what hurts today.
 */
export function NextUp({
  suggestion,
  onPick,
}: {
  suggestion: Suggestion;
  onPick: (exerciseId: string | null) => void;
}) {
  const { primary, exercise, reason, nudge, alternatives, progressedFrom } = suggestion;
  const colour = primary.axis === null ? "var(--cardio)" : "var(--strength)";

  return (
    <section className="mb-3">
      <button
        type="button"
        onClick={() => onPick(exercise?.id ?? null)}
        className="surface flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left"
        aria-label={`Log ${exercise?.name ?? primary.label} — ${reason}`}
      >
        <span
          aria-hidden
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: colour }}
        />

        <span className="min-w-0 flex-1">
          <span className="block text-[11px] uppercase tracking-wide text-dim">
            {nudge ?? "Next up"}
          </span>
          <span className="block truncate text-sm font-medium">
            {exercise ? `${exercise.name} · ${primary.label}` : primary.label}
          </span>
          <span className="block truncate text-xs text-dim">{reason}</span>
        </span>

        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-dim"
          aria-hidden
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* An upgraded pick says so. Proposing something harder than the obvious
          choice without explaining why would be the bar overreaching, and the
          whole design of it is that its reasoning is always visible. */}
      {progressedFrom && (
        <p className="mt-1 px-1 text-[11px] text-dim">
          a step up from {progressedFrom}, which has stopped moving
        </p>
      )}

      {alternatives.length > 0 && (
        <p className="mt-1 px-1 text-[11px] text-dim">
          or {alternatives.map((a) => a.label).join(", ")}
        </p>
      )}
    </section>
  );
}
