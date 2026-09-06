import { CalendarView } from "@/components/Calendar";
import { getAppConfig } from "@/lib/app-config";
import { getDailyLoad } from "@/lib/queries";
import { monthGrid } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { today } = await getAppConfig();

  // Fetch the whole visible grid, including the neighbouring months' spill-over
  // days, so no cell renders blank when it actually has entries.
  const grid = monthGrid(today).flat();
  const load = await getDailyLoad(grid[0], grid[grid.length - 1]);

  return <CalendarView initialMonth={today} initialLoad={load} today={today} />;
}
