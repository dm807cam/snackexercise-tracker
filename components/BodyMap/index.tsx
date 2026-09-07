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
   * MET-minutes of cardio per muscle, drawn as an outline rather than a fill.
   * A separate channel on purpose: the fill means resistance work and must go
   * on meaning that, but a figure showing nothing after a 10 km run is its own
   * kind of lie.
   */
  cardioLoad?: Partial<MuscleTotals>;
  /**
   * Value that counts as "fully worked". A fixed reference keeps shading
   * comparable between days, instead of every day re-normalising to its own
   * maximum and making one easy set look like a hard session.
   */
  reference?: number;
  /** MET-minutes that count as "fully worked" for the cardio outline. */
  cardioReference?: number;
  selected?: MuscleSlug | null;
  onSelect?: (muscle: MuscleSlug | null) => void;
}

export function BodyMap({
  load,
  cardioLoad,
  reference = 6,
  cardioReference = 120,
  selected = null,
  onSelect,
}: BodyMapProps) {
  // Touch devices have no hover, so a tap both selects and reveals the label.
  const [peek, setPeek] = useState<MuscleSlug | null>(null);
  const active = peek ?? selected;
  const activeValue = active ? (load[active] ?? 0) : 0;
  const activeCardio = active ? (cardioLoad?.[active] ?? 0) : 0;

  return (
    <div>
      <div className="flex items-start justify-center gap-1">
        <Figure view="front" load={load} cardioLoad={cardioLoad} reference={reference} cardioReference={cardioReference} active={active} onSelect={onSelect} onPeek={setPeek} />
        <Figure view="back" load={load} cardioLoad={cardioLoad} reference={reference} cardioReference={cardioReference} active={active} onSelect={onSelect} onPeek={setPeek} />
      </div>

      <div className="mt-1 flex h-6 items-center justify-center text-sm">
        {active ? (
          <span>
            <span className="font-medium">{muscleLabel(active)}</span>{" "}
            <span className="text-dim">
              {activeValue > 0 ? `${formatSets(activeValue)} effective sets` : "not trained"}
              {activeCardio > 0 && ` · ${Math.round(activeCardio)} cardio MET-min`}
            </span>
          </span>
        ) : (
          <span className="text-xs text-dim">Tap a muscle for detail</span>
        )}
      </div>

      {/* Named, because a fill and an outline in two colours is not
          self-explanatory, and the same two colours mean the same two things
          on the radar, the calendar and the balance bar. */}
      <div className="flex items-center justify-center gap-4 text-[11px] text-dim">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: "var(--strength)" }}
          />
          Strength
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ border: "1.5px solid var(--cardio)" }}
          />
          Cardio
        </span>
      </div>
    </div>
  );
}

function Figure({
  view,
  load,
  cardioLoad,
  reference,
  cardioReference,
  active,
  onSelect,
  onPeek,
}: {
  view: BodyView;
  load: Partial<MuscleTotals>;
  cardioLoad?: Partial<MuscleTotals>;
  reference: number;
  cardioReference: number;
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
            cardioLoad={cardioLoad}
            reference={reference}
            cardioReference={cardioReference}
            active={active}
            onSelect={onSelect}
            onPeek={onPeek}
          />
        ))}
      </svg>
      <figcaption className="mt-1 text-center text-[11px] uppercase tracking-wide text-dim">
        {view}
      </figcaption>
    </figure>
  );
}

function Region({
  region,
  load,
  cardioLoad,
  reference,
  cardioReference,
  active,
  onSelect,
  onPeek,
}: {
  region: BodyRegion;
  load: Partial<MuscleTotals>;
  cardioLoad?: Partial<MuscleTotals>;
  reference: number;
  cardioReference: number;
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

  const cardioValue = Math.max(0, ...region.muscles.map((m) => cardioLoad?.[m] ?? 0));
  const cardioIntensity = shadeIntensity(cardioValue, cardioReference);

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
      aria-label={
        cardioValue > 0
          ? `${label}: ${formatSets(value)} effective sets, ${Math.round(cardioValue)} cardio MET-minutes`
          : `${label}: ${formatSets(value)} effective sets`
      }
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
          // Strength fills, in the strength colour. This used to be --accent,
          // which is the same orange as --cardio — so the resistance fill and
          // the cardio outline were the same colour, and the figure could not
          // say which quality had loaded a muscle.
          fill="var(--strength)"
          fillOpacity={intensity}
          // Cardio is an outline in its own colour, never a fill: the two
          // channels must stay distinguishable at a glance, and adding them
          // would put a run back into the hypertrophy reading.
          stroke={
            isActive
              ? "var(--text)"
              : cardioIntensity > 0
                ? "var(--cardio)"
                : "var(--muscle-outline)"
          }
          strokeWidth={isActive ? 0.9 : cardioIntensity > 0 ? 0.4 + cardioIntensity : 0.3}
          strokeOpacity={isActive || cardioIntensity === 0 ? 1 : 0.4 + cardioIntensity * 0.6}
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
