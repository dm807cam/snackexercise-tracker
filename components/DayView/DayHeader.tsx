"use client";

import { formatDayLabel, type LocalDate } from "@/lib/dates";

export function DayHeader({
  date,
  today,
  onPrevious,
  onNext,
  onToday,
  onClearDay,
  hasEntries,
}: {
  date: LocalDate;
  today: LocalDate;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onClearDay: () => void;
  hasEntries: boolean;
}) {
  const isToday = date === today;
  // There is nothing to log in the future, so don't offer to navigate there.
  const canGoForward = date < today;

  return (
    <header className="flex items-center gap-2 pt-4 pb-3">
      <div className="flex items-center gap-1">
        <NavButton label="Previous day" onClick={onPrevious} direction="left" />
        <NavButton
          label="Next day"
          onClick={onNext}
          direction="right"
          disabled={!canGoForward}
        />
      </div>

      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-lg font-semibold">
          {isToday ? "Today" : formatDayLabel(date)}
        </h1>
        {isToday ? (
          <p className="text-xs text-dim">{formatDayLabel(date)}</p>
        ) : (
          <button
            type="button"
            onClick={onToday}
            className="text-xs underline underline-offset-2"
            style={{ color: "var(--accent)" }}
          >
            Jump to today
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onClearDay}
        disabled={!hasEntries}
        aria-label="Clear this day"
        title="Clear this day"
        className="grid h-9 w-9 place-items-center rounded-full transition-opacity disabled:opacity-25"
        style={{ color: "var(--text-dim)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
        </svg>
      </button>
    </header>
  );
}

function NavButton({
  label,
  onClick,
  direction,
  disabled,
}: {
  label: string;
  onClick: () => void;
  direction: "left" | "right";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full border transition-opacity active:scale-95 disabled:opacity-25"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}
