# 27. Nudges run the spacing score's ideal forward, and send each one once

**Status:** Accepted · 2026-09-25 · builds on [0011](./0011-spacing-score.md), [0014](./0014-a-daily-share-with-no-carry-over.md), [0022](./0022-the-spacing-target-is-attributed-and-configurable.md)

## Context

Everything so far waited to be opened. For busy people that is the failure
mode: the snack that was going to happen at 11 does not, because nothing said
so at 11. A proactive tracker has to decide *when* to speak, and the obvious
schedules are all wrong somewhere — every two hours ignores what was already
done; "remind me at 10, 13, 16" breaks the first time a meeting overruns.

## Decision

**The schedule is the spacing score's own ideal, re-planned continuously**
(`lib/snack/schedule.ts`). The score rewards a day whose bouts cut the waking
window into even gaps. So the remaining bouts are spread evenly across what is
left of the window, measured from the last one. Log a snack early and the rest
spread out behind it; miss one and the next is due now, with the rest closing
up. Following the nudges *is* scoring well; the two cannot drift apart.

**Nothing accumulates.** A day that is behind is re-spread, not made to catch
up, and a slot that no longer fits before the end of the window is dropped —
the same no-carry-over rule as the daily rings (0014). Five nudges in the last
hour of the evening would be nagging.

**Busy time is routed around**: recurring blocks by weekday ("stand-up, 09:00–
09:30, weekdays") move a slot to when they end. Pauses (an hour, the rest of
the day, three days, a week) and snoozes ("in 30 min", from the notification)
move it later.

**At most one nudge per snack**, plus one follow-up 45 minutes later if the
user opted in and nothing was logged, plus whatever snoozes they asked for, up
to three; a daily cap on top. Never outside waking hours, never in busy time,
never while a snack is in progress.

**The snack is planned when the nudge is sent**, for where the user is at that
moment, so the notification carries a real plan ("Incline push-up · Hotel
room") and Start opens exactly it.

**Each nudge is sent once, however many replicas run.** A once-a-minute
scheduler runs in the server process, behind a lease row so one replica does
the work; and every nudge is *claimed* by inserting a row keyed on (user, day,
slot, attempt) before anything is sent. A second replica, or an overlapping
tick, loses the insert and sends nothing.

**Delivery is standard Web Push** (VAPID, RFC 8030/8291/8292): Apple's push
service for a Home Screen app on iOS 16.4+, Google's and Mozilla's elsewhere.
Keys come from the environment or are generated once and kept in the database —
new keys would silently orphan every subscription. Nudges are off until the
user turns them on from a device, which is also what subscribes it.

**The plan is also a calendar**: an iCalendar feed of the week's planned snacks,
behind a `calendar:read` token, so they sit next to the meetings they have to
fit between.

## Why

**Reuse the score's definition of a good day** because two definitions would
disagree, and the user would be scolded by one for following the other.

**Claim before send** because "check, then send" between two replicas sends
twice, and a duplicate notification is the fastest way to get notifications
turned off.

**Planning at send time** because a plan made at 07:00 for 14:00 does not know
the user flew to Frankfurt.

## Consequences

- `tests/snack-schedule.test.ts` covers the arithmetic;
  `tests/integration/nudges.test.ts` covers the job end to end with Web Push
  stubbed, including three replicas firing at once.
- Web Push needs HTTPS (or localhost). A plain-HTTP LAN install can do
  everything except nudges; the calendar feed still works.
- `SCHEDULER=off` stops a process running the job, for deployments that want
  one dedicated worker.
