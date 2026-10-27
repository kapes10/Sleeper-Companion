# Test fixtures

- `user*.json`, `league_*.json`, `players_subset.json`, `nfl_state.json`: real Sleeper responses, **redacted** by `scripts/capture-fixtures.mjs` (user/league IDs and names replaced).
- `fantasycalc/dynasty-2qb-12tm-ppr1-teplus.trimmed.json`: a real FantasyCalc `/values/current` response (fetched 2026-10-25T01:57:56Z, `isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te+`), **trimmed** to the top player, the players on the two fixture owner rosters, and 3 draft picks. Rows are unmodified.
- `fantasycalc/synthetic-messy.json`: **hand-made**, not real data. Covers missing fields, nulls, text values, duplicates and picks.
- `csv/synthetic-sample.csv`: **hand-made** values for tests only. Not real valuations.
- `analyzer/`: **redacted** real Sleeper data from four of the owner's leagues (2026-10-25, week 7), from `scripts/capture-analyzer-fixtures.mjs`. `players.json` gained each player's NFL `depth_chart_order` from Sleeper's 2026-10-26 player list (added 2026-10-27).
  - `analyzer/fantasycalc-*.trimmed.json`: real FantasyCalc `/values/current` responses as published on 2026-10-26 14:20 UTC. Trimmed to the top player, players on the four fixture leagues' rosters, and all draft picks; rows unmodified.
  - `analyzer/tier-baseline.json`: Team Analyzer tier/confidence/stance outputs recorded **before** Stage 4. The regression test checks they never change.
