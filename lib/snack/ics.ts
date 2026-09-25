/**
 * The snack plan as an iCalendar feed (RFC 5545). Pure.
 *
 * For people whose day is run by their calendar, a planned snack that is not
 * in the calendar does not exist. Subscribing to this feed puts each one there
 * as a five-minute block — visible beside the meetings it has to fit between,
 * and moved by the app, not by hand, whenever the plan changes.
 */

export interface CalendarEvent {
  uid: string;
  start: Date;
  minutes: number;
  title: string;
  description: string;
  url: string;
}

function utc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape TEXT values: backslash, semicolon, comma and newline. */
function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded, as the RFC requires. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut -= 1;
    parts.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export function renderCalendar(events: readonly CalendarEvent[], now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Snack Exercise Tracker//Snack plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Snacks",
    // Calendar apps re-read the feed about this often; the plan moves during the day.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const event of events) {
    const end = new Date(event.start.getTime() + event.minutes * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${utc(now)}`,
      `DTSTART:${utc(event.start)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${text(event.title)}`,
      `DESCRIPTION:${text(event.description)}`,
      `URL:${event.url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
