/**
 * OpenRouter client for turning a dictated sentence into structured entries.
 *
 * The model's output is constrained with a strict JSON schema
 * (https://openrouter.ai/docs/guides/features/structured-outputs) so we get
 * parseable objects rather than prose to regex over. Even so, nothing here
 * writes to the database — the caller shows the result for confirmation first.
 * A misheard "225" silently entering your history is worse than no entry.
 */

import { z } from "zod";
import { MUSCLE_SLUGS } from "./muscles";

export const DEFAULT_MODEL = "google/gemini-2.5-flash";
// Overridable so the voice path can be exercised end to end against a stub in
// tests, without a live key or network access.
const ENDPOINT =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1/chat/completions";
const MODELS_ENDPOINT =
  process.env.OPENROUTER_MODELS_URL ?? "https://openrouter.ai/api/v1/models";

/**
 * Offered first in the picker. Nothing depends on this list being complete or
 * current — it is a shortcut past 300-odd alternatives, not a whitelist.
 */
export const RECOMMENDED_MODEL_IDS = [
  "google/gemini-2.5-flash",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5-mini",
];

export const parsedEntrySchema = z.object({
  exerciseName: z.string().min(1),
  sets: z.number().int().min(1).max(100),
  reps: z.number().int().min(1).max(1000).nullable(),
  weightKg: z.number().min(0).max(1000).nullable(),
  durationSec: z.number().int().min(1).max(86400).nullable(),
  /** "HH:MM" if the speaker mentioned a time, else null. */
  timeHint: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  notes: z.string().max(200).nullable(),
});

export const parsedPayloadSchema = z.object({
  entries: z.array(parsedEntrySchema).max(25),
});

export type ParsedEntry = z.infer<typeof parsedEntrySchema>;

/** JSON Schema mirror of the Zod shape above, sent to the model. */
const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "workout_entries",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["entries"],
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["exerciseName", "sets", "reps", "weightKg", "durationSec", "timeHint", "notes"],
            properties: {
              exerciseName: { type: "string", description: "Movement name, singular, e.g. 'Kettlebell swing'" },
              sets: { type: "integer", description: "Number of sets; 1 if unstated" },
              reps: { type: ["integer", "null"], description: "Reps per set, null if not stated" },
              weightKg: { type: ["number", "null"], description: "Load per side as spoken, in kilograms; convert pounds to kg; null if not stated" },
              durationSec: { type: ["integer", "null"], description: "Seconds held, for planks/carries/hangs; null otherwise" },
              timeHint: { type: ["string", "null"], description: "24h HH:MM if a time of day was stated, else null" },
              notes: { type: ["string", "null"], description: "Any remaining detail worth keeping, else null" },
            },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You convert a short spoken log of "exercise snacks" into structured entries.

Rules:
- Extract every distinct movement mentioned as its own entry.
- Never invent numbers. If reps, weight or duration were not stated, use null.
- "3 sets of 12" -> sets 3, reps 12. "12 pull-ups" -> sets 1, reps 12.
- Convert pounds to kilograms (1 lb = 0.4536 kg). Report bodyweight movements with weightKg null unless extra load was stated.
- Holds and carries (plank, dead hang, farmer's carry) use durationSec, not reps.
- Prefer a name from the known list when the speaker clearly means it; otherwise use their words.
- If the text contains no exercise at all, return an empty entries array.`;

export interface ParseOptions {
  apiKey: string;
  model?: string;
  text: string;
  /** Catalogue names, so the model prefers existing entries over near-synonyms. */
  knownExercises: string[];
  localTime: string;
}

export class OpenRouterError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function parseWorkoutText(options: ParseOptions): Promise<ParsedEntry[]> {
  const { apiKey, model = DEFAULT_MODEL, text, knownExercises, localTime } = options;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      // OpenRouter uses these for attribution on its dashboard.
      "HTTP-Referer": "https://github.com/dm807cam/snackexercise-tracker",
      "X-Title": "Snack Exercise Tracker",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Current local time: ${localTime}.`,
            `Known exercises: ${knownExercises.join(", ")}.`,
            "",
            `Log this: ${text}`,
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter request failed (${response.status})${detail ? `: ${truncate(detail)}` : ""}`,
      response.status === 401 ? 401 : 502,
    );
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new OpenRouterError("OpenRouter returned no content");
  }

  return extractEntries(content);
}

/**
 * Parse and validate the model's content. Exported so the failure modes —
 * prose instead of JSON, JSON of the wrong shape — are unit testable without a
 * live API key.
 */
export function extractEntries(content: string): ParsedEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    // Some models wrap strict JSON in a ```json fence despite the schema.
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!fenced) throw new OpenRouterError("Could not read the model's response as JSON");
    try {
      json = JSON.parse(fenced[1]);
    } catch {
      throw new OpenRouterError("Could not read the model's response as JSON");
    }
  }

  const result = parsedPayloadSchema.safeParse(json);
  if (!result.success) {
    throw new OpenRouterError("The model's response did not match the expected shape");
  }
  return result.data.entries;
}

