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

## Team Analyzer (approved 2026-10-25)

Tiers are **estimates inferred from public league data**, never statements of what a manager intends. Rules are applied in order; there are no hidden weights.

### Inputs (all from Sleeper)
- Record (wins, losses, ties) and points for/against per roster.
- League settings: playoff teams, playoff start week, regular-season start week, whether a game against the league median is counted each week, trade deadline, league type (dynasty/keeper/redraft). These fields are present in Sleeper's league data but **not documented**; the app says so.
- Traded draft picks; completed trades; player ages from Sleeper's player list.

### Standings
- Teams are ranked by win percentage (a tie counts as half a win), then points for. Sleeper's real tiebreakers aren't published, so this is an assumption and is shown as one.
- Ownerless rosters stay in the standings (they hold a spot) but are excluded from the tier lists.
- **Games back** between two teams = ((leader's wins − team's wins) + (team's losses − leader's losses)) ÷ 2, with each tie counting as half a win and half a loss.
- **Games remaining** = regular-season weeks left × games per week (2 per week in leagues that count a median game, otherwise 1).
- **Playoff line** = between the last playoff seed and the first team out.
- **Reach** = the larger of 1 game or ¼ of the games remaining.
- **Far out** = at least ½ of the games remaining back of the last playoff seed, or more games back than there are games left.

### Tiers
1. **Contender:** in a playoff spot, at least 1 game clear of the first team out, and in the top half of the league in points for.
2. **Bubble:** in a playoff spot but not a Contender, or out of a spot but within reach.
3. **Seller:** out of a spot and beyond reach.
4. **Deep Rebuild** (dynasty/keeper only): a Seller who is far out **and** either has a young roster (median player age at least 1 year below the league's median team age) or has gained at least 2 future 1st/2nd-round picks through trades.
- **Redraft leagues:** no Deep Rebuild tier; age and pick signals aren't used.

### Confidence
- **0 games scored:** no tiers.
- **1–2 weeks scored:** every team is Low.
- **3–4 weeks scored:** Medium at most.
- **5+ weeks scored:** decided by how far the team sits past the line that decided its tier:
  - **High:** at least 1 game past it.
  - **Medium:** 0.5 to 1 game past it.
  - **Low:** less than 0.5 game, or a tiebreaker decides which side of the playoff line the team is on.

### Stance for the owner's team
- Contender → **Buy**. Bubble → **Hold**. Seller → **Sell**. Deep Rebuild (dynasty/keeper) → **Sell veterans for youth and picks**.
- Low confidence → "not enough data to recommend", with the leaning shown.
- If the trade deadline week has passed → trades are closed; no stance.
- Playoffs or offseason (no regular-season games left) → no tiers or stance; standings are shown with an explanation.

### Display-only context (not used in tiers)
- Completed trades in the last 3 weeks.
- FantasyCalc total roster value and future-pick value (plain per-round pick values), labeled as FantasyCalc context with attribution.
