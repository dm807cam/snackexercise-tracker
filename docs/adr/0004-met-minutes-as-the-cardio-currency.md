# 4. Cardio is scored in MET-minutes

**Status:** Accepted · 2026-09-07

## Context

Effective sets cannot score a run (ADR 8). Cardio needs a unit of its own before
it can be compared with anything.

## Decision

MET-minutes: metabolic equivalents times minutes. METs are resolved from the
best available evidence — heart rate, else pace via the ACSM equations, else the
movement's catalogue value, else a generic 6.

## Why

Four candidates were considered:

| Unit | Problem |
| --- | --- |
| Minutes | Makes a 60-minute walk 1.5x a 40-minute interval session. |
| Kilocalories | Needs bodyweight, and makes a heavier person look fitter at identical effort. |
| sRPE (RPE x minutes) | The sports-science standard, and it requires rating every session 1-10. Nobody logging one-handed on the stairs will do that. |
| **MET-minutes** | Bodyweight-independent, needs nothing the user must rate, has a published anchor. |

The anchor decided it. The WHO's weekly target is "150 minutes moderate **or**
75 minutes vigorous", and both halves land on the same number in MET-minutes
(150 x 4 = 600; 75 x 8 = 600). A unit in which the guideline's own "or" is an
identity is the right unit.

The evidence ladder means the number improves when the user gives it something
to work with, without ever demanding anything: a run with a distance and a time
is scored from its actual pace, and a run with neither still scores.

## Rejected

**A fixed MET per movement.** Simpler, and it rounds every run to the same
number, which throws away the one thing a runner most wants reflected.

**Deriving METs from heart-rate reserve.** More correct in principle, and it
needs a resting heart rate and an age the app does not have. The implementation
scales the movement's nominal METs by %HRmax against a 150 bpm anchor instead,
clamped — an explicitly relative measure, not a claim about absolute intensity.

## Consequences

MET-minutes are a plus-or-minus-twenty-percent instrument, and the ACSM
equations run 5-8% above the Compendium's tables at running speeds. This is
acceptable only because the number is used inside a ratio (ADR 5), where a
systematic bias on the cardio side moves the answer far less than it moves
either number alone. Any future use of MET-minutes as an absolute figure needs
to re-examine this.
