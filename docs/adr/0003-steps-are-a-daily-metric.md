# 3. Steps get their own table, keyed on `localDate`

**Status:** Accepted · 2026-09-07

## Context

Steps arrive from a phone after the fact: one number per day, no time, no
exercise, no muscle mapping.

## Decision

A `DailyMetric` table, primary key `localDate`, currently holding `steps`.

## Why

Steps are not an event, so they are not a `SetEntry`. Forced in there they would
inflate `entryCount`, `sets`, `activeDays` and the calendar shading, and every
existing query would quietly start meaning something else — the worst kind of
regression, because nothing breaks and every number is wrong.

`localDate` as the primary key is the whole trick. It is already the app's
universal day currency, denormalised onto `SetEntry` for exactly this reason, so
joining steps to a day, a window or a calendar grid is an index lookup with no
timezone arithmetic. The table is also shaped to grow — resting heart rate,
bodyweight, sleep are all "true of the day" — without needing this argument
again.

Writes are upserts, because the endpoint's main caller is a nightly phone
automation and re-running yesterday's shortcut must correct the day rather than
add to it.

## Rejected

**A `Setting` row per day.** Would have worked and would have been grim: no
types, no range queries, no index.

**Steps as a `SetEntry` against a "Walking" exercise.** Tempting because it
reuses everything, and wrong for the reasons above. It also makes the
de-duplication problem in ADR 7 unsolvable, since a logged run and the day's
step total would be indistinguishable rows.

## Consequences

Two tables now describe a day, and anything summarising a day has to read both.
`getDailyLoad` and `getDaySummary` are the only places that do.
