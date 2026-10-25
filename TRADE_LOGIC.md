# Trade logic and valuation rules

Only owner-approved formulas live here. No trade logic exists yet.

## Valuation sources
| Source | What it is | How it gets in |
|---|---|---|
| FantasyCalc (`/values/current`) | Market/trade value, crowd-sourced from real trades. **Not a projection.** | Scheduled job, every ≥ 3 h per parameter set |
| Manual CSV | Whatever the owner imports; labeled with its stated source and date | Uploaded by hand, kept on that device only |

Sources are never blended. The roster view shows one source at a time and names it.

## 0–100 scale (approved 2026-10-25)
`scaled = FantasyCalc value ÷ highest player value in the same snapshot × 100`, rounded to a whole number.

- Draft picks are excluded when finding the highest value.
- A matched player whose scaled value rounds below 1 is shown as **"<1"**, never 0.
- An unmatched player shows **"no value"**.
- The raw source value is always stored and shown alongside.
- Because each snapshot is rescaled, the top player is always 100. A player's scaled value can move when the top player's value moves.

Examples (dynasty / 2 QB / 12 teams / PPR 1 / te+, 2026-10-25):

| Player | Raw | Scaled |
|---|---|---|
| Josh Allen | 10,708 | 100 |
| Jeremiyah Love | 5,412 | 51 |
| Rome Odunze | 2,230 | 21 |
| CJ Donaldson | 225 | 2 |
| Foster Moreau | 3 | <1 |

**Manual CSV sets (approved 2026-10-25):** same formula, with the top value taken from that CSV set.
