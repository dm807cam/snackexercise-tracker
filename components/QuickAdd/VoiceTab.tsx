"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import {
  distanceUnitsFor,
  formatDistance,
  formatWeight,
  fromKg,
  fromMetres,
  toKg,
  toMetres,
  type Units,
} from "@/lib/format";
import { EFFORT_LEVELS, effortLabel, ratesEffort } from "@/lib/effort";
import { muscleLabel } from "@/lib/muscles";
import { resolvePerformedAt } from "@/lib/parse-helpers";
import type { LocalDate } from "@/lib/dates";

interface Proposal {
  exerciseName: string;
  matchedExerciseId: string | null;
  matchedName: string | null;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  effort: string | null;
  timeHint: string | null;
  notes: string | null;
  suggestedMuscles: { muscle: string; weight: number }[] | null;
  suggestedCardioBias: number | null;
  suggestedMets: number | null;
  isCardio: boolean;
  cardioBias: number;
}

const EXAMPLES = [
  "3 sets of 12 kettlebell swings at 24 kilos",
  "10 pull-ups and a 2 minute plank",
  "ran 5k in 27 minutes",
  "20 push-ups, then 5 x 5 back squat at 80",
];

/**
 * The model is asked for "HH:MM" and mostly obliges, but a hallucinated 25:00
 * would now be rejected by the server rather than quietly falling back the way
 * resolvePerformedAt did. Check before trusting it.
 */
