# 10. Cardio gets a second radar series, not a share of the first

**Status:** Accepted · 2026-09-07 · refines [0008](./0008-cardio-stays-off-the-radar.md)

## Context

ADR 0008 kept cardio off the radar entirely: effective sets are scaled by
`(1 - cardioBias)`, so the twelve spokes show resistance work and nothing else.
That is right about the *number* and wrong about the *chart*. A 10 km run really
does load calves, quads and hamstrings, and a radar that draws nothing after one
answers "what have I been loading?" with a shrug — the same objection ADR 0008
itself raised against a blank body map, and answered there with an outline.

## Decision

The radar carries **two series**: strength in effective sets per week (blue) and
cardio in MET-minutes per week (orange), both per muscle-group axis. They are
drawn as separate lines with separate colours, never stacked, summed or blended.

Cardio's MET-minutes are placed on the effective-set scale by the exchange rate
implied by the two guideline targets, exported as `MET_MIN_PER_EFFECTIVE_SET`:
600 MET-min and 60 effective sets are each one guideline-week, so 10 MET-minutes
plot as far out as one effective set.

ADR 0008 is otherwise untouched: `strengthWeight` still zeroes a run's effective
sets, the body map fill still means resistance work, and "days since last
trained" still ignores pure cardio.

## Why

The rejected option in ADR 0008 was a *damped effective-set credit* — folding
MET-minutes into the strength number at some ratio — and it was rejected because
one number would then be doing two jobs. That objection does not apply to a
second line: both jobs still have their own number, their own colour and their
own key. It is the body map's outline argument applied to the other chart.

The exchange rate is not a new invention needing its own justification. The
calendar already converts between the two currencies exactly this way to shade a
day, so pulling the constant out of `lib/balance.ts` means the radar, the
calendar and the balance marker can never disagree about what a run was worth.

The conversion happens in `lib/queries.ts` and is injected into `buildStats` as
`cardioLoadFor`. `lib/scoring.ts` therefore still knows neither the MET maths nor
the exchange rate, and a value import of `lib/balance.ts` — which would close an
import cycle — stays unnecessary.

## Rejected

**A blended single line.** Rejected in ADR 0008 and still rejected: the radar
would answer neither question.

**Separate normalisation per series.** Each series scaled to its own maximum
would make every chart look balanced and no comparison mean anything.

**Four lines (both series, both periods).** Unreadable on twelve spokes at phone
width. The previous-period overlay is one dashed outline of the two combined,
because "am I doing more or less than I was" is a question about total training.

## Consequences

A run shows up as a thin orange line over the legs rather than as nothing. The
strength line is unchanged from before this decision, so nobody's history moves.

Cardio's muscle mappings were written thin on purpose (a run credits 0.25 to
three muscles), so a guideline-meeting week of running draws a visibly smaller
orange shape than a guideline-meeting week of lifting draws in blue. That is
accurate about stimulus and will still surprise someone who ran 40 km; the
legend under the chart states the exchange rate for exactly that reason.
