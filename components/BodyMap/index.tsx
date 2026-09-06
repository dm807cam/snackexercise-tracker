"use client";

import { useState } from "react";
import { type BodyView, muscleLabel, type MuscleSlug } from "@/lib/muscles";
import { shadeIntensity, type MuscleTotals } from "@/lib/scoring";
import {
  BACK_NEUTRAL,
  BACK_REGIONS,
  type BodyRegion,
  FRONT_NEUTRAL,
  FRONT_REGIONS,
  VIEWBOX,
} from "./paths";

interface BodyMapProps {
  /** Effective sets per muscle for the period being shown. */
  load: Partial<MuscleTotals>;
  /**
   * Value that counts as "fully worked". A fixed reference keeps shading
   * comparable between days, instead of every day re-normalising to its own
   * maximum and making one easy set look like a hard session.
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
      <div className="flex items-start justify-center gap-1">
        <Figure view="front" load={load} reference={reference} active={active} onSelect={onSelect} onPeek={setPeek} />
        <Figure view="back" load={load} reference={reference} active={active} onSelect={onSelect} onPeek={setPeek} />
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
          <span className="text-xs text-dim">Tap a muscle for detail</span>
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
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
  const neutral = view === "front" ? FRONT_NEUTRAL : BACK_NEUTRAL;

  return (
    <figure className="m-0 min-w-0 flex-1">
      <svg
        viewBox={VIEWBOX}
        className="h-auto w-full"
        role="img"
        aria-label={`${view === "front" ? "Front" : "Back"} view of trained muscles`}
      >
        {neutral.map((points, i) => (
          <polygon key={i} points={points} fill="var(--muscle-empty)" opacity={0.6} />
        ))}

        {regions.map((region) => (
          <Region
            key={region.region}
            region={region}
            load={load}
            reference={reference}
            active={active}
            onSelect={onSelect}
            onPeek={onPeek}
          />
        ))}
      </svg>
      <figcaption className="mt-0.5 text-center text-[11px] uppercase tracking-wide text-dim">
        {view}
      </figcaption>
    </figure>
  );
}

function Region({
  region,
  load,
  reference,
  active,
  onSelect,
  onPeek,
}: {
  region: BodyRegion;
  load: Partial<MuscleTotals>;
  reference: number;
  active: MuscleSlug | null;
  onSelect?: (muscle: MuscleSlug | null) => void;
  onPeek: (muscle: MuscleSlug | null) => void;
}) {
  // Where a drawn area stands for more than one taxonomy muscle, shade it by
  // the hardest-worked of them. Summing would double-count a movement that
  // credits both (a row hits lats and mid-back in the same set, but the area
  // still only did that many sets of work).
  const values = region.muscles.map((m) => load[m] ?? 0);
  const value = Math.max(0, ...values);
  const intensity = shadeIntensity(value, reference);

  // Selecting reports the muscle that actually earned the shading.
  const primary = region.muscles[values.indexOf(value)] ?? region.muscles[0];
  const isActive = active !== null && region.muscles.includes(active);

  const label = region.muscles.map((m) => muscleLabel(m)).join(" / ");

  function toggle() {
    const next = isActive ? null : primary;
    onPeek(next);
    onSelect?.(next);
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${formatSets(value)} effective sets`}
      className="cursor-pointer outline-none"
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      }}
      onMouseEnter={() => onPeek(primary)}
      onMouseLeave={() => onPeek(null)}
    >
      {region.points.map((points, i) => (
        <polygon key={`base-${i}`} points={points} fill="var(--muscle-empty)" />
      ))}
      {region.points.map((points, i) => (
        <polygon
          key={`fill-${i}`}
          points={points}
          fill="var(--accent)"
          fillOpacity={intensity}
          stroke={isActive ? "var(--text)" : "var(--muscle-outline)"}
          strokeWidth={isActive ? 0.9 : 0.3}
          strokeLinejoin="round"
          style={{ transition: "fill-opacity 180ms ease, stroke-width 120ms ease" }}
        />
      ))}
    </g>
  );
}

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
