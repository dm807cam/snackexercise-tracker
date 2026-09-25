import { CalendarView } from "@/components/Calendar";
import { getAppConfig } from "@/lib/app-config";
import { requireUser } from "@/lib/auth/current";
import { getDailyLoad, getTargets } from "@/lib/queries";
import { monthGrid } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireUser();
  const { today } = await getAppConfig(user.id);

  // Fetch the whole visible grid, including the neighbouring months' spill-over
  // days, so no cell renders blank when it actually has entries.
  const grid = monthGrid(today).flat();
  const [load, targets] = await Promise.all([
    getDailyLoad(user.id, grid[0], grid[grid.length - 1], today),
    getTargets(user.id),
  ]);

  return (
    <CalendarView initialMonth={today} initialLoad={load} today={today} targets={targets} />
  );
}
