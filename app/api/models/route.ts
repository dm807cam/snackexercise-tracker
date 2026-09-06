import { handle } from "@/lib/api";
import { fetchModels, RECOMMENDED_MODEL_IDS, type ModelOption } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

/**
 * The catalogue changes on the order of weeks, and this is a personal tracker
 * that will ask for it a handful of times a year. An in-process cache is
 * enough; it costs nothing and dies with the container.
 */
const TTL_MS = 12 * 60 * 60 * 1000;
let cache: { at: number; models: ModelOption[] } | null = null;

export async function GET() {
  return handle(async () => {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return { models: cache.models, recommended: RECOMMENDED_MODEL_IDS, stale: false };
    }

    try {
      const models = await fetchModels();
      // An empty result means something changed upstream; keep the last good
      // catalogue rather than caching the emptiness for twelve hours.
      if (models.length > 0) cache = { at: Date.now(), models };
      return { models, recommended: RECOMMENDED_MODEL_IDS, stale: false };
    } catch {
      // Settings has to keep working when the NAS is offline or OpenRouter is
      // down. Serve whatever was last seen and let the UI say so; a model
      // picker that breaks the page it lives on is worse than a stale one.
      return {
        models: cache?.models ?? [],
        recommended: RECOMMENDED_MODEL_IDS,
        stale: true,
      };
    }
  });
}
