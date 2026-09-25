"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { CONTEXT_KINDS, CONTEXT_PRESETS, type ContextKind } from "@/lib/snack/contexts";
import { EQUIPMENT, EQUIPMENT_GROUP_LABELS, type EquipmentGroup } from "@/lib/snack/equipment";
import { Button, Field, Section, Segmented, Toggle, inputStyle } from "./ui";

export interface PlaceRow {
  id: string;
  name: string;
  kind: string;
  equipment: string;
  quiet: boolean;
  floor: boolean;
  sweat: number;
}

const GROUPS = Object.keys(EQUIPMENT_GROUP_LABELS) as EquipmentGroup[];

const SWEAT_OPTIONS = [
  { value: 0, label: "Stay fresh" },
  { value: 1, label: "A little" },
  { value: 2, label: "Any" },
];

/**
 * Where the user trains, and what is there. The planner proposes only what a
 * place allows, so this is the one thing worth getting right once: tick the
 * chair in the hotel room and it can propose chair dips; say the office is
 * quiet and nothing jumps.
 */
export function PlacesSection({
  initial,
  onToast,
}: {
  initial: { contexts: PlaceRow[]; activeId: string | null };
  onToast: (message: string, tone?: "error") => void;
}) {
  const [places, setPlaces] = useState(initial.contexts);
  const [activeId, setActiveId] = useState(initial.activeId);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onToast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function update(id: string, patch: Partial<Omit<PlaceRow, "id" | "equipment">> & { equipment?: string[] }) {
    // Optimistic: a checkbox that waits for the server feels broken.
    const before = places;
    setPlaces((current) =>
      current.map((place) =>
        place.id === id
          ? { ...place, ...patch, equipment: patch.equipment ? patch.equipment.join(" ") : place.equipment }
          : place,
      ),
    );
    api<{ context: PlaceRow }>(`/api/contexts/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
      .then(({ context }) => setPlaces((current) => current.map((place) => (place.id === id ? context : place))))
      .catch((error: Error) => {
        setPlaces(before);
        onToast(error.message, "error");
      });
  }

  const used = new Set(places.map((p) => p.kind));
  const addable = CONTEXT_KINDS.filter((kind) => kind === "other" || !used.has(kind));

  return (
    <Section title="Places" id="places">
      <p className="text-xs text-dim">
        Snacks are planned for where you are and what is to hand there. Pick the place on the Today card as you
        move through the week; say once, here, what each one has.
      </p>

      <ul className="flex flex-col gap-2">
        {places.map((place) => {
          const equipment = new Set(place.equipment.split(/\s+/).filter(Boolean));
          const expanded = open === place.id;
          return (
            <li key={place.id} className="rounded-lg" style={inputStyle}>
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="radio"
                  name="active-place"
                  checked={place.id === activeId}
                  onChange={() =>
                    run(async () => {
                      await api("/api/contexts/active", { method: "PUT", body: JSON.stringify({ contextId: place.id }) });
                      setActiveId(place.id);
                    })
                  }
                  aria-label={`I am at ${place.name} now`}
                  className="h-5 w-5 shrink-0"
                  style={{ accentColor: "var(--accent)" }}
                />
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : place.id)}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{place.name}</span>
                    <span className="block truncate text-xs text-dim">
                      {equipment.size === 0 ? "Just the floor" : `${equipment.size} things to hand`}
                      {place.quiet ? " · quiet" : ""}
                      {!place.floor ? " · no floor work" : ""}
                      {place.sweat === 0 ? " · no sweat" : ""}
                    </span>
                  </span>
                  <span className="text-xs text-dim" aria-hidden>
                    {expanded ? "▲" : "▼"}
                  </span>
                </button>
              </div>

              {expanded && (
                <div className="flex flex-col gap-4 border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
                  <Field label="Name" htmlFor={`place-name-${place.id}`}>
                    <input
                      id={`place-name-${place.id}`}
                      defaultValue={place.name}
                      maxLength={40}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== place.name) update(place.id, { name });
                        else e.target.value = place.name;
                      }}
                      className="w-full rounded-lg px-3 py-2 text-base"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    />
                  </Field>

                  <div className="flex flex-col gap-3">
                    <Toggle
                      label="Keep it quiet"
                      hint="No jumping or stamping: thin walls, somebody asleep downstairs, an open-plan office."
                      checked={place.quiet}
                      onChange={(quiet) => update(place.id, { quiet })}
                    />
                    <Toggle
                      label="Room to get down on the floor"
                      hint="Off for an office or a station platform: nothing that needs lying down."
                      checked={place.floor}
                      onChange={(floor) => update(place.id, { floor })}
                    />
                  </div>

                  <Field label="How much sweat is fine">
                    <Segmented
                      label="How much sweat is fine"
                      value={place.sweat}
                      options={SWEAT_OPTIONS}
                      onChange={(sweat) => update(place.id, { sweat })}
                    />
                  </Field>

                  <Field label="What is there">
                    <div className="flex flex-col gap-3">
                      {GROUPS.map((group) => (
                        <fieldset key={group}>
                          <legend className="mb-1 text-xs font-medium text-dim">{EQUIPMENT_GROUP_LABELS[group]}</legend>
                          <div className="flex flex-wrap gap-1.5">
                            {EQUIPMENT.filter((e) => e.group === group).map((item) => {
                              const on = equipment.has(item.slug);
                              return (
                                <button
                                  key={item.slug}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={on}
                                  onClick={() => {
                                    const next = new Set(equipment);
                                    if (on) next.delete(item.slug);
                                    else next.add(item.slug);
                                    update(place.id, { equipment: [...next] });
                                  }}
                                  className="tap rounded-full px-3 py-1.5 text-sm"
                                  style={{
                                    background: on ? "var(--accent)" : "var(--surface)",
                                    color: on ? "var(--accent-contrast)" : "var(--text)",
                                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                                  }}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </Field>

                  {places.length > 1 && (
                    <div>
                      <Button
                        tone="danger"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(`/api/contexts/${place.id}`, { method: "DELETE" });
                            const remaining = places.filter((p) => p.id !== place.id);
                            setPlaces(remaining);
                            if (activeId === place.id) setActiveId(remaining[0]?.id ?? null);
                            setOpen(null);
                          })
                        }
                      >
                        Remove {place.name}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {addable.length > 0 && (
        <Field label="Add a place" hint="Each starts from what is usually there; open it to adjust.">
          <div className="flex flex-wrap gap-1.5">
            {addable.map((kind: ContextKind) => (
              <button
                key={kind}
                type="button"
                disabled={busy}
                title={CONTEXT_PRESETS[kind].description}
                onClick={() =>
                  run(async () => {
                    const taken = new Set(places.map((p) => p.name));
                    const base = CONTEXT_PRESETS[kind].name;
                    let name = base;
                    for (let n = 2; taken.has(name); n += 1) name = `${base} ${n}`;
                    const { context } = await api<{ context: PlaceRow }>("/api/contexts", {
                      method: "POST",
                      body: JSON.stringify({ preset: kind, name }),
                    });
                    setPlaces((current) => [...current, context]);
                    setOpen(context.id);
                  })
                }
                className="tap rounded-full px-3 py-1.5 text-sm disabled:opacity-40"
                style={{ background: "var(--surface-2)", border: "1px dashed var(--border)" }}
              >
                + {CONTEXT_PRESETS[kind].name}
              </button>
            ))}
          </div>
        </Field>
      )}
    </Section>
  );
}
