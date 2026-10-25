# Notes

## Status (2026-10-25)

- **Stage 1** (Sleeper connection + roster view): approved, committed.
- **FantasyCalc valuation import** (previously called Stage 2): complete and approved 2026-10-25; **live at https://kapes10.github.io/Sleeper-Companion/**.
- **Stage 2 (revised): Team Analyzer**: approved 2026-10-25 and deployed.
- **Stage 3: hosting**: built and committed locally, **awaiting the owner's force-push** of the rewritten history (blocked for the assistant as a destructive action), then on-device checks.

### Team Analyzer: verified 2026-10-25 (week 7)
- `npm run test:live` ran the analyzer on all 23 real leagues: every team placed exactly once, no errors.
- Production build in headless Edge at 390 px with real data: tab and league list, results for The Dynasty Collective, Hype Train BB Dyno 28 and Game On Dynasty; no horizontal scroll. The roster view and match report still work.
- Not seen live: an abandoned roster, a co-owned roster of yours, a redraft or keeper league, playoffs/offseason, a passed trade deadline. These are covered by tests built from modified copies of real data only.

### FantasyCalc values: verified live on 2026-10-25
Production build in headless Edge at phone width, with real Sleeper data and two real FantasyCalc snapshots:
- The Dynasty Collective (12-team set): 24 of 25 players have values; Luke McCaffrey shows "no value".
- Game On Dynasty (10-team set): 29 of 29 players have values.
- Hype Train BB Dyno 28 (best ball): 26 of 28 players have values.
- Match report: 395 of 395 FantasyCalc player rows matched a Sleeper ID in both snapshots.
- Static FantasyCalc attribution link is in the initial HTML. No horizontal scrolling at 390 px.
- Across all 23 leagues: 605 of 634 roster spots (95.4%) have a value. The 13 players without one aren't in FantasyCalc's 395-player list.

### Live deployment check (2026-10-25)
- First GitHub Actions run (15:35 UTC): tests passed, both formats fetched (2 calls, 396 players each), deployed.
- Live site in headless Edge at phone width: values on The Dynasty Collective (24/25), Game On Dynasty (29/29), Hype Train BB Dyno 28 (27/28); match report 396/396 matched in both snapshots.

### FantasyCalc calls made during development (before deployment)
| Parameter set | Called at (UTC) | Next call allowed (UTC) |
|---|---|---|
| dynasty-2qb-12tm-ppr1-teplus | 2026-10-25 01:57:56 | 04:57:56 |
| dynasty-2qb-10tm-ppr1-teplus | 2026-10-25 02:18:03 | 05:18:03 |


### Not yet verified
- **Scheduled (hourly) runs:** confirm over the next few hours that they skip until 3 h have passed, then refresh. Not yet seen: a real failed fetch and the stale banner on the live site.
- **Cross-device:** same values on phone and desktop. This follows from serving one set of files, but it needs checking on real devices after deployment.
- **CSV import with a real file:** tested only with hand-made fixtures.

### Known limitations
- FantasyCalc can't model best ball, passing-TD points, yardage/first-down bonuses or lineup sizes, and treats TE premium +0.5 and +1.0 the same. Shown as notes on each roster.
- Scaled values are relative to each snapshot's top player, so one player's number can move when the top player's value moves.
- GitHub may run scheduled jobs late, and pauses schedules after 60 days without commits.
- CSV sets are stored on one device only.

### Team Analyzer limitations
- **Undocumented settings:** playoff spots, playoff start week, median games and trade deadline are present in Sleeper's league data but not documented. If Sleeper drops them, the analyzer says what's missing instead of guessing.
- **Tiebreakers:** Sleeper doesn't publish them; standings use win %, then points for.
- **Pick holdings:** worked out from traded picks only, for the seasons that appear in trades (2027–2028 in most leagues). Picks further out aren't counted.
- **Ages:** Sleeper's `age` field (whole years, calculation undocumented).
- **Recent trades:** the last 3 weeks of completed trades, shown as context only.
- **No intent data:** tiers are estimates, labeled as such.
- **Old cache left behind:** the previous player-list cache (without ages) stays in browser storage until cleared; harmless, about 2 MB.

## Resolved in the Stage 2 review (2026-10-25)
- CSV 0–100 scale approved.
- Trade calculator dropped from Stage 3 for now.
- AGENTS.md rewritten to mirror CLAUDE.md (keep them identical).
- CSV scoring compatibility fixed: imports now record teams, PPR and TE premium tier, and a CSV set is only used when all five format settings match the league. A set saved before this fix has no scoring recorded and is never used; the roster says so and asks for a re-import.

## Open questions for the owner
1. **Hourly schedule:** the first scheduled run happened at 19:05 UTC on 2026-10-25, about 3.5 hours after setup. It fetched both formats on its own (2 calls) and deployed. Keep an eye on it for a day; if scheduled runs stop, set up the cron-job.org fallback.
2. **On-device checklist** (README) on iPhone and Android: owner to confirm.

## Next step
Owner force-pushes (command in the Stage 3 summary), then runs the on-device checklist.
