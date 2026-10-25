# Test fixtures

- `user*.json`, `league_*.json`, `players_subset.json`, `nfl_state.json`: real Sleeper responses, **redacted** by `scripts/capture-fixtures.mjs` (user/league IDs and names replaced).
- `fantasycalc/dynasty-2qb-12tm-ppr1-teplus.trimmed.json`: a real FantasyCalc `/values/current` response (fetched 2026-10-25T01:57:56Z, `isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te+`), **trimmed** to the top player, the players on the two fixture owner rosters, and 3 draft picks. Rows are unmodified.
- `fantasycalc/synthetic-messy.json`: **hand-made**, not real data. Covers missing fields, nulls, text values, duplicates and picks.
- `csv/synthetic-sample.csv`: **hand-made** values for tests only. Not real valuations.
