/**
 * Runs once when a server process starts. Starts the background scheduler —
 * nudges and housekeeping — on the Node.js runtime, and never during a build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { config } = await import("./lib/config");
  if (!config.schedulerEnabled) return;

  const { startScheduler } = await import("./lib/jobs/scheduler");
  startScheduler();
}
