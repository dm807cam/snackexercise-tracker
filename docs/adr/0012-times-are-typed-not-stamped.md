# 12. A typed time beats an instant built in the browser

**Status:** Accepted · 2026-09-07

## Context

An entry's `performedAt` was whatever the clock said when it was logged, and
nothing in the UI could change it. That was survivable while timestamps only
ordered a day's list. It stopped being survivable with the spacing score
([0011](./0011-spacing-score.md)): a run done at 06:30 and remembered at 21:00
lands as an evening entry, and the metric ends up measuring when the user reached
for their phone.

The obvious fix — a time field that builds a `Date` in the browser and sends the
instant — is wrong wherever the browser's zone is not the app's configured zone.
It lands an hour out for anyone travelling, and across a day boundary near
midnight.

## Decision

The wire format for a human-chosen time is **`performedTime` ("HH:MM") plus
`localDate`**, the digits the user typed and the day they belong to. The server
resolves them against the app's configured zone with
`zonedDateTimeToInstant`, which reads the zone's offset at the guessed instant
and re-reads it at the answer — the second pass is what puts a time on the right
side of a DST transition. A stated `localDate` is authoritative for which day the
entry belongs to; it is not re-derived from the resolved instant.

`performedAt` stays accepted for machine-generated instants: the undo path, which
restores an entry exactly as it was, and imports.

## Why

The digits are the thing the user actually chose. Anything derived from them in
the browser has already lost the information needed to interpret them, because
the browser cannot know the zone the app buckets days in — that is a stored
setting, not a property of the device.

Resolving server-side means one place makes the decision, and it is the same
place that already owns `toLocalDateInZone`, so the writer and the reader of a
timestamp cannot disagree.

## Rejected

**Sending an ISO instant with the browser's offset.** Correct only when the
browser and the app agree about the zone, which is exactly the case that does not
need fixing.

**Storing wall-clock strings.** Would make every existing ordering, range and
window query wrong, to solve a problem that is solved at the boundary.

## Consequences

Entries can now move within a day and across days, so `localDate` can change on a
PATCH. That was already true of the pre-existing `performedAt` path; it is now
reachable from the UI, and the day the user typed wins over anything inferred.
