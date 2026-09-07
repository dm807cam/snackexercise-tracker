import { StatsView, type StatsPayload } from "@/components/Stats";
import { getAppConfig } from "@/lib/app-config";
import { loadStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW = 30;

export default async function StatsPage() {
  const { today } = await getAppConfig();
  const stats = await loadStats(DEFAULT_WINDOW, today);

  return <StatsView initial={stats as StatsPayload} />;
}
