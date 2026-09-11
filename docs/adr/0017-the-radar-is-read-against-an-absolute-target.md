# 17. Volume is read against an absolute target, not against the user's best spoke

**Status:** Accepted · 2026-09-11

## Context

Two places measured a muscle group against the user's **own** best-served group.

`MuscleRadar` scaled every spoke by the largest spoke:

```ts
const max = Math.max(1, ...shaped.map((d) => Math.max(d.current, d.cardio, ...)));
```

`rankAxes` scored volume deficit against the busiest axis:

```ts
const busiest = Math.max(0, ...axes.map((a) => a.perWeek));
score: scoreOf(daysSince, busiest > 0 ? 1 - axis.perWeek / busiest : 1)
```

Both are purely relative. Neither knows what enough is, and the consequence was
a chart that congratulated the wrong person. Someone doing one easy set per
group per day saw:

- a large, even, fully-inflated polygon — their own maximum defined the outer
  ring;
- a deficit of zero on every axis, since `perWeek / busiest = 1` everywhere;
- no "needs attention" rows, because that list was ordered by staleness alone
  and nothing was stale.

Every visual and every nudge said they were doing well, at roughly a fifth of
the volume associated with meaningful hypertrophy.

The inverse held too. 30 sets a week on chest and 8 on hamstrings — a perfectly
good hamstring volume — scored hamstrings at a 0.73 deficit, because the
yardstick was chest rather than what hamstrings actually need.

## Decision

**Per-muscle weekly volume is the reference**, from `lib/volume.ts`:

- ~**10 hard sets per muscle per week**, where the dose–response is clearly
  established (Schoenfeld, Ogborn & Krieger 2017, *J Sports Sci*);
- ~**20** as the upper bound, where gains continue with diminishing returns
  (Baz-Valle et al. 2022; Pelland et al. 2024).

Three consequences:

1. **The radar carries the target as a ring** and the upper bound as a fainter
   one outside it, and the radial scale includes the target — so an
   under-trained log draws a small polygon inside a large reference rather than
   a full one. Auto-scaling survives only for the case it was right for: a user
   already past the target, whose own volume then sets the outer ring.
2. **`rankAxes`'s deficit term is absolute** — `1 - min(1, perWeek / target)` —
   with the relative-to-busiest term deleted rather than kept as a tie-break. It
   earned no place: staleness already breaks ties, and the term's only effect
   was the two failures above.
3. **"Needs attention" has a second reason**: below target volume, not just
   stale. Each row says which reason put it there.

The per-muscle target is **configurable** in Settings, like the step baseline
and the active window, clamped to 4–40.

## Why

**Per-axis target = per-muscle target × muscles in the axis.** An axis is a
rollup of one to three muscles and its value is their sum, so chest wants ~10
and shoulders — front, side and rear delts — wants ~30. The reference is
therefore a lumpy polygon rather than a circle, and that is correct: it is one
literature number honestly projected onto twelve spokes of different sizes. A
circular ring would have meant three different things depending on the spoke.

**A band, not a line.** The evidence is a range and a single ring would claim a
precision the meta-regressions do not have. The outer bound is deliberately left
out of the radial scale — including it would halve every real polygon to make
room for a line most people never reach — and is therefore drawn only once the
user's own volume has pushed the radius out to it, which is also exactly when it
is the interesting number. It has to be conditional rather than merely
out-of-domain: recharts' polar scale is an unclamped linear scale, so a datum
above the domain is not clipped to the plot but projected past the outer radius,
through the spoke labels and off the edge of the SVG. The copy names the upper
number either way.

**Solid grey, not dashed.** Dashed grey is already the previous-period overlay.
A solid thin grey ring reads as a gridline placed at a radius that means
something, which keeps it in `PolarGrid`'s vocabulary rather than the data's —
and keeps [0013](./0013-one-colour-one-quality.md)'s rule intact, since a
reference is not a quality and gets no colour of its own.

**Configurable, with the literature value as the default.** Someone deliberately
running a higher-volume block should be able to say so and have the chart agree
with what they are aiming at, rather than draw a permanently full polygon.

## Rejected

**Normalising each spoke to a per-muscle average** so one circular ring works
everywhere. Cleaner to draw, and it changes what the radar's shape means —
"back" would stop being back's total volume — which breaks the comparison with
the body map and with the cardio series' exchange rate.

**Keeping relative-to-busiest as a secondary tie-break.** It answers "what is
falling behind the rest of your training", which sounds useful and is not: it is
unanswerable in the one case that matters (everything equally thin) and actively
wrong in the other (a good axis beside a better one).

## Consequences

A user who was under-trained and did not know it now sees it, which is the
point and is also the least comfortable change in the app so far. The copy
still does not scold — the rows state a number against a target, and the ring is
a reference rather than a score.

An axis can still reach its target lopsidedly: 30 on lats and nothing on lower
back reads as a full back spoke. That is a property of rolling three muscles
into one spoke at all, which the body map exists to show, and having a target
does not make it worse.
