"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Toast, type ToastState } from "@/components/Toast";
import { MUSCLES, muscleLabel } from "@/lib/muscles";
import type { Units } from "@/lib/format";
import { parseStepCsv } from "@/lib/steps-csv";
import type { StepsMode } from "@/lib/cardio";
import {
  MAX_PER_MUSCLE_TARGET,
  MIN_PER_MUSCLE_TARGET,
  normalisePerMuscleTarget,
} from "@/lib/volume";
import {
  MAX_RESTING_HR,
  MIN_BIRTH_YEAR,
  MIN_RESTING_HR,
  normalisePhysiologyInput,
  type Physiology,
} from "@/lib/intensity";
import {
  GUIDELINE_FLOOR_MET_MIN_PER_WEEK,
  MAX_CARDIO_TARGET,
  MAX_STRENGTH_TARGET,
  MIN_CARDIO_TARGET,
  MIN_STRENGTH_TARGET,
  normaliseTargets,
  presetFor,
  presetTargets,
  type Targets,
} from "@/lib/targets";
import {
  MAX_TARGET_BOUTS,
  MIN_TARGET_BOUTS,
  mergeWindowFor,
  normaliseTargetBouts,
} from "@/lib/spacing";
import type { ExerciseOption } from "@/components/QuickAdd/types";
import { Sheet } from "@/components/Sheet";
import { ModelPicker } from "./ModelPicker";

