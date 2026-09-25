# 26. The planner proposes a whole snack for a place, from five signals, and explains it

**Status:** Accepted · 2026-09-25 · extends [0011](./0011-spacing-score.md) and the suggestion bar

## Context

The day page used to open with one line: the muscle group that had waited
longest and a catalogue movement that trained it. Useful at home, one step
short of useful anywhere else. Someone in a hotel room with four minutes before
a call needs to know what to do *there*, *now*, *how much of it*, and needs to
be able to start without reading anything.

## Decision

**Places are first-class** (`TrainingContext`). Every account starts with four —
Home, Office, Hotel room, On the move — each a preset that is honest about what
is usually there: a hotel room has a chair, a desk, a wall, a door and a towel,
and someone asleep downstairs; a station platform has stairs and a wall and
nowhere to lie down. A place is a set of equipment plus three constraints:
*quiet* (nothing that thumps), *floor* (lying down is fine), *sweat* (0 stay
presentable … 2 anything goes). The Today card switches places in one tap.

**Furniture is equipment.** The vocabulary is places as much as kit: chair,
desk, wall, door, stairs, towel, a loaded bag sit beside dumbbells and a
barbell. A movement states what it needs as requirements with alternatives —
`chair|bench` is one requirement met by either, `door towel` is two — and
carries a snack profile: impact, floor, sweat, a snack-sized dose, whether it is
one side at a time, coaching cues. The catalogue describes all 110 movements; a
custom movement with no description is inferred conservatively from its
category, or never proposed, rather than proposed somewhere it embarrasses.

**Five signals, multiplied into one utility per movement** (`lib/snack/planner.ts`):

| Signal | What it answers | Source |
| --- | --- | --- |
| Need | what the week is short of | `rankAxes`, the same ranking as the old suggestion, cardio competing on the same scale |
| Readiness | what the last hours already covered | fatigue per muscle decaying with a 16 h half-life against a tolerance of 6 effective sets; cardio 4 h against 150 MET-min; a multiplier with a floor, never a veto |
| Today | what today's rings still ask | a closed ring still counts, at about a third |
| Place | whether it can be done here at all | a hard filter: kit, floor, quiet, sweat, and one bout fitting the minutes |
| Habit | whether this person does it when asked | Beta-Bernoulli posterior per movement over done/skipped/swapped, Thompson-sampled within ±25% |

**Composition is greedy with diminishing returns**: a two- or three-movement
snack comes out as a push, a pull and a leg movement because choosing push-ups
mostly satisfies chest, not because a rule says so. Strength or cardio is
decided by which need is larger here and now; short vigorous cardio becomes
EMOM intervals.

**Dosing is double progression** (`lib/snack/dose.ts`) from the last time the
movement was logged, driven by the effort reported then: easy, two more reps;
hard, one more; to failure, one fewer; unrated, the same again. Nothing
progresses on a movement already trained today. On a loaded movement, reps past
the top of the range move the load up; where the load is not to hand, it is
prescribed as bodyweight and says so. A movement that has stalled for weeks is
offered its harder variant.

**Every block says why** — "Quads · 6 days since last trained", "Chest
trained 2 h ago, so back instead" — and any block can be swapped, any movement
logged by hand, and nothing is gated on doing what it says.

**Plans are reproducible.** Randomness (the Thompson draw, tie-breaks) comes
from a generator seeded by the user, the day, the place, the minutes, the focus
and how many snacks today already has, so the same situation gives the same
plan until something changes — and "Something else" bumps a nonce to ask for a
different one.

## Why

**Multiplicative signals** because each can veto softly: an overdue group that
was hammered an hour ago should drop, not be averaged away; a movement that
cannot be done here must score nothing.

**Thompson sampling** because the planner has to learn what each person will do
without a hand-tuned "try something new every fifth time", and it is the
best-studied answer to exactly that trade-off.

**Explanations** because the planner only knows what was logged. A plan that
cannot be argued with is a prescription; this one is a suggestion from
something that cannot see a sore shoulder.

## Consequences

- `tests/snack-planner.test.ts` pins the behaviours above: place filters,
  readiness steering, composition, progression, determinism.
- A movement someone adds gets proposed once it is described; until then it is
  still loggable, just not planned.
