"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BodyMap } from "@/components/BodyMap";
import { QuickAdd } from "@/components/QuickAdd";
import type { ExerciseOption } from "@/components/QuickAdd/types";
import { Sheet } from "@/components/Sheet";
import { ManualForm, type ManualDraft } from "@/components/QuickAdd/ManualForm";
import { isEffort } from "@/lib/effort";
import { Toast, type ToastState } from "@/components/Toast";
import { api } from "@/lib/client";
import { addDays, formatTime, type LocalDate } from "@/lib/dates";
import { formatSets, type Units } from "@/lib/format";
import type { MuscleSlug } from "@/lib/muscles";
import type { MuscleTotals } from "@/lib/scoring";
import { buildDailyGoal } from "@/lib/daily-goal";
import type { Suggestion } from "@/lib/suggest";
import { DayHeader } from "./DayHeader";
import { DaySpacing, type DaySpacingPayload } from "./DaySpacing";
import { TodayGoal } from "./TodayGoal";
import { NextUp } from "./NextUp";
import { StepsField } from "./StepsField";
import { EntryList, type DayEntry } from "./EntryList";
import { useSwipeDays } from "./useSwipeDays";

export interface DayViewData {
  date: LocalDate;
  entries: DayEntry[];
  muscles: MuscleTotals;
  sets: number;
  reps: number;
  tonnageKg: number;
  steps: number | null;
  cardioMuscles: MuscleTotals;
  metMinutes: number;
  stepMetMinutes: number;
  effectiveSets: number;
  spacing: DaySpacingPayload;
}

