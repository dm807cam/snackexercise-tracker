"use client";

import { useMemo, useState } from "react";
import { type BodyView, muscleLabel, type MuscleSlug } from "@/lib/muscles";
import { shadeIntensity, type MuscleTotals } from "@/lib/scoring";
import { BACK_NEUTRAL, BACK_PATHS, FRONT_NEUTRAL, FRONT_PATHS, VIEWBOX } from "./paths";

interface BodyMapProps {
  /** Effective sets per muscle for the period being shown. */
  load: Partial<MuscleTotals>;
  /**
   * Value that counts as "fully worked". Passing a fixed reference keeps the
   * shading comparable between days instead of every day re-normalising to its
   * own maximum, which would make a single easy set look like a hard session.
   */
  reference?: number;
  selected?: MuscleSlug | null;
  onSelect?: (muscle: MuscleSlug | null) => void;
}

export function BodyMap({ load, reference = 6, selected = null, onSelect }: BodyMapProps) {
  // Touch devices have no hover, so a tap both selects and reveals the label.
  const [peek, setPeek] = useState<MuscleSlug | null>(null);
  const active = peek ?? selected;

  const activeValue = active ? (load[active] ?? 0) : 0;

  return (
    <div>
      <div className="flex items-start justify-center gap-2">
        <Figure
          view="front"
          load={load}
          reference={reference}
          active={active}
          onSelect={onSelect}
          onPeek={setPeek}
        />
        <Figure
          view="back"
          load={load}
          reference={reference}
          active={active}
          onSelect={onSelect}
          onPeek={setPeek}
        />
      </div>

      <div className="mt-1 flex h-6 items-center justify-center text-sm">
        {active ? (
          <span>
            <span className="font-medium">{muscleLabel(active)}</span>{" "}
            <span className="text-dim">
              {activeValue > 0 ? `${formatSets(activeValue)} effective sets` : "not trained"}
            </span>
          </span>
        ) : (
          <span className="text-dim text-xs">Tap a muscle for detail</span>
        )}
      </div>
    </div>
  );
}

function Figure({
  view,
  load,
  reference,
  active,
  onSelect,
  onPeek,
}: {
  view: BodyView;
  load: Partial<MuscleTotals>;
  reference: number;
  active: MuscleSlug | null;
  onSelect?: (muscle: MuscleSlug | null) => void;
  onPeek: (muscle: MuscleSlug | null) => void;
}) {
  const paths = view === "front" ? FRONT_PATHS : BACK_PATHS;
  const neutral = view === "front" ? FRONT_NEUTRAL : BACK_NEUTRAL;

  // Group by muscle so both halves of a pair highlight together.
  const grouped = useMemo(() => {
    const map = new Map<MuscleSlug, string[]>();
    for (const p of paths) {
      const list = map.get(p.muscle) ?? [];
      list.push(p.d);
      map.set(p.muscle, list);
    }
    return [...map.entries()];
  }, [paths]);

  return (
    <figure className="m-0 flex-1">
      <svg
        viewBox={VIEWBOX}
        className="h-auto w-full"
        role="img"
        aria-label={`${view === "front" ? "Front" : "Back"} view of trained muscles`}
      >
        {neutral.map((d, i) => (
          <path key={i} d={d} fill="var(--muscle-empty)" opacity={0.75} />
        ))}

        {grouped.map(([muscle, ds]) => {
          const value = load[muscle] ?? 0;
          const intensity = shadeIntensity(value, reference);
          const isActive = active === muscle;

          return (
            <g
              key={muscle}
              role="button"
              tabIndex={0}
              aria-label={`${muscleLabel(muscle)}: ${formatSets(value)} effective sets`}
              className="cursor-pointer outline-none"
              onClick={() => {
                const next = active === muscle ? null : muscle;
                onPeek(next);
                onSelect?.(next);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                const next = active === muscle ? null : muscle;
                onPeek(next);
                onSelect?.(next);
              }}
              onMouseEnter={() => onPeek(muscle)}
              onMouseLeave={() => onPeek(null)}
            >
              {ds.map((d, i) => (
                <path key={`base-${i}`} d={d} fill="var(--muscle-empty)" />
              ))}
              {ds.map((d, i) => (
                <path
                  key={`fill-${i}`}
                  d={d}
                  fill="var(--accent)"
                  fillOpacity={intensity}
                  stroke={isActive ? "var(--text)" : "var(--muscle-outline)"}
                  strokeWidth={isActive ? 1 : 0.4}
                  style={{ transition: "fill-opacity 180ms ease, stroke-width 120ms ease" }}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-0.5 text-center text-[11px] uppercase tracking-wide text-dim">
        {view}
      </figcaption>
    </figure>
  );
}

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
