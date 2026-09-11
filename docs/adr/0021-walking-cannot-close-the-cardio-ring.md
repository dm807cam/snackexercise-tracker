# 21. Walking fills at most half the cardio ring, and a daily step total is not brisk

**Status:** Accepted · 2026-09-11 · amends [0007](./0007-steps-are-discounted-and-personally-baselined.md), [0014](./0014-a-daily-share-with-no-carry-over.md)

## Context

With the old defaults — `mode: "half"`, `baseline: 4000`, `STEP_CADENCE: 110`,
`STEP_METS: 3.5` — the daily cardio ring closed on walking alone:

| Steps mode | Steps that closed the ring with zero logged cardio |
| --- | --- |
| half (default) | **~9,400** |
| full | **~6,700** |

A 10,000-step day yielded 95 MET-min against a target of 85.7. The ring closed,
`goalHeadline` returned *"Cardio done — strength still open"*, all from ordinary
ambulation.

**This contradicted the app's own stated reasoning.** `stepMetMinutes` is
explicit about what the discount is for:

> the question on the stats page is not "am I meeting activity guidelines", it
> is "is my *training* cardio or strength", and low-intensity ambulation is
> activity rather than training.

That is sound. But the same credit was passed into `buildDailyGoal`, and the ring
is not the marker — it is a training prompt, answering "is there anything left in
me that I owe today?". Answering "no" because the user walked to the shops is the
failure the discount existed to avoid, reintroduced one layer up. The old comment
anticipated the tension and resolved it the other way, reasoning that the two
views must not disagree about the number — but they were never asking the same
question, so agreeing on the number while disagreeing about the question was the
actual inconsistency.

**A second, independent problem: `STEP_METS` was a flat 3.5.** The 100 spm
threshold (Tudor-Locke et al. 2018, CADENCE-Adults) is about *instantaneous
cadence during a walking bout*. It says nothing about a daily step total, which
arrives from a phone as one number and is overwhelmingly accumulated well under
100 spm: kitchen, corridor, shop. Crediting the whole surplus at 3.5 assumed it
was all purposeful brisk walking, and scored 6,000 extra slow steps identically
to 6,000 extra brisk ones.

## Decision

**Steps may fill at most half the daily cardio ring**
(`MAX_STEP_SHARE_OF_CARDIO_RING = 0.5`), applied *only* to the ring. The balance
marker still counts every credited step, at the discount the step weight applies.

**Above-baseline steps are credited at 2.8 METs**, the Compendium's slow-pace
walking, not 3.5.

**`DailyMetric` gains `activeMinutes`** — minutes the phone reports as brisk.
Those are credited at 3.5; the remaining surplus at 2.8. Bounded by the day's
credited minutes, so a phone reporting an hour of activity on 6,000 surplus steps
cannot earn more than was walked.

**Settings names the threshold**: "about N steps fills half a day's cardio ring,
which is the most walking alone can fill."

The ring says when it capped: *"walking is counted, up to half the ring"*.

## Why

**Cap rather than exclude.** The issue offered both, plus a third thin ring.
Excluding the credit entirely would make the ring disagree with the marker about
whether a 14,000-step day carried any cardio at all, and a third ring buys a new
visual element to express "half as much as you think". The cap is the smallest
change that fixes the prompt without discarding the credit, and it keeps the
"one colour, one quality" discipline intact.

**Half.** Enough that a long walk is visibly worth something — it is — and never
enough to finish alone, so the ring goes on meaning "training you did" rather
than "distance you covered incidentally".

**2.8, and 3.5 has to be earned.** Reserving the brisk rate for minutes the phone
actually observed at pace is the honest reading of the cadence literature, and it
turns a fixed assumption into an observation. A day that reports no active
minutes is not penalised for it — it is credited as what a bare step count
describes.

**The cap is stated, not silent.** The credit is real and the stats page counts
all of it. Withholding it invisibly would be the app deciding something on the
user's behalf and not saying so.

## Rejected

**A third, thinner steps ring.** Supported by the app's own colour discipline
and genuinely expressive. It adds a visual element to a 76px figure to say
something one number and one line of copy already say.

**Leaving `STEP_METS` at 3.5 and relying on the cap alone.** The cap fixes the
ring; it does not fix the balance marker or the calendar, both of which were
crediting incidental walking as brisk. The two problems are independent, and the
issue says so.

**Capping in `stepMetMinutes` itself.** It would have applied the cap to the
marker too, which genuinely wants the walking in it — that is the question it
asks.

## Consequences

The balance marker moves for anyone who walks a lot: a lifter who walks 5,000
steps a day now reads 88% strength where they read 86%, because their walking is
no longer credited as brisk. The calendar's shading on walking-heavy days drops
by the same fifth. Both are corrections.

Export goes to version 4; v1–v3 still restore, and a v3 day restores with no
brisk minutes, which is exactly what it had.

The day's step control gains a second field. Most people will never touch either
— the Shortcut writes both — which is why it stays a quiet chip under the summary
rather than becoming a logging affordance.
