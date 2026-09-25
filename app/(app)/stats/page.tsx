import { StatsView, type StatsPayload } from "@/components/Stats";
import { getAppConfig } from "@/lib/app-config";
import { requireUser } from "@/lib/auth/current";
import { loadStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW = 30;

export default async function StatsPage() {
  const user = await requireUser();
  const { today, timeZone } = await getAppConfig(user.id);
  const stats = await loadStats(user.id, DEFAULT_WINDOW, today, timeZone);

  return <StatsView initial={stats as StatsPayload} />;
}
