# Notes

## Status (2026-10-23)

**Stage 1 (Sleeper connection + dashboard): built, awaiting owner review.** Not yet committed (commit after approval).

### Live check done on 2026-10-23
Ran the production build in headless Microsoft Edge at phone width (390 px) against live Sleeper data for the owner's account:
- Username lookup (typed with a leading `@`) resolved and was remembered.
- 23 leagues for the 2026 season were listed.
- One league's roster ("The Dynasty Collective") showed correct starters, 10 bench, 4 IR, 1 taxi.
- Reloading the page did **not** re-download the player list (served from IndexedDB).
- Blocking the network showed "Couldn't reach Sleeper…" with a Try again button. Earlier data stayed visible.
- The service worker installed and controlled the page; a full reload with no network still opened the app.
- No horizontal scrolling at 390 px.

### Not yet verified
- On a real phone (iPhone Safari / Android Chrome), including "Add to Home Screen" installation. Requires HTTPS hosting (Stage 5).
- Rosters of the other 21 leagues were checked by script (owner mapped in all 23, no unknown player IDs), but only 2 were viewed in the UI.
- Behaviour in the offseason, when Sleeper's `season` and `league_season` can differ.
- Headless **Chrome** in the dev sandbox failed to open CacheStorage (an environment issue; Edge worked). Worth a quick manual check in desktop Chrome.

## Facts learned from the live API
- CORS is open (`access-control-allow-origin: *`), so the browser can call Sleeper directly. No proxy needed.
- `GET /user/@name` returns `null`; the app strips a leading `@`.
- Empty starter slots are `"0"` in `starters`. Starters align with the non-`BN` `roster_positions`.
- `/league/<id>/users` does **not** return `username`, only `display_name`.
- `settings.type`: 0 redraft, 1 keeper, 2 dynasty (observed, not documented).
- All 23 owner leagues are dynasty, superflex, PPR (some TE premium); 15 are best ball.
- `/players/nfl` is ~14.6 MB uncompressed, 12,229 players. Team defenses have no `full_name`.

## Open questions for the owner
1. **Which leagues are in scope** for later stages, and which is the priority test league? (CLAUDE.md §1 is still unfilled for these.)
2. **Best ball leagues:** Sleeper sets these lineups automatically. Lineup review (Stage 4) probably shouldn't apply to them. Confirm?
3. Engineering defaults chosen (no business logic): league/roster data cached in memory for 5 minutes; requests retried twice with backoff; max 4 requests at once.

## Next step
Owner reviews Stage 1. On approval: commit Stage 1, then plan Stage 2.
