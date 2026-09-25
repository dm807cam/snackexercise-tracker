import { beforeEach, describe, expect, it } from "vitest";
import { count, gauge, renderMetrics, resetMetrics } from "@/lib/metrics";

describe("metrics exposition", () => {
  beforeEach(() => resetMetrics());

  it("counts by label set and renders the Prometheus text format", () => {
    count("snack_logins_total", { result: "ok" });
    count("snack_logins_total", { result: "ok" });
    count("snack_logins_total", { result: "failed" });
    gauge("snack_scheduler_tick_seconds", 0.25, { job: "nudges" });

    const text = renderMetrics();
    expect(text).toContain("# TYPE snack_logins_total counter");
    expect(text).toContain('snack_logins_total{result="ok"} 2');
    expect(text).toContain('snack_logins_total{result="failed"} 1');
    expect(text).toContain('snack_scheduler_tick_seconds{job="nudges"} 0.25');
    expect(text.endsWith("\n")).toBe(true);
  });

  it("describes a family once however many label sets it has", () => {
    const text = renderMetrics([
      { name: "snack_accounts", help: "Accounts.", value: 3, labels: { role: "member" } },
      { name: "snack_accounts", help: "Accounts.", value: 1, labels: { role: "admin" } },
    ]);
    expect(text.match(/# TYPE snack_accounts gauge/g)).toHaveLength(1);
    expect(text).toContain('snack_accounts{role="member"} 3');
    expect(text).toContain('snack_accounts{role="admin"} 1');
  });

  it("cannot be broken out of a label value", () => {
    count("snack_logins_total", { result: 'a"b\\c\nd' });
    expect(renderMetrics()).toContain('snack_logins_total{result="a_b_c_d"} 1');
  });
});
