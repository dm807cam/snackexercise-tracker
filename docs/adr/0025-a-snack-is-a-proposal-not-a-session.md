# 25. A snack is a proposal, not a session

**Status:** Accepted · 2026-09-25

## Context

The data model's founding decision is that there is no workout: the unit is a
`SetEntry`, one thing picked up and moved at a moment, and "training happens in
scattered snacks, not sessions" (see the schema header). The snack planner
(0026) now proposes complete snacks — two sets of incline push-ups, a
thirty-second wall sit, a finisher — and a guided player walks through them.
That pulls hard toward a `Workout` table with entries hanging off it.

## Decision

**A `Snack` row records a proposal and what became of it**, and nothing else
depends on it:

- the plan as proposed (JSON, versioned), the place, the minutes asked for,
  whether it came from the app or a nudge;
- a status — proposed, started, done, skipped, expired — and when.

**Entries never need one.** Logging by hand, by voice, from a Shortcut, or
from the player all produce ordinary `SetEntry` rows. An entry logged from the
player carries `snackId` as provenance; nothing in scoring, the body map, the
rings, the spacing score or the stats reads it. Deleting a snack leaves its
entries standing (`onDelete: SetNull`).

**The player logs what was done, not what was planned.** Reps are adjusted as
you go; a skipped block is skipped; stopping early offers to log what happened.
The plan is the question, the entries are the answer.

**Answers feed the planner.** Done, skipped and swapped counts per movement are
the evidence for the preference model (0026). A snack left proposed or started
expires at the end of its day.

## Why

**The scoring already knows what a snack is.** The spacing score merges entries
close together into one bout, whatever produced them. A second, explicit notion
of a session would disagree with it the first time someone logs a set by hand
in the middle of a guided snack.

**Adherence is only measurable against what was asked.** Keeping the proposal
is what lets the planner learn that burpees get skipped in hotel rooms. Keeping
it as a record rather than a container is what stops it becoming a workout.

## Consequences

- Removing the whole snack feature would leave every log intact and every
  number unchanged.
- The player can resume after a reload (progress in `localStorage`, the plan on
  the server) without the log ever holding half a workout.
