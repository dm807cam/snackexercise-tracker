"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { EFFORT_LEVELS, effortHint, effortLabel, ratesEffort, type Effort } from "@/lib/effort";
import { equipmentLabel } from "@/lib/snack/equipment";
import {
  blockAt,
  formatClock,
  freshTallies,
  resultsFrom,
  scriptFor,
  targetLabel,
  withoutBlock,
  type BlockKey,
  type Step,
  type Tally,
} from "@/lib/snack/script";
import type { SnackBlock, SnackPlan } from "@/lib/snack/types";
import type { SnackView } from "@/lib/snack/service";
import { cue, useCountdown, useWakeLock } from "./useCountdown";

interface Progress {
  steps: Step[];
  index: number;
  tallies: [BlockKey, Tally][];
}

function storageKey(id: string) {
  return `snack-progress:${id}`;
}

function loadProgress(id: string): Progress | null {
  try {
    const raw = sessionStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

/**
 * The guided player: one thing on screen at a time, in the order a coach would
 * call it — this set, rest, the next set, the finisher — then one summary
 * screen to correct reps and say how hard it was, and one tap to log it.
 *
 * Every set is a single tap. Timers run against a deadline, the screen stays
 * on, and every change of phase buzzes and beeps, so a phone lying on a hotel
 * carpet is enough. Progress survives a reload for the rest of the session.
 */
export function SnackPlayer({
  snack,
  onClose,
  onFinished,
  onError,
}: {
  snack: SnackView;
  onClose: () => void;
  onFinished: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [plan, setPlan] = useState<SnackPlan>(snack.plan);
  const restored = useMemo(() => loadProgress(snack.id), [snack.id]);
  const [steps, setSteps] = useState<Step[]>(() => restored?.steps ?? scriptFor(snack.plan));
  const [index, setIndex] = useState(() => restored?.index ?? 0);
  const [tallies, setTallies] = useState<Map<BlockKey, Tally>>(
    () => new Map(restored?.tallies ?? [...freshTallies(snack.plan)]),
  );
  const [efforts, setEfforts] = useState<Map<BlockKey, Effort | null>>(new Map());
  const [summary, setSummary] = useState(steps.length === 0);
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);

  useWakeLock(!summary);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(snack.id), JSON.stringify({ steps, index, tallies: [...tallies] }));
    } catch {
      // Private browsing: progress just does not survive a reload.
    }
  }, [snack.id, steps, index, tallies]);

  const step = steps[index];

  function advance() {
    if (index + 1 >= steps.length) {
      cue("done");
      setSummary(true);
    } else {
      setIndex(index + 1);
    }
  }

  function record(key: BlockKey, change: Partial<Tally> & { addSets?: number }) {
    setTallies((current) => {
      const next = new Map(current);
      const tally = next.get(key);
      if (!tally) return current;
      const { addSets = 0, ...rest } = change;
      next.set(key, { ...tally, ...rest, setsDone: tally.setsDone + addSets });
      return next;
    });
  }

  function skipBlock(key: BlockKey) {
    record(key, { skipped: true });
    const remaining = withoutBlock(steps, index, key);
    setSteps(remaining);
    if (index >= remaining.length) {
      setSummary(true);
    }
  }

  async function swap(key: BlockKey) {
    setBusy(true);
    try {
      const { snack: updated } = await api<{ snack: SnackView }>(`/api/snacks/${snack.id}/swap`, {
        method: "POST",
        body: JSON.stringify({ block: key }),
      });
      setPlan(updated.plan);
      const block = blockAt(updated.plan, key);
      if (block) {
        setTallies((current) => {
          const next = new Map(current);
          next.set(key, {
            setsDone: 0,
            reps: block.kind === "reps" ? block.reps : null,
            seconds: block.kind === "time" ? block.seconds : null,
            weightKg: block.weightKg,
            skipped: false,
          });
          return next;
        });
      }
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const results = resultsFrom(plan, tallies, efforts);
      const { entries } = await api<{ entries: unknown[] }>(`/api/snacks/${snack.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ results }),
      });
      sessionStorage.removeItem(storageKey(snack.id));
      const sets = results.filter((r) => r.outcome === "done").reduce((n, r) => n + r.sets, 0);
      onFinished(entries.length > 0 ? `Snack logged — ${sets} ${sets === 1 ? "set" : "sets"}` : "Nothing to log");
    } catch (error) {
      onError((error as Error).message);
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      await api(`/api/snacks/${snack.id}/skip`, { method: "POST" });
      sessionStorage.removeItem(storageKey(snack.id));
      onClose();
    } catch (error) {
      onError((error as Error).message);
      setBusy(false);
    }
  }

  const anythingDone = [...tallies.values()].some((t) => t.setsDone > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Snack: ${plan.headline}`}
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: "var(--bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{plan.headline}</p>
          {!summary && (
            <p className="text-xs text-dim">
              Step {Math.min(index + 1, steps.length)} of {steps.length}
              {plan.contextName ? ` · ${plan.contextName}` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Stop the snack"
          onClick={() => (summary ? discard() : setConfirmStop(true))}
          className="tap grid place-items-center rounded-full"
          style={{ color: "var(--text-dim)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div
        className="mx-auto h-1 w-full max-w-lg px-4"
        aria-hidden
      >
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div
            className="h-1 rounded-full"
            style={{
              width: `${summary ? 100 : Math.round((index / Math.max(1, steps.length)) * 100)}%`,
              background: "var(--accent)",
              transition: "width 300ms ease",
            }}
          />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-y-auto px-4 py-4">
        {summary ? (
          <Summary
            plan={plan}
            tallies={tallies}
            efforts={efforts}
            onReps={(key, value) => record(key, { reps: value })}
            onSeconds={(key, value) => record(key, { seconds: value })}
            onEffort={(key, value) => setEfforts((current) => new Map(current).set(key, value))}
          />
        ) : step ? (
          <StepView
            key={`${index}-${"block" in step ? String(step.block) : "rest"}-${plan.blocks.map((b) => b.exerciseId).join()}`}
            step={step}
            plan={plan}
            tallies={tallies}
            busy={busy}
            onSetDone={(key, change) => {
              record(key, { ...change, addSets: 1 });
              advance();
            }}
            onBlockDone={(key, change) => {
              record(key, change);
              advance();
            }}
            onRestDone={advance}
            onSkip={skipBlock}
            onSwap={swap}
            onReps={(key, value) => record(key, { reps: value })}
          />
        ) : null}
      </main>

      {summary && (
        <footer className="mx-auto flex w-full max-w-lg gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={save}
            disabled={busy || !anythingDone}
            className="flex-1 rounded-xl py-3 text-base font-semibold disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
          >
            {busy ? "Saving…" : "Log it"}
          </button>
          <button
            type="button"
            onClick={discard}
            disabled={busy}
            className="tap rounded-xl px-4 text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            Discard
          </button>
        </footer>
      )}

      {confirmStop && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgb(0 0 0 / 0.45)" }}>
          <div className="w-full max-w-lg rounded-t-2xl p-4" style={{ background: "var(--surface)" }} role="alertdialog" aria-label="Stop here?">
            <p className="mb-3 text-base font-semibold">Stop here?</p>
            <div className="flex flex-col gap-2">
              {anythingDone && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmStop(false);
                    setSummary(true);
                  }}
                  className="rounded-xl py-3 text-base font-semibold"
                  style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                >
                  Log what I did
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmStop(false)}
                className="rounded-xl py-3 text-base"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={discard}
                className="rounded-xl py-3 text-base"
                style={{ color: "var(--danger)" }}
              >
                Discard this snack
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockHeader({ block, subtitle }: { block: SnackBlock; subtitle?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-dim">{subtitle ?? block.why}</p>
      <h2 className="mt-1 text-2xl font-semibold">{block.name}</h2>
      {block.progressedFrom && (
        <p className="mt-1 text-xs text-dim">A step up from {block.progressedFrom}, which has stopped moving.</p>
      )}
      {block.equipment.length > 0 && (
        <p className="mt-1 text-xs text-dim">Using: {block.equipment.map(equipmentLabel).join(", ").toLowerCase()}</p>
      )}
    </div>
  );
}

function Cues({ block }: { block: SnackBlock }) {
  if (block.cues.length === 0) return null;
  return (
    <ul className="mt-4 flex flex-col gap-1.5 text-sm text-dim">
      {block.cues.map((line) => (
        <li key={line} className="flex gap-2">
          <span aria-hidden>·</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function BigButton({ onClick, children, disabled = false }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl py-4 text-lg font-semibold disabled:opacity-50"
      style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
    >
      {children}
    </button>
  );
}

function StepView(props: {
  step: Step;
  plan: SnackPlan;
  tallies: ReadonlyMap<BlockKey, Tally>;
  busy: boolean;
  onSetDone: (key: BlockKey, change: Partial<Tally>) => void;
  onBlockDone: (key: BlockKey, change: Partial<Tally> & { addSets?: number }) => void;
  onRestDone: () => void;
  onSkip: (key: BlockKey) => void;
  onSwap: (key: BlockKey) => void;
  onReps: (key: BlockKey, value: number) => void;
}) {
  const { step } = props;
  if (step.type === "rest") return <RestStep step={step} onDone={props.onRestDone} />;
  const block = blockAt(props.plan, step.block);
  if (!block) return null;
  const tally = props.tallies.get(step.block);

  const actions = (
    <div className="mt-3 flex gap-2">
      {block.role === "strength" && (tally?.setsDone ?? 0) === 0 && (
        <button
          type="button"
          disabled={props.busy}
          onClick={() => props.onSwap(step.block)}
          className="tap flex-1 rounded-xl text-sm disabled:opacity-50"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          Swap for something else
        </button>
      )}
      <button
        type="button"
        disabled={props.busy}
        onClick={() => props.onSkip(step.block)}
        className="tap flex-1 rounded-xl text-sm disabled:opacity-50"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        Skip this one
      </button>
    </div>
  );

  if (step.type === "intervals") {
    return (
      <>
        <IntervalsStep step={step} block={block} onDone={(rounds) => props.onBlockDone(step.block, {
          addSets: rounds,
          ...(block.kind === "time" ? { seconds: step.workSec } : {}),
        })} />
        {actions}
      </>
    );
  }
  if (step.type === "steady") {
    return (
      <>
        <SteadyStep step={step} block={block} onDone={(seconds) => props.onBlockDone(step.block, { addSets: 1, seconds })} />
        {actions}
      </>
    );
  }

  return (
    <>
      <SetStep
        block={block}
        tally={tally}
        round={step.round}
        rounds={step.rounds}
        onReps={(value) => props.onReps(step.block, value)}
        onDone={(change) => props.onSetDone(step.block, change)}
      />
      {actions}
    </>
  );
}

function SetStep({
  block,
  tally,
  round,
  rounds,
  onReps,
  onDone,
}: {
  block: SnackBlock;
  tally: Tally | undefined;
  round: number;
  rounds: number;
  onReps: (value: number) => void;
  onDone: (change: Partial<Tally>) => void;
}) {
  const subtitle = rounds > 1 ? `Set ${round} of ${rounds} · ${block.why}` : block.why;

  if (block.kind === "time") {
    return <HoldStep block={block} subtitle={subtitle} onDone={(seconds) => onDone({ seconds })} />;
  }

  const reps = tally?.reps ?? block.reps ?? 8;
  return (
    <div className="flex flex-1 flex-col">
      <BlockHeader block={block} subtitle={subtitle} />
      <div className="my-8 flex items-center justify-center gap-6">
        <Stepper label="One fewer" onClick={() => onReps(Math.max(1, reps - 1))}>−</Stepper>
        <div className="text-center">
          <p className="text-6xl font-semibold tabular-nums" aria-live="polite">{reps}</p>
          <p className="text-sm text-dim">
            reps{block.unilateral ? " each side" : ""}
            {block.weightKg ? ` @ ${block.weightKg} kg` : ""}
          </p>
        </div>
        <Stepper label="One more" onClick={() => onReps(reps + 1)}>+</Stepper>
      </div>
      {block.doseNote && <p className="text-center text-xs text-dim">{block.doseNote}</p>}
      <Cues block={block} />
      <div className="mt-auto pt-6">
        <BigButton onClick={() => { cue("rest"); onDone({ reps }); }}>Done</BigButton>
      </div>
    </div>
  );
}

function Stepper({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-14 w-14 place-items-center rounded-full text-2xl"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {children}
    </button>
  );
}

/** A timed hold — both sides in turn when the movement is one-sided. */
function HoldStep({ block, subtitle, onDone }: { block: SnackBlock; subtitle: string; onDone: (seconds: number) => void }) {
  const sides = block.unilateral ? 2 : 1;
  const [side, setSide] = useState(0);
  return (
    <div className="flex flex-1 flex-col">
      <BlockHeader block={block} subtitle={subtitle} />
      {/* Keyed by side, so the second side gets a fresh clock that starts itself. */}
      <HoldClock
        key={side}
        block={block}
        autoStart={side > 0}
        sideLabel={sides > 1 ? (side === 0 ? "first side" : "other side") : null}
        onFinish={(seconds) => {
          if (side + 1 < sides) {
            cue("go");
            setSide(side + 1);
          } else {
            cue("rest");
            onDone(seconds);
          }
        }}
      />
    </div>
  );
}

function HoldClock({
  block,
  autoStart,
  sideLabel,
  onFinish,
}: {
  block: SnackBlock;
  autoStart: boolean;
  sideLabel: string | null;
  onFinish: (seconds: number) => void;
}) {
  const seconds = block.seconds ?? 30;
  const timer = useCountdown(seconds, { autoStart, onDone: () => onFinish(seconds) });
  return (
    <>
      <div className="my-8 text-center">
        <p className="text-6xl font-semibold tabular-nums" aria-live="polite">
          {formatClock(timer.remainingSec)}
        </p>
        <p className="text-sm text-dim">
          {targetLabel(block)}
          {sideLabel && ` · ${sideLabel}`}
        </p>
      </div>
      {block.doseNote && <p className="text-center text-xs text-dim">{block.doseNote}</p>}
      <Cues block={block} />
      <div className="mt-auto flex flex-col gap-2 pt-6">
        {timer.running ? (
          <BigButton onClick={timer.pause}>Pause</BigButton>
        ) : (
          <BigButton onClick={() => { cue("go"); timer.start(); }}>
            {timer.elapsedSec > 0 ? "Resume" : "Start the clock"}
          </BigButton>
        )}
        {timer.elapsedSec > 0 && (
          <button
            type="button"
            onClick={() => onFinish(Math.max(5, Math.round(timer.elapsedSec / 5) * 5))}
            className="tap rounded-xl text-sm text-dim"
          >
            Stop here and count it
          </button>
        )}
      </div>
    </>
  );
}

function RestStep({ step, onDone }: { step: Extract<Step, { type: "rest" }>; onDone: () => void }) {
  const timer = useCountdown(step.seconds, {
    autoStart: true,
    onDone: () => {
      cue("go");
      onDone();
    },
  });
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-xs uppercase tracking-wide text-dim">{step.betweenRounds ? "Rest" : "Next up"}</p>
      <p className="mt-2 text-7xl font-semibold tabular-nums" aria-live="polite">
        {formatClock(timer.remainingSec)}
      </p>
      <p className="mt-3 text-lg">{step.upNext}</p>
      <div className="mt-auto w-full pt-6">
        <BigButton onClick={() => { cue("go"); onDone(); }}>Skip rest</BigButton>
      </div>
    </div>
  );
}

function IntervalsStep({
  step,
  block,
  onDone,
}: {
  step: Extract<Step, { type: "intervals" }>;
  block: SnackBlock;
  onDone: (rounds: number) => void;
}) {
  const cycle = step.workSec + step.easySec;
  const total = cycle * step.rounds;
  const timer = useCountdown(total, { onDone: () => { cue("done"); onDone(step.rounds); } });
  const elapsed = Math.min(total, Math.max(0, timer.elapsedSec));
  const round = Math.min(step.rounds, Math.floor(elapsed / cycle) + 1);
  const inCycle = elapsed - (round - 1) * cycle;
  const working = inCycle < step.workSec;
  const phaseLeft = working ? step.workSec - inCycle : cycle - inCycle;

  // A cue at every change of phase.
  const phase = useRef<string>("");
  useEffect(() => {
    if (!timer.running) return;
    const now = `${round}-${working ? "work" : "easy"}`;
    if (phase.current && phase.current !== now) cue(working ? "go" : "rest");
    phase.current = now;
  }, [round, working, timer.running]);

  const target = block.kind === "reps" ? `${block.reps} reps` : "hard";
  // Rounds whose work period is over; a round cut short still counts once.
  const completed = Math.max(1, round - (working ? 1 : 0));
  return (
    <div className="flex flex-1 flex-col">
      <BlockHeader block={block} />
      <div className="my-8 text-center">
        <p className="text-sm uppercase tracking-wide" style={{ color: working ? "var(--cardio)" : "var(--text-dim)" }}>
          {timer.elapsedSec <= 0 ? `${step.rounds} rounds, every minute` : working ? `Go — ${target}` : "Easy"}
        </p>
        <p className="text-7xl font-semibold tabular-nums" aria-live="polite">
          {formatClock(timer.elapsedSec <= 0 ? step.workSec : phaseLeft)}
        </p>
        <p className="text-sm text-dim">Round {round} of {step.rounds}</p>
      </div>
      <Cues block={block} />
      <div className="mt-auto flex flex-col gap-2 pt-6">
        {timer.running ? (
          <BigButton onClick={timer.pause}>Pause</BigButton>
        ) : (
          <BigButton onClick={() => { cue("go"); timer.start(); }}>{timer.elapsedSec > 0 ? "Resume" : "Go"}</BigButton>
        )}
        {timer.elapsedSec > 0 && (
          <button
            type="button"
            onClick={() => onDone(completed)}
            className="tap rounded-xl text-sm text-dim"
          >
            End here — count {completed} {completed === 1 ? "round" : "rounds"}
          </button>
        )}
      </div>
    </div>
  );
}

function SteadyStep({
  step,
  block,
  onDone,
}: {
  step: Extract<Step, { type: "steady" }>;
  block: SnackBlock;
  onDone: (seconds: number) => void;
}) {
  const timer = useCountdown(step.seconds, { onDone: () => { cue("done"); onDone(step.seconds); } });
  return (
    <div className="flex flex-1 flex-col">
      <BlockHeader block={block} />
      <div className="my-8 text-center">
        <p className="text-7xl font-semibold tabular-nums" aria-live="polite">{formatClock(timer.remainingSec)}</p>
        <p className="text-sm text-dim">{block.doseNote}</p>
      </div>
      <Cues block={block} />
      <div className="mt-auto flex flex-col gap-2 pt-6">
        {timer.running ? (
          <BigButton onClick={timer.pause}>Pause</BigButton>
        ) : (
          <BigButton onClick={() => { cue("go"); timer.start(); }}>{timer.elapsedSec > 0 ? "Resume" : "Go"}</BigButton>
        )}
        {timer.elapsedSec > 0 && (
          <button
            type="button"
            onClick={() => onDone(Math.max(30, Math.round(timer.elapsedSec / 30) * 30))}
            className="tap rounded-xl text-sm text-dim"
          >
            Done — count {Math.max(1, Math.round(timer.elapsedSec / 60))} min
          </button>
        )}
      </div>
    </div>
  );
}

function Summary({
  plan,
  tallies,
  efforts,
  onReps,
  onSeconds,
  onEffort,
}: {
  plan: SnackPlan;
  tallies: ReadonlyMap<BlockKey, Tally>;
  efforts: ReadonlyMap<BlockKey, Effort | null>;
  onReps: (key: BlockKey, value: number) => void;
  onSeconds: (key: BlockKey, value: number) => void;
  onEffort: (key: BlockKey, value: Effort | null) => void;
}) {
  const rows: [BlockKey, SnackBlock][] = [
    ...plan.blocks.map((block, index) => [index, block] as [BlockKey, SnackBlock]),
    ...(plan.finisher ? [["finisher", plan.finisher] as [BlockKey, SnackBlock]] : []),
  ];
  return (
    <div>
      <h2 className="text-2xl font-semibold">Nice. Anything to correct?</h2>
      <p className="mt-1 text-sm text-dim">
        Say how hard it was and the next snack is dosed from it. Leave it blank and it counts as a hard set.
      </p>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map(([key, block]) => {
          const tally = tallies.get(key);
          if (!tally) return null;
          const done = tally.setsDone > 0 && !tally.skipped;
          return (
            <li key={String(key)} className="surface rounded-xl p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{block.name}</span>
                <span className="text-sm text-dim">
                  {done ? `${tally.setsDone} ${tally.setsDone === 1 ? (block.role === "cardio" && block.easySeconds != null ? "round" : "set") : block.role === "cardio" && block.easySeconds != null ? "rounds" : "sets"}` : "skipped"}
                </span>
              </div>
              {done && block.kind === "reps" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-dim">Reps per set{block.unilateral ? " (each side)" : ""}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    value={tally.reps ?? ""}
                    onChange={(e) => onReps(key, Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-lg px-2 py-1 text-base tabular-nums"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  />
                </label>
              )}
              {done && block.kind === "time" && block.role === "strength" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-dim">Seconds per set</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={3600}
                    value={tally.seconds ?? ""}
                    onChange={(e) => onSeconds(key, Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-lg px-2 py-1 text-base tabular-nums"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  />
                </label>
              )}
              {done && ratesEffort(block.cardioBias) && (
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }} role="radiogroup" aria-label={`How hard was ${block.name}?`}>
                  {EFFORT_LEVELS.map((level) => {
                    const active = efforts.get(key) === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={effortHint(level)}
                        onClick={() => onEffort(key, active ? null : level)}
                        className="tap rounded-md py-2 text-sm font-medium"
                        style={{
                          background: active ? "var(--accent)" : "transparent",
                          color: active ? "var(--accent-contrast)" : "var(--text-dim)",
                        }}
                      >
                        {effortLabel(level)}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
