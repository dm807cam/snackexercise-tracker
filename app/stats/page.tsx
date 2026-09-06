import { StatsView, type StatsPayload } from "@/components/Stats";
import { getAppConfig } from "@/lib/app-config";
import { getEntriesInRange, getLastTrainedByAxis } from "@/lib/queries";
import { previousWindowRange, windowRange } from "@/lib/dates";
import { buildStats } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW = 30;

export default async function StatsPage() {
  const { today } = await getAppConfig();

  const current = windowRange(DEFAULT_WINDOW, today);
  const previous = previousWindowRange(DEFAULT_WINDOW, today);

  const [currentEntries, previousEntries, lastTrained] = await Promise.all([
    getEntriesInRange(current.start, current.end),
    getEntriesInRange(previous.start, previous.end),
    getLastTrainedByAxis(),
  ]);

  const stats = buildStats({
    windowDays: DEFAULT_WINDOW,
    start: current.start,
    end: current.end,
    current: currentEntries,
    previous: previousEntries,
    lastTrained,
    today,
  });

  return <StatsView initial={stats as StatsPayload} />;
}
