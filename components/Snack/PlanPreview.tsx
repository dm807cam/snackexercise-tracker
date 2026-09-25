"use client";

import type { SnackBlock, SnackPlan } from "@/lib/snack/types";
import { equipmentLabel } from "@/lib/snack/equipment";
import { formatSets } from "@/lib/format";

/** "9 reps", "9 each side", "40 s", "20 s hard ×4". */
export function doseLabel(block: SnackBlock): string {
  const side = block.unilateral ? " each side" : "";
  if (block.easySeconds != null) {
    const work = block.kind === "reps" ? `${block.reps} reps` : `${block.seconds} s hard`;
    return block.sets > 1 ? `${work} ×${block.sets}` : work;
  }
  if (block.role === "cardio" && block.kind === "time") {
    const minutes = Math.round(((block.seconds ?? 60) * block.sets) / 60);
    return `${minutes} min steady`;
  }
  const load = block.weightKg ? ` @ ${block.weightKg} kg` : "";
  if (block.kind === "time") return `${block.seconds} s${side}${load}`;
  return `${block.reps} reps${side}${load}`;
}

/**
 * The blocks of a plan as a short list — what, how much, and why. With
 * `onPick`, each movement is also a way to log it by hand, for anyone who would
 * rather do the snack without the player.
 */
export function PlanPreview({
  plan,
  compact = false,
  onPick,
}: {
  plan: SnackPlan;
  compact?: boolean;
  onPick?: (exerciseId: string) => void;
}) {
  const rounds = plan.focus !== "cardio" && plan.rounds > 1 ? plan.rounds : null;
  return (
    <div>
      <ol className="flex flex-col gap-2" aria-label="Snack plan">
        {plan.blocks.map((block, index) => (
          <BlockRow key={`${block.exerciseId}-${index}`} block={block} compact={compact} onPick={onPick} />
        ))}
        {plan.finisher && <BlockRow block={plan.finisher} compact={compact} finisher onPick={onPick} />}
      </ol>
      <p className="mt-2 text-xs text-dim">
        {plan.blocks.some((b) => b.easySeconds != null && b.sets > 1) || (plan.finisher?.easySeconds != null && plan.finisher.sets > 1)
          ? "Every minute on the minute: go hard, then easy until the minute is up · "
          : ""}
        {rounds
          ? plan.blocks.length === 1
            ? `${rounds} sets, ${plan.roundRestSec} s rest between · `
            : `${rounds} rounds, ${plan.roundRestSec} s between rounds · `
          : ""}
        about {Math.max(1, Math.round(plan.estimatedSec / 60))} min
        {plan.expected.hardSets > 0 && ` · +${formatSets(plan.expected.hardSets)} sets`}
        {plan.expected.metMinutes > 0 && ` · +${plan.expected.metMinutes} MET-min`}
      </p>
    </div>
  );
}

function BlockRow({
  block,
  compact,
  finisher = false,
  onPick,
}: {
  block: SnackBlock;
  compact: boolean;
  finisher?: boolean;
  onPick?: (exerciseId: string) => void;
}) {
  const colour = block.role === "cardio" ? "var(--cardio)" : "var(--strength)";
  const body = (
    <>
      <span aria-hidden className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: colour }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {finisher && <span className="text-dim">Finisher · </span>}
            {block.name}
          </span>
          <span className="shrink-0 text-sm tabular-nums">{doseLabel(block)}</span>
        </span>
        {!compact && (
          <span className="block truncate text-xs text-dim">
            {block.why}
            {block.equipment.length > 0 && ` · ${block.equipment.map(equipmentLabel).join(", ").toLowerCase()}`}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li>
      {onPick ? (
        <button
          type="button"
          onClick={() => onPick(block.exerciseId)}
          aria-label={`Log ${block.name} by hand — ${block.why}`}
          className="flex w-full items-start gap-3 text-left"
        >
          {body}
        </button>
      ) : (
        <span className="flex items-start gap-3">{body}</span>
      )}
    </li>
  );
}
