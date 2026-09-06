"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client";
import type { ModelOption } from "@/lib/openrouter";

interface Catalogue {
  models: ModelOption[];
  recommended: string[];
  /** True when OpenRouter could not be reached and this list may be out of date. */
  stale: boolean;
}

/**
 * The catalogue runs to a few hundred models. Rendering all of them makes the
 * sheet janky on a phone for no benefit, so the list is capped and the search
 * box is what reaches the tail.
 */
const VISIBLE_LIMIT = 60;

export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Fetched when the sheet is first opened rather than on page load: most
  // visits to Settings are for something else entirely.
  useEffect(() => {
    if (!open || catalogue) return;
    let cancelled = false;
    api<Catalogue>("/api/models")
      .then((data) => !cancelled && setCatalogue(data))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, catalogue]);

  const results = useMemo(() => {
    if (!catalogue) return [];
    const term = query.trim().toLowerCase();
    if (!term) {
      // With no search, lead with the known-good picks.
      const rank = new Map(catalogue.recommended.map((id, i) => [id, i]));
      return [...catalogue.models].sort((a, b) => {
        const ra = rank.get(a.id) ?? Infinity;
        const rb = rank.get(b.id) ?? Infinity;
        return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
      });
    }
    return catalogue.models.filter(
      (m) => m.name.toLowerCase().includes(term) || m.id.toLowerCase().includes(term),
    );
  }, [catalogue, query]);

  // An OpenRouter id is always "provider/model", which keeps this from
  // offering to save half-typed search terms as model ids.
  const term = query.trim();
  const canUseRaw =
    term.includes("/") && !results.some((m) => m.id === term) && term !== value;

  const selected = catalogue?.models.find((m) => m.id === value);
  // A model can be withdrawn, or lose structured-output support, long after it
  // was chosen. Saying so here beats discovering it mid-dictation.
  const missing = catalogue !== null && !catalogue.stale && !selected;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex w-full items-center justify-between rounded-lg px-3 py-3 text-left"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <span className="min-w-0">
          <span className="block truncate text-base">{selected?.name ?? value}</span>
          {/* Until the catalogue loads the id is all we have, so don't print it twice. */}
          {selected && <span className="block truncate text-xs text-dim">{value}</span>}
        </span>
        <span className="ml-2 shrink-0 text-sm" style={{ color: "var(--accent)" }}>
          Change
        </span>
      </button>

      {missing && (
        <p className="mt-2 text-xs" style={{ color: "var(--accent)" }}>
          OpenRouter no longer lists this model for structured output. Pick another, or voice
          entry will fail.
        </p>
      )}

      <Sheet open={open} title="Choose a model" onClose={() => setOpen(false)}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models..."
          className="mb-3 w-full rounded-lg px-3 py-3 text-base"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        />

        {error && <p className="py-4 text-sm text-dim">Could not load models: {error}</p>}
        {!catalogue && !error && <p className="py-4 text-sm text-dim">Loading models...</p>}

        {catalogue?.stale && (
          <p className="mb-3 text-xs" style={{ color: "var(--accent)" }}>
            {catalogue.models.length > 0
              ? "Showing the last known list — OpenRouter could not be reached."
              : "OpenRouter could not be reached. Search by exact model id to set one anyway."}
          </p>
        )}

        {catalogue && (
          <>
            <p className="mb-2 text-xs text-dim">
              {query.trim()
                ? `${results.length} match${results.length === 1 ? "" : "es"}`
                : `${catalogue.models.length} models that support structured output`}
            </p>

            <ul className="flex flex-col gap-1">
              {results.slice(0, VISIBLE_LIMIT).map((model) => (
                <li key={model.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="tap w-full rounded-lg px-3 py-2 text-left"
                    style={{
                      background: model.id === value ? "var(--surface-2)" : "transparent",
                      border: `1px solid ${model.id === value ? "var(--accent)" : "transparent"}`,
                    }}
                  >
                    <span className="block truncate text-sm font-medium">{model.name}</span>
                    <span className="block truncate text-xs text-dim">{model.id}</span>
                    <span className="block text-xs text-dim tabular-nums">
                      {describePrice(model)}
                      {model.contextLength ? ` · ${formatContext(model.contextLength)} context` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {results.length > VISIBLE_LIMIT && (
              <p className="pt-2 text-xs text-dim">
                {results.length - VISIBLE_LIMIT} more — narrow the search to see them.
              </p>
            )}
            {results.length === 0 && query.trim() && !canUseRaw && (
              <p className="py-4 text-sm text-dim">Nothing matches “{query.trim()}”.</p>
            )}

            {/*
              Without this the picker is a dead end whenever OpenRouter is
              unreachable: no list to choose from, and no other way to change
              the model. A raw id is also the only route to a model the
              catalogue has not caught up with yet.
            */}
            {canUseRaw && (
              <button
                type="button"
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                  setQuery("");
                }}
                className="tap mt-2 w-full rounded-lg px-3 py-3 text-left text-sm"
                style={{ background: "var(--surface-2)", border: "1px dashed var(--border)" }}
              >
                Use <span className="font-medium">{query.trim()}</span> as a model id
                <span className="block text-xs text-dim">
                  Not checked for structured-output support.
                </span>
              </button>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}

/** OpenRouter quotes no price for models it routes dynamically. */
function describePrice(model: ModelOption): string {
  if (model.promptPerM === null || model.completionPerM === null) return "Variable pricing";
  if (model.promptPerM === 0 && model.completionPerM === 0) return "Free";
  return `$${trim(model.promptPerM)} in · $${trim(model.completionPerM)} out per 1M tokens`;
}

function trim(value: number): string {
  // Sub-cent prices are common enough that two decimals would read as "$0.00".
  return value < 0.01 ? value.toPrecision(2) : value.toFixed(2);
}

function formatContext(tokens: number): string {
  return tokens >= 1_000_000
    ? `${Math.round(tokens / 1_000_000)}M`
    : `${Math.round(tokens / 1000)}k`;
}