export function SettingsView({
  initial,
  exercises,
}: {
  initial: {
    units: Units;
    timezone: string;
    model: string;
    hasKey: boolean;
    stepsMode: StepsMode;
    stepBaseline: string;
    resolvedBaseline: number;
    /** Steps that would fill half the daily cardio ring, at the current settings. */
    stepsForHalfRing: number | null;
    dayStartHour: number;
    dayEndHour: number;
    targetBouts: number;
    perMuscleTarget: number;
    targets: Targets;
    physiology: Physiology;
  };
  exercises: ExerciseOption[];
}) {
  const router = useRouter();
  const [units, setUnits] = useState<Units>(initial.units);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [stepsMode, setStepsMode] = useState<StepsMode>(initial.stepsMode);
  const [stepBaseline, setStepBaseline] = useState(initial.stepBaseline);
  const [dayStartHour, setDayStartHour] = useState(initial.dayStartHour);
  const [dayEndHour, setDayEndHour] = useState(initial.dayEndHour);
  const [targetBouts, setTargetBouts] = useState(String(initial.targetBouts));
  // Tracked the way `savedTarget` is, and for the same reason: `initial` only
  // catches up once the router refresh after a save lands.
  const [savedBouts, setSavedBouts] = useState(initial.targetBouts);
  const [perMuscleTarget, setPerMuscleTarget] = useState(String(initial.perMuscleTarget));
  // What is actually stored, tracked here rather than read back off `initial`:
  // that prop only changes once the router refresh after a save has landed, so
  // editing 10 to 12 and back to 10 inside that window suppressed the second
  // save and left 12 in the database under a field reading 10.
  const [savedTarget, setSavedTarget] = useState(initial.perMuscleTarget);
  const [targets, setTargets] = useState(initial.targets);
  // What is actually stored, for the same reason `savedTarget` above tracks it:
  // `initial` only changes once the router refresh after a save lands, so a
  // preset tap followed by typing the old number back inside that window would
  // suppress the second save and leave the field and the database disagreeing.
  const [savedTargets, setSavedTargets] = useState(initial.targets);
  const [birthYear, setBirthYear] = useState(
    initial.physiology.birthYear ? String(initial.physiology.birthYear) : "",
  );
  const [restingHr, setRestingHr] = useState(
    initial.physiology.restingHr ? String(initial.physiology.restingHr) : "",
  );
  const [savedPhysiology, setSavedPhysiology] = useState({
    birthYear: initial.physiology.birthYear ? String(initial.physiology.birthYear) : "",
    restingHr: initial.physiology.restingHr ? String(initial.physiology.restingHr) : "",
  });

  function savePhysiology(patch: { birthYear?: string; restingHr?: string }) {
    // Normalised before storing, and written back into the field, so what the
    // form shows is what the app will actually honour. Saving verbatim left
    // `getPhysiology` silently discarding an out-of-range year under a "Saved"
    // toast.
    const stored = normalisePhysiologyInput(patch);
    if (stored.birthYear !== undefined) setBirthYear(stored.birthYear);
    if (stored.restingHr !== undefined) setRestingHr(stored.restingHr);

    const next = { ...savedPhysiology, ...stored };
    if (
      next.birthYear === savedPhysiology.birthYear &&
      next.restingHr === savedPhysiology.restingHr
    ) {
      return;
    }
    setSavedPhysiology(next);
    save(stored);
  }
  const preset = presetFor(targets);

  function saveTargets(next: Targets) {
    const stored = normaliseTargets(next);
    setTargets(stored);
    if (
      stored.cardioMetMinutesPerWeek === savedTargets.cardioMetMinutesPerWeek &&
      stored.strengthHardSetsPerWeek === savedTargets.strengthHardSetsPerWeek
    ) {
      return;
    }
    setSavedTargets(stored);
    save({
      cardioTarget: String(stored.cardioMetMinutesPerWeek),
      strengthTarget: String(stored.strengthHardSetsPerWeek),
    });
  }
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editing, setEditing] = useState<ExerciseOption | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const stepsInput = useRef<HTMLInputElement>(null);

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
      const result = await api<{ imported: number; skipped: number; metrics: number }>(
        "/api/import",
        { method: "POST", body: text },
      );
      setToast({
        message:
          `Imported ${result.imported} entries` +
          `${result.skipped ? `, skipped ${result.skipped} duplicates` : ""}` +
          `${result.metrics ? `, ${result.metrics} days of steps` : ""}`,
      });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function importSteps(file: File) {
    setBusy(true);
    try {
      const { days, skipped } = parseStepCsv(await file.text());
      if (days.length === 0) {
        setToast({
          message: "No readable rows. The file needs a date column and a steps column.",
          tone: "error",
        });
        return;
      }

      // Chunked: a decade of Health data is more days than one request should
      // carry, and a partial import is recoverable where a rejected one is not.
      let written = 0;
      for (let i = 0; i < days.length; i += 1000) {
        const chunk = days.slice(i, i + 1000);
        await api("/api/metrics", {
          method: "POST",
          body: JSON.stringify({
            days: chunk.map((d) => ({ ...d, source: "import" as const })),
          }),
        });
        written += chunk.length;
      }

      setToast({
        message: `Imported ${written} ${written === 1 ? "day" : "days"} of steps${
          skipped ? `, skipped ${skipped} unreadable ${skipped === 1 ? "row" : "rows"}` : ""
        }`,
      });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
      if (stepsInput.current) stepsInput.current.value = "";
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
                className="tap rounded-md py-2 text-sm font-medium uppercase"
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
          htmlFor="timezone"
          hint="Decides where one day ends and the next begins. Defaults to the container's TZ."
        >
          <input
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            onBlur={() => timezone !== initial.timezone && save({ timezone })}
            placeholder="Europe/Berlin"
            className="w-full rounded-lg px-3 py-3 text-base"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </Field>
      </Section>

      <Section title="Steps and cardio">
        <Field
          label="Count walking toward cardio"
          hint={
            stepsMode === "off"
              ? "Only logged cardio counts. Steps are still recorded and shown."
              : stepsMode === "half"
                ? "Walking above your baseline counts at half weight. It is activity, which is not quite the same as training — the balance marker asks about training."
                : "Walking above your baseline counts in full, the way public health guidelines count it."
          }
        >
          <div
            className="grid grid-cols-3 gap-1 rounded-lg p-1"
            style={{ background: "var(--surface-2)" }}
          >
            {(["off", "half", "full"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStepsMode(value);
                  save({ stepsMode: value });
                }}
                className="tap rounded-md py-2 text-sm font-medium capitalize"
                style={{
                  background: stepsMode === value ? "var(--surface)" : "transparent",
                  color: stepsMode === value ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Step baseline"
          htmlFor="step-baseline"
          hint={`Steps below this are ordinary living rather than training, so they earn no cardio credit. Leave it empty and the app uses the quiet quarter of your own days — currently ${initial.resolvedBaseline.toLocaleString()}.${
            initial.stepsForHalfRing
              ? ` At your current settings about ${initial.stepsForHalfRing.toLocaleString()} steps fills half a day's cardio ring, which is the most walking alone can fill.`
              : ""
          }`}
        >
          <input
            id="step-baseline"
            type="number"
            inputMode="numeric"
            min={0}
            value={stepBaseline}
            onChange={(e) => setStepBaseline(e.target.value)}
            onBlur={() =>
              stepBaseline !== initial.stepBaseline && save({ stepBaseline: stepBaseline.trim() })
            }
            placeholder={`auto (${initial.resolvedBaseline.toLocaleString()})`}
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </Field>

        <Field
          label="Brisk minutes"
          hint="Steps arriving as one daily number are mostly kitchen, corridor and shop, so they are credited as incidental walking. If your phone also reports active or brisk minutes — the Shortcut in the README can send them alongside the step count — those minutes are credited at the brisk rate instead. It is the only thing that lets the app tell 6,000 extra slow steps from 6,000 extra fast ones."
        >
          <p className="text-xs text-dim">
            Sent by the phone automation, or typed on the day itself beside the step count.
          </p>
        </Field>

        <Field
          label="Import step history"
          hint="A CSV with a date column and a steps column — an Apple Health, Google Fit or Fitbit export will do. Several rows for one day are added together."
        >
          <button
            type="button"
            onClick={() => stepsInput.current?.click()}
            disabled={busy}
            className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            Choose a CSV
          </button>
          <input
            ref={stepsInput}
            type="file"
            accept="text/csv,.csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importSteps(file);
            }}
          />
        </Field>
      </Section>

      <Section title="Spreading it out">
        <Field
          label="Waking hours"
          hint="The stretch the spacing score measures a day against. Snacks spread evenly across it score highest; everything crammed into one block scores lowest. Set it to the hours you are actually up — scoring a night-shift worker's 22:00 session as badly timed would just make the number something to ignore."
        >
          <div className="flex items-center gap-2">
            <HourSelect
              id="day-start-hour"
              label="Start of the day"
              value={dayStartHour}
              hours={HOURS.filter((h) => h < dayEndHour)}
              onChange={(value) => {
                setDayStartHour(value);
                save({ dayStartHour: String(value) });
              }}
            />
            <span className="text-sm text-dim">to</span>
            <HourSelect
              id="day-end-hour"
              label="End of the day"
              value={dayEndHour}
              hours={HOURS.slice(1).concat(24).filter((h) => h > dayStartHour)}
              onChange={(value) => {
                setDayEndHour(value);
                save({ dayEndHour: String(value) });
              }}
            />
          </div>
        </Field>

        <Field
          label="Snacks a day to aim for"
          htmlFor="target-bouts"
          hint={`What a full mark is measured against. Five is the default because that is roughly the exercise-snack dose the research uses — three or four short bouts a day. It is deliberately not the dose for breaking up sitting, which is nearer fifteen to twenty-five a day and mostly consists of standing up to make tea: this app can only see what you log, so it scores how well your training was spread, not how much you sat. Raise it if you want to be measured against something stricter.`}
        >
          <input
            id="target-bouts"
            type="number"
            inputMode="numeric"
            min={MIN_TARGET_BOUTS}
            max={MAX_TARGET_BOUTS}
            value={targetBouts}
            onChange={(e) => setTargetBouts(e.target.value)}
            onBlur={() => {
              const stored = normaliseTargetBouts(Number(targetBouts));
              setTargetBouts(String(stored));
              if (stored === savedBouts) return;
              setSavedBouts(stored);
              save({ targetBouts: String(stored) });
            }}
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
          <p className="text-xs text-dim">
            Anything logged within{" "}
            {mergeWindowFor(savedBouts, { startHour: dayStartHour, endHour: dayEndHour })} minutes of
            a snack starting joins it, so three movements at the top of the stairs are one snack and
            not three. That window moves with this number — otherwise a stricter target would be
            unreachable, because the merge would swallow the very breaks it asks for.
          </p>
        </Field>
      </Section>

      <Section title="How hard, not just how much">
        <p className="mb-1 text-xs text-dim">
          Two numbers, entered once. Without them a heart rate is read against a fixed 150 bpm,
          which is about 79% of a 25-year-old&apos;s maximum and 90% of a 60-year-old&apos;s — the
          same reading, very different efforts, and the app scored both the same. Leave them blank
          and nothing already logged changes.
        </p>

        <Field
          label="Year of birth"
          htmlFor="birth-year"
          hint="Sets your predicted maximum heart rate (Tanaka: 208 − 0.7 × age), which is what turns a heart rate into an intensity rather than a bare number."
        >
          <input
            id="birth-year"
            type="number"
            inputMode="numeric"
            min={MIN_BIRTH_YEAR}
            max={new Date().getFullYear()}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            onBlur={() => savePhysiology({ birthYear: birthYear.trim() })}
            placeholder="—"
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </Field>

        <Field
          label="Resting heart rate"
          htmlFor="resting-hr"
          hint="Optional, and better if you have it: with a resting rate the app uses heart-rate reserve, which knows that two people at 130 bpm are not working equally hard if one sits at 45 and the other at 75."
        >
          <input
            id="resting-hr"
            type="number"
            inputMode="numeric"
            min={MIN_RESTING_HR}
            max={MAX_RESTING_HR}
            value={restingHr}
            onChange={(e) => setRestingHr(e.target.value)}
            onBlur={() => savePhysiology({ restingHr: restingHr.trim() })}
            placeholder="—"
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </Field>
      </Section>

      <Section title="Weekly targets">
        <Field
          label="What you are aiming at"
          hint={
            preset === "longevity"
              ? "1,200 MET-minutes of cardio a week — the top of the WHO range, and the bottom of the band where the large cohort studies put the lowest all-cause mortality (Arem 2015; Lee 2022). Strength is unchanged on purpose: the mortality-optimal resistance dose is lower than this, so raising it here would mean moving away from the hypertrophy dose, not toward it."
              : preset === "guideline"
                ? "600 MET-minutes of cardio a week — the WHO minimum, which is 150 min moderate or 75 vigorous. The strength number is a hypertrophy dose rather than a public-health one; the two goals want different amounts, so the app shows which it is measuring."
                : "Your own numbers. The rings, the balance marker and the radar's cardio line all move with them."
          }
        >
          <div className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
            {(["guideline", "longevity", "custom"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={preset === value}
                // "Custom" is a state, not a command: it is what the picker
                // reads when the numbers below have been edited, and tapping it
                // would have nothing to apply.
                disabled={value === "custom"}
                onClick={() => saveTargets(presetTargets(value))}
                className="tap rounded-md py-2 text-sm font-medium capitalize disabled:opacity-100"
                style={{
                  background: preset === value ? "var(--surface)" : "transparent",
                  color: preset === value ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Cardio (MET-minutes a week)"
          htmlFor="cardio-target"
          hint={`150 minutes of moderate work is about 600. The activity guideline is ${GUIDELINE_FLOOR_MET_MIN_PER_WEEK}, and the cardio ring marks it whatever you set here, so passing it is still visible when you are aiming higher. Raising this also means a given run is a smaller share of your week, so the radar's cardio line and the calendar's shading move with it.`}
        >
          <input
            id="cardio-target"
            type="number"
            inputMode="numeric"
            min={MIN_CARDIO_TARGET}
            max={MAX_CARDIO_TARGET}
            step={50}
            value={targets.cardioMetMinutesPerWeek}
            onChange={(e) =>
              setTargets((t) => ({ ...t, cardioMetMinutesPerWeek: Number(e.target.value) }))
            }
            onBlur={() => saveTargets(targets)}
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </Field>

        <Field
          label="Strength (hard sets a week)"
          htmlFor="strength-target"
          hint="A hypertrophy dose, not a public-health one — about 27 is roughly 10 sets per muscle group across the major groups. The mortality curve for resistance work peaks lower than this and turns down past about 130 minutes a week (Momma 2022), so this number serves the physique goal rather than the longevity one, and the app says so rather than averaging them."
        >
          <input
            id="strength-target"
            type="number"
            inputMode="numeric"
            min={MIN_STRENGTH_TARGET}
            max={MAX_STRENGTH_TARGET}
            value={targets.strengthHardSetsPerWeek}
            onChange={(e) =>
              setTargets((t) => ({ ...t, strengthHardSetsPerWeek: Number(e.target.value) }))
            }
            onBlur={() => saveTargets(targets)}
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          />
        </Field>
      </Section>

      <Section title="How much is enough">
        <Field
          label="Hard sets per muscle, per week"
          htmlFor="per-muscle-target"
          hint={`The reference the radar and the "needs attention" list are read against. About 10 is where the hypertrophy dose–response is clearly established; gains continue with diminishing returns to around 20, which is the fainter outer ring. Raise it if you are deliberately running a higher-volume block — the chart should agree with what you are actually aiming at rather than with whoever wrote the default.`}
        >
          <input
            id="per-muscle-target"
            type="number"
            inputMode="numeric"
            min={MIN_PER_MUSCLE_TARGET}
            max={MAX_PER_MUSCLE_TARGET}
            value={perMuscleTarget}
            onChange={(e) => setPerMuscleTarget(e.target.value)}
            onBlur={() => {
              // Normalised here as well as on read, so the field shows the
              // value that was actually stored rather than what was typed.
              const stored = normalisePerMuscleTarget(Number(perMuscleTarget));
              setPerMuscleTarget(String(stored));
              if (stored === savedTarget) return;
              setSavedTarget(stored);
              save({ perMuscleTarget: String(stored) });
            }}
            className="w-full rounded-lg px-3 py-3 text-base tabular-nums"
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
            className="w-full rounded-lg px-3 py-3 text-base"
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
              className="tap flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-40"
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
                className="tap rounded-lg px-3 py-2 text-sm"
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
        <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {exercises.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => setEditing(exercise)}
              className="tap rounded-full px-3 py-2 text-sm"
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
            className="block rounded-lg py-3 text-center text-sm font-semibold"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            Export everything (JSON)
          </a>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="rounded-lg py-3 text-sm font-semibold disabled:opacity-40"
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
      <ul className="flex flex-col gap-2">
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

/** 0..23; the end select adds 24, which means midnight at the end of the day. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function HourSelect({
  id,
  label,
  value,
  hours,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  hours: number[];
  onChange: (value: number) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 rounded-lg px-3 py-3 text-base tabular-nums"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {hours.map((hour) => (
        <option key={hour} value={hour}>
          {String(hour).padStart(2, "0")}:00
        </option>
      ))}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="surface flex flex-col gap-4 rounded-xl p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * The id of the control this labels, where there is exactly one.
   *
   * A real <label> rather than a paragraph, so the control has an accessible
   * name: a bare number input reads as "edit text, blank" to a screen reader,
   * and the words sitting above it are not attached to it in any way a
   * assistive technology can follow. Optional because some fields wrap a group
   * of controls, which carry their own aria-labels.
   */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {htmlFor ? (
        <label className="mb-2 block text-sm font-medium" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <p className="mb-2 text-sm font-medium">{label}</p>
      )}
      {children}
      {hint && <p className="mt-2 text-xs text-dim">{hint}</p>}
    </div>
  );
}
