"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client";
import type { Units } from "@/lib/format";
import type { LocalDate } from "@/lib/dates";
import { resolvePerformedAt } from "@/lib/parse-helpers";
import { ManualForm, type ManualDraft } from "./ManualForm";
import { VoiceTab } from "./VoiceTab";
import type { ExerciseOption } from "./types";

export function QuickAdd({
  open,
  date,
  initialExerciseId,
  units,
  exercises,
  recentIds,
  hasKey,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  date: LocalDate;
  /** Preselected movement, when the sheet was opened from the suggestion bar. */
  initialExerciseId?: string;
  units: Units;
  exercises: ExerciseOption[];
  recentIds: string[];
  hasKey: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  // A preselected movement is a manual-tab thing; opening on Voice would throw
  // the suggestion away at the moment the user acted on it.
  const [tab, setTab] = useState<"voice" | "manual">(hasKey ? "voice" : "manual");
  const [busy, setBusy] = useState(false);

  async function saveManual(draft: ManualDraft) {
    setBusy(true);
    try {
      const { performedTime, ...fields } = draft;
      await api("/api/entries", {
        method: "POST",
        body: JSON.stringify({
          ...fields,
          // A stated time is sent as the digits typed and resolved server-side
          // in the app's zone. With none stated the old behaviour stands: now
          // when logging today, midday when back-filling.
          ...(performedTime
            ? { performedTime }
            : { performedAt: resolvePerformedAt(date, null).toISOString() }),
          localDate: date,
          source: "manual",
        }),
      });
      onSaved("Logged");
      onClose();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Log a snack" onClose={onClose}>
      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-lg p-1"
        style={{ background: "var(--surface-2)" }}
        role="tablist"
      >
        {(["voice", "manual"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            type="button"
            onClick={() => setTab(value)}
            className="tap rounded-md py-2 text-sm font-medium capitalize transition-colors"
            style={{
              background: tab === value ? "var(--surface)" : "transparent",
              color: tab === value ? "var(--text)" : "var(--text-dim)",
            }}
          >
            {value === "voice" ? "Say it" : "Manual"}
          </button>
        ))}
      </div>

      {tab === "voice" ? (
        <VoiceTab
          date={date}
          units={units}
          hasKey={hasKey}
          onSaved={(message) => {
            onSaved(message);
            onClose();
          }}
          onError={onError}
        />
      ) : (
        <ManualForm
          // Remount when the suggestion changes, so the preselected movement
          // actually reaches the form's initial state rather than being
          // ignored by a component that is already mounted.
          key={initialExerciseId ?? "blank"}
          exercises={exercises}
          recentIds={recentIds}
          units={units}
          initial={initialExerciseId ? { exerciseId: initialExerciseId } : undefined}
          submitLabel="Log it"
          onSubmit={saveManual}
          busy={busy}
        />
      )}
    </Sheet>
  );
}

export { ManualForm } from "./ManualForm";
export type { ExerciseOption } from "./types";
