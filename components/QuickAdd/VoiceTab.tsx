"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { formatWeight, fromKg, toKg, type Units } from "@/lib/format";
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
  timeHint: string | null;
  notes: string | null;
  suggestedMuscles: { muscle: string; weight: number }[] | null;
}

const EXAMPLES = [
  "3 sets of 12 kettlebell swings at 24 kilos",
  "10 pull-ups and a 2 minute plank",
  "20 push-ups, then 5 x 5 back squat at 80",
];

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
  onSaved: (count: number) => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function parse() {
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api<{ proposals: Proposal[] }>("/api/parse", {
        method: "POST",
        body: JSON.stringify({ text, date }),
      });
      if (result.proposals.length === 0) {
        onError("No exercises found in that. Try naming the movement and the reps.");
      }
      setProposals(result.proposals);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposals?.length) return;
    setBusy(true);
    try {
      const payload = proposals.map((p) => ({
        exerciseId: p.matchedExerciseId ?? undefined,
        exerciseName: p.matchedExerciseId ? undefined : p.exerciseName,
        muscles: p.matchedExerciseId ? undefined : (p.suggestedMuscles ?? undefined),
        performedAt: resolvePerformedAt(date, p.timeHint).toISOString(),
        localDate: date,
        sets: p.sets,
        reps: p.reps,
        weightKg: p.weightKg,
        durationSec: p.durationSec,
        notes: p.notes,
        source: "llm" as const,
      }));

      await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
      onSaved(payload.length);
      setText("");
      setProposals(null);
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
            disabled={busy || proposals.length === 0}
            className="flex-[2] rounded-xl py-3 text-base font-semibold disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
          >
            {busy ? "Saving..." : `Save ${proposals.length} ${proposals.length === 1 ? "entry" : "entries"}`}
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

      {proposal.durationSec != null && (
        <p className="mt-2 text-xs text-dim">
          Hold: {Math.round(proposal.durationSec / 60)} min
          {proposal.weightKg != null && ` · ${formatWeight(proposal.weightKg, units)}`}
        </p>
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
