"use client";

import { formatTime } from "@/lib/dates";
import { formatEntryDetail, type Units } from "@/lib/format";
import { muscleLabel, type MuscleSlug } from "@/lib/muscles";

export interface DayEntry {
  id: string;
  performedAt: string;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  notes: string | null;
  source: string;
  exercise: { id: string; name: string; muscles: { muscle: string; weight: number }[] };
}

export function EntryList({
  entries,
  units,
  timeZone,
  filterMuscle,
  onEdit,
}: {
  entries: DayEntry[];
  units: Units;
  timeZone: string;
  filterMuscle: MuscleSlug | null;
  onEdit: (entry: DayEntry) => void;
}) {
  const visible = filterMuscle
    ? entries.filter((e) => e.exercise.muscles.some((m) => m.muscle === filterMuscle))
    : entries;

  if (entries.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-dim">
        Nothing logged yet.
        <br />
        Tap <span style={{ color: "var(--accent)" }}>+</span> after your next snack.
      </p>
    );
  }

  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-dim">
        Nothing for {muscleLabel(filterMuscle!)} on this day.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {visible.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          units={units}
          timeZone={timeZone}
          onEdit={() => onEdit(entry)}
        />
      ))}
    </ul>
  );
}

/**
 * The whole row opens the edit sheet, which is the only place an entry can be
 * deleted. Nothing here removes an entry in one action: a mis-tap in the list
 * costs a sheet you close again, not a training record.
 */
function EntryRow({
  entry,
  units,
  timeZone,
  onEdit,
}: {
  entry: DayEntry;
  units: Units;
  timeZone: string;
  onEdit: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${entry.exercise.name}`}
        className="surface flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left"
      >
        <time
          className="w-11 shrink-0 text-xs tabular-nums text-dim"
          dateTime={entry.performedAt}
        >
          {formatTime(new Date(entry.performedAt), timeZone)}
        </time>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{entry.exercise.name}</span>
            {entry.source === "llm" && (
              <span title="Added by voice" aria-label="Added by voice" className="shrink-0 text-dim">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <rect x="9" y="2.5" width="6" height="11" rx="3" />
                  <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
                </svg>
              </span>
            )}
          </span>
          <span className="block truncate text-sm text-dim">
            {formatEntryDetail(entry, units)}
            {entry.notes ? ` · ${entry.notes}` : ""}
          </span>
        </span>

        {/* Apple's disclosure chevron: this cell opens something. */}
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
    </li>
  );
}
