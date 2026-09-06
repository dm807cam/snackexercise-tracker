"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Toast, type ToastState } from "@/components/Toast";
import { MUSCLES, muscleLabel } from "@/lib/muscles";
import type { Units } from "@/lib/format";
import type { ExerciseOption } from "@/components/QuickAdd/types";
import { Sheet } from "@/components/Sheet";
import { ModelPicker } from "./ModelPicker";

export function SettingsView({
  initial,
  exercises,
}: {
  initial: { units: Units; timezone: string; model: string; hasKey: boolean };
  exercises: ExerciseOption[];
}) {
  const router = useRouter();
  const [units, setUnits] = useState<Units>(initial.units);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editing, setEditing] = useState<ExerciseOption | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function save(patch: Record<string, string>) {
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
      setToast({ message: "Saved" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const result = await api<{ imported: number; skipped: number }>("/api/import", {
        method: "POST",
        body: text,
      });
      setToast({
        message: `Imported ${result.imported} entries${result.skipped ? `, skipped ${result.skipped} duplicates` : ""}`,
      });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const custom = exercises.filter((e) => e.isCustom);

  return (
    <div className="pb-6">
      <h1 className="pt-4 pb-3 text-lg font-semibold">Settings</h1>

      <Section title="Units and time">
        <Field label="Weight units">
          <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
            {(["kg", "lb"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setUnits(value);
                  save({ units: value });
                }}
                className="rounded-md py-2 text-sm font-medium uppercase"
                style={{
                  background: units === value ? "var(--surface)" : "transparent",
                  color: units === value ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Timezone"
          hint="Decides where one day ends and the next begins. Defaults to the container's TZ."
        >
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            onBlur={() => timezone !== initial.timezone && save({ timezone })}
            placeholder="Europe/Berlin"
            className="w-full rounded-lg px-3 py-2.5 text-base"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </Field>
      </Section>

      <Section title="Voice entry">
        <Field
          label="OpenRouter API key"
          hint={
            hasKey
              ? "A key is configured. Type a new one to replace it, or clear it below."
              : "Needed for voice entry. Manual logging works without it."
          }
        >
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? "••••••••••••" : "sk-or-v1-..."}
            autoComplete="off"
            className="w-full rounded-lg px-3 py-2.5 text-base"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={apiKey.trim() === "" || busy}
              onClick={async () => {
                await save({ openrouterKey: apiKey.trim() });
                setApiKey("");
                setHasKey(true);
              }}
              className="flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
            >
              Save key
            </button>
            {hasKey && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  await save({ openrouterKey: "" });
                  setHasKey(false);
                }}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                Clear
              </button>
            )}
          </div>
        </Field>

        <Field
          label="Model"
          hint="Only models that support structured output are listed — the rest cannot return parseable entries."
        >
          <ModelPicker
            value={model}
            onChange={(id) => {
              setModel(id);
              save({ openrouterModel: id });
            }}
          />
        </Field>
      </Section>

      <Section title={`Exercises (${exercises.length})`}>
        <p className="mb-2 text-xs text-dim">
          {custom.length > 0
            ? `${custom.length} added by you. Tap any movement to adjust which muscles it counts toward.`
            : "Tap a movement to adjust which muscles it counts toward."}
        </p>
        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
          {exercises.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => setEditing(exercise)}
              className="rounded-full px-3 py-1.5 text-sm"
              style={{
                background: "var(--surface-2)",
                border: `1px solid ${exercise.isCustom ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {exercise.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Your data">
        <p className="mb-3 text-xs text-dim">
          The export contains your entries and the exercise catalogue with its muscle weightings —
          everything needed to rebuild the app's numbers. Your API key is never included.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href="/api/export"
            download
            className="block rounded-lg py-2.5 text-center text-sm font-semibold"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            Export everything (JSON)
          </a>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            Import from a backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFile(file);
            }}
          />
          <p className="text-xs text-dim">
            Importing adds to what is already here and skips entries it recognises, so re-importing
            the same file will not double your history.
          </p>
        </div>
      </Section>

      <MuscleEditor
        exercise={editing}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          setToast({ message });
          router.refresh();
        }}
        onError={(message) => setToast({ message, tone: "error" })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function MuscleEditor({
  exercise,
  onClose,
  onSaved,
  onError,
}: {
  exercise: ExerciseOption | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed the editor the first time each exercise is opened.
  if (exercise && loadedFor !== exercise.id) {
    setWeights(Object.fromEntries(exercise.muscles.map((m) => [m.muscle, m.weight])));
    setLoadedFor(exercise.id);
  }

  async function save() {
    if (!exercise) return;
    const muscles = Object.entries(weights)
      .filter(([, weight]) => weight > 0)
      .map(([muscle, weight]) => ({ muscle, weight }));

    if (muscles.length === 0) {
      onError("Pick at least one muscle — otherwise the entry can never show up anywhere.");
      return;
    }

    try {
      await api(`/api/exercises/${exercise.id}`, {
        method: "PATCH",
        body: JSON.stringify({ muscles }),
      });
      onSaved(`Updated ${exercise.name}`);
    } catch (error) {
      onError((error as Error).message);
    }
  }

  return (
    <Sheet open={exercise !== null} title={exercise?.name ?? ""} onClose={onClose}>
      <p className="mb-3 text-xs text-dim">
        How much one set counts toward each muscle: primary, secondary, or stabiliser.
      </p>
      <ul className="flex flex-col gap-1.5">
        {MUSCLES.map((muscle) => {
          const value = weights[muscle.slug] ?? 0;
          return (
            <li key={muscle.slug} className="flex items-center justify-between gap-2">
              <span className="text-sm">{muscleLabel(muscle.slug)}</span>
              <div className="flex gap-1">
                {[
                  { weight: 0, label: "—" },
                  { weight: 0.25, label: "Stab" },
                  { weight: 0.5, label: "2nd" },
                  { weight: 1, label: "1st" },
                ].map((option) => (
                  <button
                    key={option.weight}
                    type="button"
                    onClick={() =>
                      setWeights((current) => ({ ...current, [muscle.slug]: option.weight }))
                    }
                    className="rounded-md px-2 py-1 text-xs font-medium"
                    style={{
                      background: value === option.weight ? "var(--accent)" : "var(--surface-2)",
                      color: value === option.weight ? "var(--accent-contrast)" : "var(--text-dim)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={save}
        className="mt-4 w-full rounded-xl py-3 text-base font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      >
        Save mapping
      </button>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="surface flex flex-col gap-4 rounded-xl p-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
    </div>
  );
}
