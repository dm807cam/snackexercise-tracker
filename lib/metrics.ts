/**
 * Counters for /api/internal/metrics, in the Prometheus text format.
 *
 * In-process and dependency-free: a counter is a number in a map. They reset
 * when the process restarts, which Prometheus expects of a counter and handles
 * with rate(). Gauges that describe the database — accounts, sessions,
 * subscriptions — are not kept here at all; the metrics route reads them fresh
 * at scrape time, so they are right after a restart too.
 */

type Labels = Record<string, string>;

interface Family {
  help: string;
  type: "counter" | "gauge";
  values: Map<string, number>;
}

const families = new Map<string, Family>();

const HELP: Record<string, string> = {
  snack_logins_total: "Sign-in attempts by outcome.",
  snack_snacks_planned_total: "Snacks planned, by what asked for them.",
  snack_snacks_finished_total: "Snacks finished, by outcome.",
  snack_nudges_sent_total: "Nudges the scheduler decided to send.",
  snack_push_deliveries_total: "Web Push deliveries by result.",
  snack_scheduler_ticks_total: "Scheduler ticks, by job and result.",
  snack_scheduler_tick_seconds: "Duration of the last scheduler tick, by job.",
};

function key(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/["\\\n]/g, "_")}"`)
    .join(",");
}

function family(name: string, type: Family["type"]): Family {
  let f = families.get(name);
  if (!f) {
    f = { help: HELP[name] ?? name, type, values: new Map() };
    families.set(name, f);
  }
  return f;
}

export function count(name: string, labels: Labels = {}, by = 1): void {
  const f = family(name, "counter");
  const k = key(labels);
  f.values.set(k, (f.values.get(k) ?? 0) + by);
}

export function gauge(name: string, value: number, labels: Labels = {}): void {
  family(name, "gauge").values.set(key(labels), value);
}

/** Every family, plus any extra gauges the caller computed, as exposition text. */
export function renderMetrics(extra: { name: string; help: string; value: number; labels?: Labels }[] = []): string {
  const lines: string[] = [];
  for (const [name, f] of families) {
    lines.push(`# HELP ${name} ${f.help}`, `# TYPE ${name} ${f.type}`);
    for (const [labels, value] of f.values) lines.push(`${name}${labels ? `{${labels}}` : ""} ${value}`);
  }
  for (const g of extra) {
    lines.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`);
    const labels = g.labels ? key(g.labels) : "";
    lines.push(`${g.name}${labels ? `{${labels}}` : ""} ${g.value}`);
  }
  return `${lines.join("\n")}\n`;
}

/** For tests. */
export function resetMetrics(): void {
  families.clear();
}