export function DayView({
  initial,
  exercises,
  recentIds,
  units,
  timeZone,
  today,
  hasKey,
  suggestion,
}: {
  initial: DayViewData;
  exercises: ExerciseOption[];
  recentIds: string[];
  units: Units;
  /** Resolved on the server, so client and server render identical clock times. */
  timeZone: string;
  today: LocalDate;
  hasKey: boolean;
  /**
   * What to train next. Computed on the server from the 30-day window, and
   * absent when looking at a past day — "you should do this next" is a
   * statement about now, not about a Tuesday in August.
   */
  suggestion: Suggestion | null;
}) {
  const router = useRouter();
  const [day, setDay] = useState(initial);
  const [selected, setSelected] = useState<MuscleSlug | null>(null);
  const [adding, setAdding] = useState(false);
  // The movement the suggestion bar proposed, carried into the log sheet so
  // acting on a suggestion is one tap and not a search.
  const [preselect, setPreselect] = useState<string | null>(null);
  const [editing, setEditing] = useState<DayEntry | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // A server-rendered navigation replaces `initial`; adopt it and drop any
  // muscle filter, which was scoped to the day we just left.
  useEffect(() => {
    setDay(initial);
    setSelected(null);
  }, [initial]);

  const refresh = useCallback(async () => {
    const fresh = await api<DayViewData>(`/api/days/${day.date}`);
    setDay(fresh);
    // Keep the calendar and stats pages honest after a change.
    router.refresh();
  }, [day.date, router]);

  const goto = useCallback(
    (date: LocalDate) => {
      if (date > today) return;
      router.push(`/day/${date}`);
    },
    [router, today],
  );

  const { dragX, handlers } = useSwipeDays({
    onPrevious: () => goto(addDays(day.date, -1)),
    onNext: () => goto(addDays(day.date, 1)),
  });

  async function deleteEntry(entry: DayEntry) {
    try {
      await api(`/api/entries/${entry.id}`, { method: "DELETE" });
      setDay((current) => ({
        ...current,
        entries: current.entries.filter((e) => e.id !== entry.id),
      }));

      setToast({
        message: `Deleted ${entry.exercise.name}`,
        action: {
          label: "Undo",
          onAction: async () => {
            try {
              // Recreate it exactly as it was, original timestamp included, so
              // undo restores the entry rather than logging a new one now.
              await api("/api/entries", {
                method: "POST",
                body: JSON.stringify({
                  exerciseId: entry.exercise.id,
                  performedAt: entry.performedAt,
                  sets: entry.sets,
                  reps: entry.reps,
                  weightKg: entry.weightKg,
                  durationSec: entry.durationSec,
                  distanceM: entry.distanceM,
                  avgHeartRate: entry.avgHeartRate,
                  effort: isEffort(entry.effort) ? entry.effort : null,
                  notes: entry.notes,
                  source: entry.source === "llm" ? "llm" : "manual",
                }),
              });
              await refresh();
            } catch (error) {
              setToast({ message: (error as Error).message, tone: "error" });
            }
          },
        },
      });
      await refresh();
    } catch (error) {
      setToast({ message: (error as Error).message, tone: "error" });
    }
  }

  async function clearDay() {
    if (day.entries.length === 0) return;
    const confirmed = window.confirm(
      `Delete all ${day.entries.length} ${day.entries.length === 1 ? "entry" : "entries"} for this day? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await api(`/api/days/${day.date}`, { method: "DELETE" });
      await refresh();
      setToast({ message: "Day cleared" });
    } catch (error) {
      setToast({ message: (error as Error).message, tone: "error" });
    }
  }

  async function saveEdit(draft: ManualDraft) {
    if (!editing) return;
    try {
      await api(`/api/entries/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          sets: draft.sets,
          reps: draft.reps,
          weightKg: draft.weightKg,
          durationSec: draft.durationSec,
          distanceM: draft.distanceM,
          avgHeartRate: draft.avgHeartRate,
          effort: draft.effort,
          notes: draft.notes,
          // Sent as digits plus the day they belong to; the server resolves
          // them in the app's zone, which the browser may not share.
          ...(draft.performedTime
            ? { performedTime: draft.performedTime, localDate: day.date }
            : {}),
        }),
      });
      setEditing(null);
      await refresh();
      setToast({ message: "Updated" });
    } catch (error) {
      setToast({ message: (error as Error).message, tone: "error" });
    }
  }

  return (
    <div className="pan-y" {...handlers}>
      <DayHeader
        date={day.date}
        today={today}
        onPrevious={() => goto(addDays(day.date, -1))}
        onNext={() => goto(addDays(day.date, 1))}
        onToday={() => goto(today)}
        onClearDay={clearDay}
        hasEntries={day.entries.length > 0}
      />

      {/* Only on today. "How much is left" is a statement about a day that can
          still be changed; on a past day it would be a permanent red mark on a
          Tuesday in August, which is nagging rather than motivation. Computed
          on the client from numbers the day already carries, so it updates the
          moment an entry is logged rather than waiting for a round trip. */}
      {day.date === today && (
        <TodayGoal
          goal={buildDailyGoal({
            effectiveSets: day.effectiveSets,
            metMinutes: day.metMinutes,
            stepMetMinutes: day.stepMetMinutes,
          })}
        />
      )}

      {suggestion && (
        <NextUp
          suggestion={suggestion}
          onPick={(exerciseId) => {
            setPreselect(exerciseId);
            setAdding(true);
          }}
        />
      )}

      <div
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 ? "transform 200ms ease" : "none",
        }}
      >
        <BodyMap
          load={day.muscles}
          cardioLoad={day.cardioMuscles}
          selected={selected}
          onSelect={setSelected}
        />

        {day.entries.length > 0 && (
          <p className="mb-3 text-center text-xs text-dim">
            {day.entries.length} {day.entries.length === 1 ? "entry" : "entries"} ·{" "}
            {formatSets(day.sets)} sets
            {day.tonnageKg > 0 && ` · ${Math.round(day.tonnageKg).toLocaleString()} kg moved`}
            {day.metMinutes > 0 && ` · ${day.metMinutes} MET-min`}
          </p>
        )}

        <DaySpacing spacing={day.spacing} />

        <StepsField
          date={day.date}
          steps={day.steps}
          onSaved={async (steps) => {
            setDay((current) => ({ ...current, steps }));
            router.refresh();
          }}
          onError={(message) => setToast({ message, tone: "error" })}
        />

        <EntryList
          entries={day.entries}
          units={units}
          timeZone={timeZone}
          filterMuscle={selected}
          onEdit={setEditing}
        />
      </div>

      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label="Log a snack"
        className="fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full shadow-lg transition-transform active:scale-95"
        style={{
          bottom: "calc(5rem + env(safe-area-inset-bottom))",
          background: "var(--accent)",
          color: "var(--accent-contrast)",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <QuickAdd
        open={adding}
        date={day.date}
        initialExerciseId={preselect ?? undefined}
        units={units}
        exercises={exercises}
        recentIds={recentIds}
        hasKey={hasKey}
        onClose={() => {
          setAdding(false);
          setPreselect(null);
        }}
        onSaved={async (message) => {
          await refresh();
          setToast({ message });
        }}
        onError={(message) => setToast({ message, tone: "error" })}
      />

      <Sheet open={editing !== null} title="Edit entry" onClose={() => setEditing(null)}>
        {editing && (
          <>
          <ManualForm
            exercises={exercises}
            recentIds={recentIds}
            units={units}
            initial={{
              exerciseId: editing.exercise.id,
              sets: editing.sets,
              reps: editing.reps,
              weightKg: editing.weightKg,
              durationSec: editing.durationSec,
              distanceM: editing.distanceM,
              avgHeartRate: editing.avgHeartRate,
              effort: isEffort(editing.effort) ? editing.effort : null,
              notes: editing.notes,
              performedTime: formatTime(new Date(editing.performedAt), timeZone),
            }}
            submitLabel="Save changes"
            onSubmit={saveEdit}
            busy={false}
          />
          <button
            type="button"
            onClick={() => {
              const entry = editing;
              setEditing(null);
              deleteEntry(entry);
            }}
            className="mt-2 w-full rounded-xl py-3 text-base font-medium"
            style={{ background: "transparent", color: "var(--danger)" }}
          >
            Delete entry
          </button>
          </>
        )}
      </Sheet>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
