# Architecture decision records

One file per decision that would otherwise be re-argued every six months.

Each records the decision, what was actually at stake, what was rejected and
why, and — where a decision is a judgment call rather than a derivation — says
so plainly, so that a future reader can overturn it on purpose rather than by
accident.

| | Decision | Status |
| --- | --- | --- |
| [0001](./0001-cardio-rides-on-setentry.md) | Cardio is a `SetEntry`, not a new table | Accepted |
| [0002](./0002-cardio-bias-is-continuous.md) | `cardioBias` is a float, not a modality enum | Accepted |
| [0003](./0003-steps-are-a-daily-metric.md) | Steps get their own table, keyed on `localDate` | Accepted |
| [0004](./0004-met-minutes-as-the-cardio-currency.md) | Cardio is scored in MET-minutes | Accepted |
| [0005](./0005-guideline-normalised-balance-index.md) | The balance marker normalises each side by its own guideline | Accepted |
| [0006](./0006-beta-prior-and-uncertainty-band.md) | A Beta prior supplies both the marker and its band | Accepted |
| [0007](./0007-steps-are-discounted-and-personally-baselined.md) | Steps count at half weight above a personal baseline | Accepted, contested |
| [0008](./0008-cardio-stays-off-the-radar.md) | Cardio contributes no effective sets | Accepted |
| [0009](./0009-active-days-ignores-steps.md) | `activeDays` stays "days with entries" | Accepted, contested |
| [0010](./0010-cardio-is-a-second-radar-series.md) | Cardio gets a second radar series, not a share of the first | Accepted |
| [0011](./0011-spacing-score.md) | Spacing is scored by gap concentration against a target frequency | Accepted |
| [0012](./0012-times-are-typed-not-stamped.md) | A typed time beats an instant built in the browser | Accepted |
| [0013](./0013-one-colour-one-quality.md) | One colour, one quality — and `--accent` is not one of them | Accepted |
| [0014](./0014-a-daily-share-with-no-carry-over.md) | Today's target is a flat seventh, and nothing carries over | Accepted |

## Format

Short. If an ADR takes more than a screen, the decision was probably two
decisions.
