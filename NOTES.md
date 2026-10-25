# Notes

## Status (2026-10-25)

- **Stage 1** (Sleeper connection + roster view): approved, committed.
- **Stage 2** (FantasyCalc values): built and committed locally, **awaiting owner review**. Not yet pushed to GitHub.

### Stage 2: verified live on 2026-10-25
Production build in headless Edge at phone width, with real Sleeper data and two real FantasyCalc snapshots:
- The Dynasty Collective (12-team set): 24 of 25 players have values; Luke McCaffrey shows "no value".
- Game On Dynasty (10-team set): 29 of 29 players have values.
- Hype Train BB Dyno 28 (best ball): 26 of 28 players have values.
- Match report: 395 of 395 FantasyCalc player rows matched a Sleeper ID in both snapshots.
- Static FantasyCalc attribution link is in the initial HTML. No horizontal scrolling at 390 px.
- Across all 23 leagues: 605 of 634 roster spots (95.4%) have a value. The 13 players without one aren't in FantasyCalc's 395-player list.

### FantasyCalc calls made during development
| Parameter set | Called at (UTC) | Next call allowed (UTC) |
|---|---|---|
| dynasty-2qb-12tm-ppr1-teplus | 2026-10-25 01:57:56 | 04:57:56 |
| dynasty-2qb-10tm-ppr1-teplus | 2026-10-25 02:18:03 | 05:18:03 |

The first GitHub run starts with no published history, so it will call both sets. **Don't push before 2026-10-25 05:19 UTC**, or that run would break the 3-hour rule.

### Not yet verified
- **The GitHub Actions workflow has never run on GitHub.** Scheduled runs, Pages deployment, `pull-values` against the real site, and a real failed-fetch-then-stale banner on the live site all still need checking after setup.
- **Cross-device:** same values on phone and desktop. This follows from serving one set of files, but it needs checking on real devices after deployment.
- **CSV import with a real file:** tested only with hand-made fixtures.

### Known limitations
- FantasyCalc can't model best ball, passing-TD points, yardage/first-down bonuses or lineup sizes, and treats TE premium +0.5 and +1.0 the same. Shown as notes on each roster.
- Scaled values are relative to each snapshot's top player, so one player's number can move when the top player's value moves.
- GitHub may run scheduled jobs late, and pauses schedules after 60 days without commits.
- CSV sets are stored on one device only.

## Open questions for the owner
1. **0–100 scale for CSV sets:** I applied the approved FantasyCalc formula, with the top taken from the CSV set. Confirm, or choose something else (TRADE_LOGIC.md).
2. **FantasyCalc's trade-calculator restriction:** decide before Stage 3 (DECISIONS.md).
3. **AGENTS.md:** it's untracked. Should it be committed? It will be public once pushed.

## Next step
Owner reviews Stage 2. Then the owner sets up GitHub (README → "Put it online") after 05:19 UTC on 2026-10-25, and we verify the first live runs together.
