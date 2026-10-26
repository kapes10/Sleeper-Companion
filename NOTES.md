# Notes

## Status (2026-10-26)

- **Stage 1** (Sleeper connection + roster view): approved, committed.
- **FantasyCalc valuation import** (previously called Stage 2): complete and approved 2026-10-25; **live at https://kapes10.github.io/Sleeper-Companion/**.
- **Stage 2 (revised): Team Analyzer**: approved 2026-10-25 and deployed.
- **Stage 3: hosting**: **complete and approved 2026-10-26.** Live at https://kapes10.github.io/Sleeper-Companion/ (HTTPS, installable PWA). The owner tested it on phone and computer.
  - Commit history rewritten and pushed: no personal email in commits.
  - Live failure test (2026-10-25 19:38 UTC): simulated failure recorded for both formats, snapshots kept, no FantasyCalc request, the match report showed it. A skipped run kept it, as designed; it cleared at the next due refresh (00:25 UTC).

- **Stage 4: positional market-value analysis**: built 2026-10-26, committed locally (not pushed or deployed), **awaiting owner review**. Rules approved 2026-10-26 (see DECISIONS.md).
  - This is the **first stage where FantasyCalc market values drive analysis output** (need/adequate/strong/surplus labels), not just context. Any future partner matching built on it would pair teams on **market-value** needs, not production needs.

### Stage 4: verified 2026-10-26
- `npm run test:live` ran the positional analysis on all 23 real leagues with the published FantasyCalc values. Every active team got lineups, value by position with rank, and labels. A few positions are withheld (8) or low confidence (5) across all leagues, by the coverage rule.
- Production build in headless Edge at 390 and 320 px with real data (Game On Dynasty): overview, market-value lines on all tier cards, "what to look for", and the team profile with both lineups. No horizontal scroll.
- Tier, confidence and stance outputs match the pre-Stage-4 baseline for all four fixture leagues (regression test).
- **Not verified on a phone yet.**
- Behaviours worth knowing:
  - A player Sleeper currently starts can be listed as **surplus**, because the market-value lineup prefers more valuable players. Example: in Game On Dynasty, Aaron Rodgers starts in Sleeper, but Purdy and Trevor Lawrence fill QB/SF by value. This is about trade value, not who should start.
  - Labels are relative: about a third of teams are a "need" at each position. In the 10-team league the bottom third is ranks 7–10. (The proposal message said 8–10; the rule as approved, "bottom third", gives 7–10.)
  - "Surplus" can appear at a position ranked adequate (e.g. RB #8), because surplus depends on spare bench value, not on the starters' rank.

### Stage 4 slot audit (live, all 23 leagues, 2026-10-26)
- Slot types in use: QB, RB, WR, TE, FLEX, SUPER_FLEX, BN. None unsupported. Six distinct configurations (9 to 12 starters).
- Limitations found:
  - The contents of `roster_positions` and league `settings` (IR and taxi capacity) aren't documented; the roster `taxi` list appears in live data but not in the docs.
  - Travis Hunter is listed as a DB eligible at DB/WR (23 rostered copies); counted as WR.
  - 2 kickers are rostered in leagues with no kicker slot (not analyzed).
  - FantasyCalc values QB/RB/WR/TE only (about 396 players); deep reserves are unvalued.
  - Injury status values aren't documented (seen: Out, IR, Questionable, PUP, NA, DNR). 847 rostered players show "IR" but only 241 sit in IR slots. The app's copy can be up to 24 hours old.
  - No usage or role data (by design: market value only).
  - Today: no rosters shorter than the number of lineup slots and no ownerless rosters (both still handled and tested).

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
1. **Next stage:** owner to describe it.

## Possible future updates (not planned)
- **More reliable value refreshes:** GitHub's hourly schedule ran only 5 times in its first ~21 hours, so values can be stale for a few hours (the app shows the stale warning). The owner decided on 2026-10-26 that this is acceptable for now. If it ever matters, add the cron-job.org timer (Option B in the Stage 3 hosting plan).

## Next step
Owner reviews Stage 4 (desktop and phone). On approval: push to GitHub (deploys).
