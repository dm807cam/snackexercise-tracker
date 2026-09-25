/**
 * The background loop: nudges every minute, housekeeping every hour.
 *
 * Started once per server process from instrumentation.ts. Safe to run on any
 * number of replicas: each job takes a lease first (lib/jobs/lease.ts), and a
 * nudge is additionally claimed by a unique key before anything is sent.
 */

import { log } from "../logger";
import { count, gauge } from "../metrics";
import { HOLDER, acquireLease, releaseLease } from "./lease";
import { runNudges } from "./nudges";
import { housekeeping } from "./housekeeping";

const TICK_MS = 60_000;
/** The first tick waits for the server to finish starting. */
const FIRST_TICK_MS = 15_000;
const HOUSEKEEPING_EVERY_TICKS = 60;

let interval: ReturnType<typeof setInterval> | null = null;
let running = false;
let ticks = 0;

async function timed(job: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    await fn();
    count("snack_scheduler_ticks_total", { job, result: "ok" });
  } catch (error) {
    count("snack_scheduler_ticks_total", { job, result: "error" });
    log.error("scheduled job failed", { job, error });
  } finally {
    gauge("snack_scheduler_tick_seconds", (Date.now() - started) / 1000, { job });
  }
}

async function tick() {
  // A slow tick must not overlap the next one.
  if (running) return;
  running = true;
  ticks += 1;
  try {
    if (await acquireLease("nudges", TICK_MS - 5_000)) {
      await timed("nudges", async () => {
        const { users, sent } = await runNudges();
        if (sent > 0) log.info("nudges sent", { users, sent });
      });
    }
    if (ticks % HOUSEKEEPING_EVERY_TICKS === 1 && (await acquireLease("housekeeping", 50 * TICK_MS))) {
      await timed("housekeeping", () => housekeeping());
    }
  } catch (error) {
    log.error("scheduler tick failed", { error });
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (interval) return;
  interval = setInterval(() => void tick(), TICK_MS);
  interval.unref?.();
  setTimeout(() => void tick(), FIRST_TICK_MS).unref?.();

  const stop = () => {
    void stopScheduler();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  log.info("scheduler started", { holder: HOLDER });
}

/** Stop ticking and hand the leases back, so another replica can pick up at once. */
export async function stopScheduler(): Promise<void> {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
  await Promise.allSettled([releaseLease("nudges"), releaseLease("housekeeping")]);
  log.info("scheduler stopped", { holder: HOLDER });
}
