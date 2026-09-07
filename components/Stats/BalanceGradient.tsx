"use client";

import { formatSets } from "@/lib/format";

export interface BalancePayload {
  cardioShare: number;
  uncertainty: number;
  index: number;
  strengthDose: number;
  cardioDose: number;
  detail: {
    effectiveSets: number;
    effectiveSetsPerWeek: number;
    metMinutes: number;
    metMinutesPerWeek: number;
    stepMetMinutes: number;
    creditedSteps: number;
    totalSteps: number;
  };
  confident: boolean;
  windowDays: number;
}

const STRENGTH_TARGET = 60;
const CARDIO_TARGET = 600;

/**
 * Where this window's training sits between strength and cardio.
 *
 * The marker is a band, not a needle, because the underlying number is a
 * posterior mean with a posterior spread and drawing only the mean would
 * overstate what a fortnight of scattered snacks can tell you. Below the
 * confidence floor there is no marker at all — a precise position on no
 * evidence is worse than an admission.
 *
 * The breakdown underneath is part of the component rather than a detail view:
 * the marker alone is not interpretable. Three 40-minute runs a week and 30
 * hard sets reads as "61% cardio", which is the correct answer to *dose against
 * target* and a surprising one against *sessions*, and the only thing that
 * makes it legible is seeing both doses.
 */
export function BalanceGradient({ balance }: { balance: BalancePayload }) {
  const share = clamp01(balance.cardioShare);
  const strengthPercent = Math.round((1 - share) * 100);
  const cardioPercent = 100 - strengthPercent;

  // The band is the honest object; clamp it to the bar, not to the marker.
  const low = clamp01(share - balance.uncertainty);
  const high = clamp01(share + balance.uncertainty);

  const stepShare =
    balance.detail.metMinutes > 0
      ? balance.detail.stepMetMinutes / balance.detail.metMinutes
      : 0;

  const label = balance.confident
    ? `Training balance: ${strengthPercent}% strength, ${cardioPercent}% cardio, ` +
      `from ${formatSets(balance.strengthDose + balance.cardioDose)} guideline-weeks logged ` +
      `over ${balance.windowDays} days.`
    : `Training balance: not enough logged in the last ${balance.windowDays} days to say.`;

  return (
    <section className="surface mb-4 rounded-xl px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-medium" style={{ color: "var(--strength)" }}>
          Strength
        </span>
        <span className="font-medium" style={{ color: "var(--cardio)" }}>
          Cardio
        </span>
      </div>

      <div role="img" aria-label={label}>
        <div
          className="relative h-6 overflow-hidden rounded-full"
          style={{
            background:
              "linear-gradient(90deg, var(--strength) 0%, var(--balance-mid) 50%, var(--cardio) 100%)",
            opacity: balance.confident ? 1 : 0.3,
          }}
        >
          {/* An unlabelled midpoint. Not a target band: the app has no business
              implying the user ought to be in the middle. */}
          <span
            aria-hidden
            className="absolute top-1/2 h-3 w-px -translate-y-1/2"
            style={{ left: "50%", background: "var(--bg)", opacity: 0.5 }}
          />

          {balance.confident && (
            <>
              <span
                aria-hidden
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${low * 100}%`,
                  width: `${Math.max(1, (high - low) * 100)}%`,
                  background: "var(--bg)",
                  opacity: 0.35,
                  transition: "left 250ms ease, width 250ms ease",
                }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full"
                style={{
                  left: `${share * 100}%`,
                  background: "var(--text)",
                  transition: "left 250ms ease",
                }}
              />
            </>
          )}
        </div>
      </div>

      {balance.confident ? (
        <p className="mt-2 text-center text-sm font-medium tabular-nums">
          {strengthPercent}% strength · {cardioPercent}% cardio
        </p>
      ) : (
        <p className="mt-2 text-center text-sm text-dim">
          Not enough logged in this window to place a marker.
        </p>
      )}

      <dl className="mt-3 flex flex-col gap-1.5 text-xs">
        <DoseRow
          label="Strength"
          color="var(--strength)"
          value={`${formatSets(balance.detail.effectiveSetsPerWeek)} eff. sets/wk`}
          fraction={balance.detail.effectiveSetsPerWeek / STRENGTH_TARGET}
        />
        <DoseRow
          label="Cardio"
          color="var(--cardio)"
          value={`${balance.detail.metMinutesPerWeek.toLocaleString()} MET-min/wk`}
          fraction={balance.detail.metMinutesPerWeek / CARDIO_TARGET}
        />
        {balance.detail.stepMetMinutes > 0 && (
          <div className="flex items-baseline justify-between pl-3 text-dim">
            <dt>of which walking</dt>
            <dd className="tabular-nums">{Math.round(stepShare * 100)}%</dd>
          </div>
        )}
      </dl>

      <p className="mt-2 text-[11px] leading-snug text-dim">
        Each side is measured against its own weekly target — {STRENGTH_TARGET} effective sets and{" "}
        {CARDIO_TARGET} MET-minutes — so the middle means on target for both, not that the numbers
        happened to tie.
      </p>
    </section>
  );
}

function DoseRow({
  label,
  color,
  value,
  fraction,
}: {
  label: string;
  color: string;
  value: string;
  fraction: number;
}) {
  const percent = Math.round(clampPositive(fraction) * 100);
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </dt>
      <dd className="tabular-nums text-dim">
        {value} <span style={{ color }}>{percent}%</span> of target
      </dd>
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampPositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