/** Muscle mapping suggestion for a movement that isn't in the catalogue yet. */
export async function suggestMuscles(options: {
  apiKey: string;
  model?: string;
  exerciseName: string;
}): Promise<{ muscle: string; weight: number }[]> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": "https://github.com/dm807cam/snackexercise-tracker",
      "X-Title": "Snack Exercise Tracker",
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_MODEL,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "muscle_mapping",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["muscles"],
            properties: {
              muscles: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["muscle", "weight"],
                  properties: {
                    muscle: { type: "string", enum: [...MUSCLE_SLUGS] },
                    weight: { type: "number", enum: [1, 0.5, 0.25] },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Map a resistance exercise to the muscles it trains. weight 1 = primary mover, 0.5 = secondary, 0.25 = stabiliser. Return between one and six muscles.",
        },
        { role: "user", content: options.exerciseName },
      ],
    }),
  });

  if (!response.ok) throw new OpenRouterError(`OpenRouter request failed (${response.status})`);

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new OpenRouterError("OpenRouter returned no content");

  const schema = z.object({
    muscles: z
      .array(
        z.object({
          muscle: z.enum(MUSCLE_SLUGS as unknown as [string, ...string[]]),
          weight: z.number().positive().max(1),
        }),
      )
      .min(1),
  });

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new OpenRouterError("Could not read the model's muscle mapping as JSON");
  }

  const result = schema.safeParse(json);
  if (!result.success) throw new OpenRouterError("Unexpected muscle mapping shape");
  return result.data.muscles;
}

function truncate(value: string, max = 200): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

// --- model catalogue -------------------------------------------------------

export interface ModelOption {
  id: string;
  name: string;
  /** USD per million tokens, or null when OpenRouter does not quote a price. */
  promptPerM: number | null;
  completionPerM: number | null;
  contextLength: number | null;
}

const rawModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  context_length: z.number().nullable().optional(),
  pricing: z
    .object({ prompt: z.string().optional(), completion: z.string().optional() })
    .optional(),
  supported_parameters: z.array(z.string()).optional(),
});

/**
 * OpenRouter quotes a per-token price as a decimal string, and uses "-1" for
 * models whose cost is only known once it has routed the request
 * (openrouter/auto). Those are reported as unpriced rather than as a nonsense
 * negative number.
 */
function perMillion(price: string | undefined): number | null {
  if (price === undefined) return null;
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) return null;
  return value * 1_000_000;
}

/**
 * Reduce the catalogue to the models this app can actually use.
 *
 * Capability is a filter rather than a warning: the parse sends
 * `response_format: json_schema`, so a model without `structured_outputs`
 * fails at dictation time with an unreadable response — the one moment the
 * user is least able to do anything about it. Roughly a fifth of the
 * catalogue is in that category.
 *
 * The response is also ~700KB, nearly all of it fields the picker never
 * shows, so each record is trimmed on the server rather than sent to a phone.
 *
 * Exported separately from the fetch so the filtering can be tested against
 * captured payloads without a network call.
 */
export function selectUsableModels(payload: unknown): ModelOption[] {
  const envelope = z.object({ data: z.array(z.unknown()) }).safeParse(payload);
  if (!envelope.success) return [];

  const options: ModelOption[] = [];
  for (const entry of envelope.data.data) {
    const parsed = rawModelSchema.safeParse(entry);
    // A single malformed record should not cost the user the whole catalogue.
    if (!parsed.success) continue;

    const model = parsed.data;
    if (!model.supported_parameters?.includes("structured_outputs")) continue;

    options.push({
      id: model.id,
      name: model.name ?? model.id,
      promptPerM: perMillion(model.pricing?.prompt),
      completionPerM: perMillion(model.pricing?.completion),
      contextLength: model.context_length ?? null,
    });
  }

  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

/** The models OpenRouter currently offers that can honour a strict schema. */
export async function fetchModels(): Promise<ModelOption[]> {
  const response = await fetch(MODELS_ENDPOINT, {
    headers: {
      "HTTP-Referer": "https://github.com/dm807cam/snackexercise-tracker",
      "X-Title": "Snack Exercise Tracker",
    },
  });

  if (!response.ok) {
    throw new OpenRouterError(`Could not list models (${response.status})`, 502);
  }
  return selectUsableModels(await response.json());
}
