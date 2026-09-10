# 14. Today's target is a flat seventh, and nothing carries over

**Status:** Accepted · 2026-09-07

## Context

Every number this app produced was retrospective or weekly. Neither answers the
question a person actually has at three in the afternoon — "is there anything
left in me that I owe today?" — and a weekly figure is the wrong *shape* for it:
"42 of 60 effective sets" is not an amount anyone can act on before bedtime.

## Decision

The day view carries a **daily target for each side: a seventh of that side's
weekly guideline**, computed from the existing constants rather than written out
again. 60 effective sets and 600 MET-minutes become ~8.6 sets and ~86
MET-minutes a day.

**Nothing carries over.** A huge Tuesday does not buy Wednesday off, and an
empty Monday does not make Tuesday owe double.

Steps count toward the cardio side, on the same terms the balance marker uses
(above the personal baseline, de-duplicated against logged foot-based cardio,
at the configured weight).

It is drawn as two closing rings and shown **only on today**.

## Why

An even seventh would be odd advice for someone training in sessions — you
cannot productively train everything every day — but the whole premise of this
app is scattered snacks, so an even daily share is its own thesis rather than a
simplification of somebody else's.

No carry-over is the part worth defending, because both alternatives are
defensible and both are worse here:

- *Rolling remainder* (what the trailing seven days still owe) is self-correcting
  and honest, but makes today's number depend on days the user is no longer
  looking at. A target that moves for reasons off-screen is not a target.
- *Banking a surplus* turns the app into a ledger, and a ledger invites paying
  the week off in one Saturday — the exact behaviour the spacing score
  ([0011](./0011-spacing-score.md)) exists to discourage.

The weekly picture already exists, on the stats page, where a surplus and a
shortfall are both visible in context. This is the daily view; it should be
legible on its own.

Rings rather than another bar: an arc has an obvious unfinished part, and
closing it is a thing a person wants to do. It is also the only forward-looking
element on a page that is otherwise a record, and giving it a different form
says so without a label.

Today only, because "how much is left" is a statement about a day that can still
be changed. On a past day it would be a permanent red mark on a Tuesday in
August — nagging, not motivation.

## Rejected

**A single combined "dose" ring.** The two currencies are never added anywhere
else in this app and adding them here to save a ring would break that.

**A streak.** A streak makes a rest day a failure and turns the honest answer
("today was a rest day") into something to be avoided.

## Consequences

A rest day shows two open rings. That is the cost of a daily goal and it is
accepted deliberately: the copy never scolds, there is nothing to break, and the
headline on an empty day reads "The whole day is still ahead".

The remaining amount is also translated into something actionable — "about 4
more sets", "about 14 min" — using the ~2.2 effective-sets-per-hard-set figure
the strength target is itself calibrated against, and the app's generic 6 METs.
Both are rough, both say "about", and the honest units stay beside them.