function isClockTime(value: string | null): value is string {
  return value != null && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function VoiceTab({
  date,
  units,
  hasKey,
  onSaved,
  onError,
}: {
  date: LocalDate;
  units: Units;
  hasKey: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  // Proposed, not saved: /api/parse is read-only, so a dictated step count is
  // written on confirm along with the entries.
  const [steps, setSteps] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function parse() {
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api<{ proposals: Proposal[]; steps: number | null }>("/api/parse", {
        method: "POST",
        body: JSON.stringify({ text, date }),
      });
      if (result.proposals.length === 0 && result.steps == null) {
        onError("No exercises found in that. Try naming the movement and the reps.");
      }
      setSteps(result.steps);
      setProposals(result.proposals);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    // A dictation can be nothing but a step count, which is still worth saving.
    if (!proposals || (proposals.length === 0 && steps == null)) return;
    setBusy(true);
    try {
      const payload = proposals.map((p) => ({
        exerciseId: p.matchedExerciseId ?? undefined,
        exerciseName: p.matchedExerciseId ? undefined : p.exerciseName,
        muscles: p.matchedExerciseId ? undefined : (p.suggestedMuscles ?? undefined),
        cardioBias: p.matchedExerciseId ? undefined : (p.suggestedCardioBias ?? undefined),
        mets: p.matchedExerciseId ? undefined : (p.suggestedMets ?? undefined),
        // "I ran at half six this morning" is a time the speaker stated, so it
        // travels as digits and is resolved in the app's zone. Without one the
        // old behaviour stands: now for today, midday for a back-fill.
        ...(isClockTime(p.timeHint)
          ? { performedTime: p.timeHint }
          : { performedAt: resolvePerformedAt(date, null).toISOString() }),
        localDate: date,
        sets: p.sets,
        reps: p.reps,
        weightKg: p.weightKg,
        durationSec: p.durationSec,
        distanceM: p.distanceM,
        avgHeartRate: p.avgHeartRate,
        effort: p.effort,
        notes: p.notes,
        source: "llm" as const,
      }));

      if (payload.length > 0) {
        await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
      }
      if (steps != null) {
        await api(`/api/metrics/${date}`, {
          method: "PUT",
          body: JSON.stringify({ steps, source: "llm" }),
        });
      }
      onSaved(describeSaved(payload.length, steps));
      setText("");
      setProposals(null);
      setSteps(null);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function update(index: number, patch: Partial<Proposal>) {
    setProposals((current) =>
      current ? current.map((p, i) => (i === index ? { ...p, ...patch } : p)) : current,
    );
  }

  if (!hasKey) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm">Voice entry needs an OpenRouter API key.</p>
        <p className="mt-2 text-sm text-dim">
          Add one under <span className="font-medium">Settings</span>, or keep using the Manual tab —
          it does everything this does, just with more tapping.
        </p>
      </div>
    );
  }

  if (proposals) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-dim">
          Check these before saving. Nothing is stored until you confirm.
        </p>

        {steps != null && (
          <p className="text-xs text-dim">
            <span aria-hidden className="mr-1">
              👟
            </span>
            {steps.toLocaleString()} steps for this day.
          </p>
        )}

        {proposals.map((proposal, index) => (
          <ProposalCard
            key={index}
            proposal={proposal}
            units={units}
            onChange={(patch) => update(index, patch)}
            onRemove={() => setProposals((c) => c?.filter((_, i) => i !== index) ?? null)}
          />
        ))}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setProposals(null)}
            className="flex-1 rounded-xl py-3 text-base font-medium"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || (proposals.length === 0 && steps == null)}
            className="flex-[2] rounded-xl py-3 text-base font-semibold disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
          >
            {busy
              ? "Saving..."
              : proposals.length === 0
                ? "Save steps"
                : `Save ${proposals.length} ${proposals.length === 1 ? "entry" : "entries"}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium" htmlFor="voice-text">
        Say what you did
      </label>
      <textarea
        id="voice-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Tap the mic on your keyboard and just say it..."
        className="w-full resize-none rounded-lg px-3 py-3 text-base"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      />

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setText(example)}
            className="rounded-full px-3 py-1 text-xs text-dim"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            {example}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={parse}
        disabled={busy || text.trim().length < 2}
        className="w-full rounded-xl py-3 text-base font-semibold disabled:opacity-40"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      >
        {busy ? "Reading..." : "Read it"}
      </button>
    </div>
  );
}

/** "Logged 2 entries and 11,000 steps" — a dictation can carry either or both. */
function describeSaved(entries: number, steps: number | null): string {
  const parts: string[] = [];
  if (entries > 0) parts.push(`${entries} ${entries === 1 ? "entry" : "entries"}`);
  if (steps != null) parts.push(`${steps.toLocaleString()} steps`);
  return `Logged ${parts.join(" and ")}`;
}

function ProposalCard({
  proposal,
  units,
  onChange,
  onRemove,
}: {
  proposal: Proposal;
  units: Units;
  onChange: (patch: Partial<Proposal>) => void;
  onRemove: () => void;
}) {
  const isNew = !proposal.matchedExerciseId;

  return (
    <div className="surface rounded-xl px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{proposal.matchedName ?? proposal.exerciseName}</p>
          {isNew && (
            <p className="mt-1 text-xs" style={{ color: "var(--accent)" }}>
              New movement
              {proposal.suggestedMuscles?.length
                ? ` · ${proposal.suggestedMuscles.map((m) => muscleLabel(m.muscle)).join(", ")}`
                : " · needs a muscle mapping (add it in Settings first)"}
            </p>
          )}
          {proposal.notes && <p className="mt-1 text-xs text-dim">{proposal.notes}</p>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Discard ${proposal.exerciseName}`}
          className="tap shrink-0 text-sm text-dim"
        >
          ✕
        </button>
      </div>

      {/* A run is corrected by its distance and time, not by its load. */}
      {proposal.isCardio ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MiniField
            label={distanceUnitsFor(units)}
            value={
              proposal.distanceM == null ? "" : String(round1(fromMetres(proposal.distanceM, units)))
            }
            onChange={(v) =>
              onChange({ distanceM: v === "" ? null : Math.round(toMetres(Number(v), units)) })
            }
          />
          <MiniField
            label="minutes"
            value={proposal.durationSec == null ? "" : String(round1(proposal.durationSec / 60))}
            onChange={(v) =>
              onChange({ durationSec: v === "" ? null : Math.round(Number(v) * 60) })
            }
          />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <MiniField
            label="Sets"
            value={String(proposal.sets)}
            onChange={(v) => onChange({ sets: Math.max(1, Number(v) || 1) })}
          />
          <MiniField
            label="Reps"
            value={proposal.reps == null ? "" : String(proposal.reps)}
            onChange={(v) => onChange({ reps: v === "" ? null : Number(v) })}
          />
          <MiniField
            label={units}
            value={proposal.weightKg == null ? "" : String(round1(fromKg(proposal.weightKg, units)))}
            onChange={(v) => onChange({ weightKg: v === "" ? null : toKg(Number(v), units) })}
          />
        </div>
      )}

      {/*
        The rating the model inferred, shown and correctable.
        "Nothing is stored until you confirm" has to mean every field: an effort
        rating changes what the set is worth, and one heard out of "that was easy
        to get to" would otherwise be saved with no way to see or undo it here.
        Not offered for PURE cardio, which is never rated — but a burpee is,
        and gating on "any aerobic component" hid the chips for one while
        still submitting the rating.
      */}
      {ratesEffort(proposal.cardioBias) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {EFFORT_LEVELS.map((level) => {
            const active = proposal.effort === level;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ effort: active ? null : level })}
                className="tap rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  background: active ? "var(--accent)" : "var(--surface-2)",
                  color: active ? "var(--accent-contrast)" : "var(--text-dim)",
                  border: "1px solid var(--border)",
                }}
              >
                {effortLabel(level)}
              </button>
            );
          })}
          {proposal.effort == null && <span className="text-xs text-dim">effort not stated</span>}
        </div>
      )}

      {proposal.distanceM != null && proposal.distanceM > 0 ? (
        <p className="mt-2 text-xs text-dim">
          {formatDistance(proposal.distanceM, units)}
          {proposal.durationSec != null && ` · ${Math.round(proposal.durationSec / 60)} min`}
          {proposal.avgHeartRate != null && ` · ${proposal.avgHeartRate} bpm`}
        </p>
      ) : (
        proposal.durationSec != null && (
          <p className="mt-2 text-xs text-dim">
            Hold: {Math.round(proposal.durationSec / 60)} min
            {proposal.weightKg != null && ` · ${formatWeight(proposal.weightKg, units)}`}
          </p>
        )
      )}
    </div>
  );
}

function MiniField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-dim">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-2 py-2 text-sm tabular-nums"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      />
    </label>
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
