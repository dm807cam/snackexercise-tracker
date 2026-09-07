"use client";

import { useMemo, useState } from "react";
import { distanceUnitsFor, fromKg, fromMetres, toKg, toMetres, type Units } from "@/lib/format";
import type { ExerciseOption } from "./types";

export interface ManualDraft {
  exerciseId: string;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  notes: string | null;
  /**
   * "HH:MM" on the app's clock, or null for "whenever the app would have
   * stamped it". Sent as digits rather than as an instant so the server can
   * resolve it in the app's configured zone; see lib/validation.ts.
   */
  performedTime: string | null;
}

export function ManualForm({
  exercises,
  recentIds,
  units,
  initial,
  submitLabel,
  onSubmit,
  busy,
}: {
  exercises: ExerciseOption[];
  recentIds: string[];
  units: Units;
  initial?: Partial<ManualDraft>;
  submitLabel: string;
  onSubmit: (draft: ManualDraft) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [exerciseId, setExerciseId] = useState(initial?.exerciseId ?? "");
  const [sets, setSets] = useState(String(initial?.sets ?? 1));
  const [reps, setReps] = useState(initial?.reps != null ? String(initial.reps) : "");
  const [weight, setWeight] = useState(
    initial?.weightKg != null ? String(round1(fromKg(initial.weightKg, units))) : "",
  );
  const [minutes, setMinutes] = useState(
    initial?.durationSec != null ? String(round1(initial.durationSec / 60)) : "",
  );
  const [distance, setDistance] = useState(
    initial?.distanceM != null ? String(round2(fromMetres(initial.distanceM, units))) : "",
  );
  const [heartRate, setHeartRate] = useState(
    initial?.avgHeartRate != null ? String(initial.avgHeartRate) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [time, setTime] = useState(initial?.performedTime ?? "");

  const selected = exercises.find((e) => e.id === exerciseId) ?? null;
  // Distance and heart rate are asked for only where they mean something. A
  // bench press has no pace, and four dead fields on a phone is four fields to
  // scroll past at the top of the stairs.
  const isCardio = (selected?.cardioBias ?? 0) > 0;
  const distanceUnits = distanceUnitsFor(units);

  // Recently used first: an alphabetical list of 67 movements is the wrong
  // default when you do the same six things most weeks.
  const ordered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? exercises.filter((e) => e.name.toLowerCase().includes(needle))
      : exercises;
    if (needle) return matches.slice(0, 40);

    const rank = new Map(recentIds.map((id, i) => [id, i]));
    return [...matches]
      .sort((a, b) => {
        const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
      })
      .slice(0, 40);
  }, [exercises, recentIds, query]);

  function submit() {
    if (!exerciseId) return;
    const weightValue = weight.trim() === "" ? null : Number(weight);
    const minutesValue = minutes.trim() === "" ? null : Number(minutes);

    const distanceValue = distance.trim() === "" ? null : Number(distance);
    const heartRateValue = heartRate.trim() === "" ? null : Number(heartRate);

    onSubmit({
      exerciseId,
      sets: Math.max(1, Number(sets) || 1),
      reps: reps.trim() === "" ? null : Number(reps),
      weightKg: weightValue == null || Number.isNaN(weightValue) ? null : toKg(weightValue, units),
      durationSec:
        minutesValue == null || Number.isNaN(minutesValue) ? null : Math.round(minutesValue * 60),
      distanceM:
        distanceValue == null || Number.isNaN(distanceValue)
          ? null
          : Math.round(toMetres(distanceValue, units)),
      avgHeartRate:
        heartRateValue == null || Number.isNaN(heartRateValue) ? null : Math.round(heartRateValue),
      notes: notes.trim() === "" ? null : notes.trim(),
      // The same pattern the server validates against. A looser one here turns
      // a browser that falls back to a text input, and a typo like 25:00, into
      // a 400 that loses the whole entry rather than just the time.
      performedTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="exercise-search">
          Exercise
        </label>
        <input
          id="exercise-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={selected ? selected.name : "Search movements..."}
          className="w-full rounded-lg px-3 py-3 text-base"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        />
        <div className="mt-2 flex max-h-44 flex-wrap gap-2 overflow-y-auto">
          {ordered.map((exercise) => {
            const active = exercise.id === exerciseId;
            return (
              <button
                key={exercise.id}
                type="button"
                onClick={() => {
                  setExerciseId(exercise.id);
                  setQuery("");
                }}
                className="rounded-full px-3 py-2 text-sm transition-colors"
                style={{
                  background: active ? "var(--accent)" : "var(--surface-2)",
                  color: active ? "var(--accent-contrast)" : "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                {exercise.name}
              </button>
            );
          })}
          {ordered.length === 0 && (
            <p className="py-2 text-sm text-dim">
              No match. Add it in Settings, or just say it on the Voice tab.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Sets" value={sets} onChange={setSets} min={1} />
        <NumberField label="Reps" value={reps} onChange={setReps} placeholder="—" min={1} />
        <NumberField
          label={`Weight (${units})`}
          value={weight}
          onChange={setWeight}
          placeholder={selected?.bodyweight ? "body" : "—"}
          step="0.5"
          min={0}
        />
      </div>

      {isCardio && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={`Distance (${distanceUnits})`}
            value={distance}
            onChange={setDistance}
            placeholder="—"
            step="0.1"
            min={0}
          />
          <NumberField
            label="Avg heart rate"
            value={heartRate}
            onChange={setHeartRate}
            placeholder="—"
            step="1"
            min={20}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Duration (min)"
          value={minutes}
          onChange={setMinutes}
          placeholder="—"
          step="0.5"
          min={0}
        />
        {/*
          When it happened, not when it was logged. A run done at 06:30 and
          remembered at 21:00 is an evening entry everywhere in the app until
          this is corrected — and since the whole point of the spacing metric is
          *when* the day's training landed, an uncorrectable timestamp would
          make that metric measure the user's logging habits instead.
        */}
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="entry-time">
            Time
          </label>
          <input
            id="entry-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="entry-notes">
          Note
        </label>
        <input
          id="entry-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="optional"
          className="w-full rounded-lg px-3 py-3 text-base"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        />
      </div>

      <p className="text-xs text-dim">
        {isCardio
          ? "Distance, duration and heart rate are all optional — but a pace or a heart rate is what makes the effort count properly."
          : "Reps, weight and duration are all optional — log what you actually know."}{" "}
        {time ? "Filed at the time shown." : "Leave the time empty and it is filed as it is now."}
      </p>

      <button
        type="button"
        onClick={submit}
        disabled={!exerciseId || busy}
        className="w-full rounded-xl py-3 text-base font-semibold transition-opacity disabled:opacity-40"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      >
        {busy ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  step?: string;
  min?: number;
}) {
  const id = `field-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      />
    </div>
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
