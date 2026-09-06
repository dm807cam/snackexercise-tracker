"use client";

import { useRef, useState } from "react";
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
  onDelete,
  onEdit,
}: {
  entries: DayEntry[];
  units: Units;
  timeZone: string;
  filterMuscle: MuscleSlug | null;
  onDelete: (entry: DayEntry) => void;
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
          onDelete={() => onDelete(entry)}
          onEdit={() => onEdit(entry)}
        />
      ))}
    </ul>
  );
}

/**
 * Swipe an entry left to reveal delete. The row is also a button that opens the
 * edit sheet, so nothing here depends on a gesture a desktop browser lacks.
 */
function EntryRow({
  entry,
  units,
  timeZone,
  onDelete,
  onEdit,
}: {
  entry: DayEntry;
  units: Units;
  timeZone: string;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"undecided" | "horizontal" | "vertical">("undecided");

  const REVEAL = 88;

  return (
    <li className="relative overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${entry.exercise.name}`}
        className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center rounded-r-xl text-sm font-medium"
        style={{ background: "var(--danger)", color: "white" }}
        tabIndex={offset < -20 ? 0 : -1}
      >
        Delete
      </button>

      <div
        className="surface relative flex items-center gap-3 rounded-xl px-3 py-2.5"
        style={{
          transform: `translateX(${offset}px)`,
          transition: start.current ? "none" : "transform 200ms ease",
          touchAction: "pan-y",
        }}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          axis.current = "undecided";
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const dx = e.touches[0].clientX - start.current.x;
          const dy = e.touches[0].clientY - start.current.y;
          if (axis.current === "undecided") {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            axis.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
          }
          if (axis.current !== "horizontal") return;
          // Only leftward swipes reveal anything; clamp so it can't overshoot.
          setOffset(Math.max(-REVEAL, Math.min(0, dx + (offset < 0 ? -REVEAL : 0))));
        }}
        onTouchEnd={() => {
          setOffset((current) => (current < -REVEAL / 2 ? -REVEAL : 0));
          start.current = null;
        }}
      >
        <time
          className="w-11 shrink-0 text-xs tabular-nums text-dim"
          dateTime={entry.performedAt}
        >
          {formatTime(new Date(entry.performedAt), timeZone)}
        </time>

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5">
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
        </button>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${entry.exercise.name}`}
          className="hidden h-8 w-8 shrink-0 place-items-center rounded-full sm:grid"
          style={{ color: "var(--text-dim)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>
    </li>
  );
}
