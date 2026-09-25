import { describe, expect, it } from "vitest";
import { renderCalendar } from "@/lib/snack/ics";

describe("the calendar feed", () => {
  it("is valid iCalendar: CRLF lines, UTC times, escaped text, folded long lines", () => {
    const ics = renderCalendar(
      [
        {
          uid: "2026-09-25-1-u@snacks",
          start: new Date("2026-09-25T08:20:00Z"),
          minutes: 3,
          title: "Snack (3 min)",
          description: "Snack 1 of 5; stairs, a wall, a chair — " + "x".repeat(80),
          url: "https://snacks.example.com/",
        },
      ],
      new Date("2026-09-25T06:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20260925T082000Z");
    expect(ics).toContain("DTEND:20260925T082300Z");
    expect(ics).toContain("Snack 1 of 5\; stairs\\, a wall\\, a chair");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(ics).toMatch(/\r\n [x]+/);
  });

  it("is an empty calendar when nothing is planned", () => {
    const ics = renderCalendar([]);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).toContain("X-WR-CALNAME:Snacks");
  });
});
