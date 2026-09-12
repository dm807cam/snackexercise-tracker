"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { LocalDate } from "@/lib/dates";

/**
 * The day's step count.
 *
 * Deliberately not a logging affordance like the + button: steps are a
 * measurement of the day rather than something you did on purpose, so this sits
 * quietly under the summary line and stays out of the entry list. Most people
 * will never touch it, because a phone automation will be writing the same
 * value to the same endpoint every night.
 */
export function StepsField({
  date,
  steps,
  activeMinutes,
  onSaved,
  onError,
}: {
  date: LocalDate;
  steps: number | null;
  /**
   * Minutes the phone called brisk.
   *
   * Typed here only as a fallback — the Shortcut sends it with the step count.
   * Without it, all of a day's above-baseline steps are credited as incidental
   * walking, which is what a bare daily total actually describes.
   */
  activeMinutes: number | null;
  onSaved: (steps: number | null, activeMinutes: number | null) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(steps == null ? "" : String(steps));
  const [brisk, setBrisk] = useState(activeMinutes == null ? "" : String(activeMinutes));
  const [busy, setBusy] = useState(false);

  // A server-rendered day change brings a new count with it.
  useEffect(() => {
    setValue(steps == null ? "" : String(steps));
    setBrisk(activeMinutes == null ? "" : String(activeMinutes));
    setEditing(false);
  }, [steps, activeMinutes, date]);

  async function save() {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Math.round(Number(trimmed));

    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      onError("Steps must be a positive number");
      return;
    }

    const briskTrimmed = brisk.trim();
    const briskParsed = briskTrimmed === "" ? null : Math.round(Number(briskTrimmed));

    if (briskParsed != null && (!Number.isFinite(briskParsed) || briskParsed < 0)) {
      onError("Brisk minutes must be a positive number");
      return;
    }

    setBusy(true);
    try {
      await api(`/api/metrics/${date}`, {
        method: "PUT",
        body: JSON.stringify({
          steps: parsed,
          activeMinutes: briskParsed,
          source: "manual",
        }),
      });
      onSaved(parsed, briskParsed);
      setEditing(false);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="mb-3 flex justify-center">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full px-3 py-1.5 text-xs"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <span aria-hidden className="mr-1">
            👟
          </span>
          {steps == null ? (
            <span className="text-dim">Add today&rsquo;s steps</span>
          ) : (
            <span className="tabular-nums">
              {steps.toLocaleString()} steps
              {activeMinutes != null && activeMinutes > 0 && ` · ${activeMinutes} brisk`}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-center justify-center gap-2">
      <label className="sr-only" htmlFor="steps-input">
        Steps
      </label>
      <input
        id="steps-input"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        autoFocus
        placeholder="steps"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-28 rounded-lg px-3 py-2 text-sm tabular-nums"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      />
      <label className="sr-only" htmlFor="brisk-input">
        Brisk minutes
      </label>
      <input
        id="brisk-input"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={brisk}
        placeholder="brisk min"
        onChange={(e) => setBrisk(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 rounded-lg px-3 py-2 text-sm tabular-nums"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      >
        {busy ? "..." : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-lg px-2 py-2 text-sm text-dim"
      >
        Cancel
      </button>
    </div>
  );
}
