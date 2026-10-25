# Decisions

Dated, owner-approved decisions. Do not change without the owner's approval.

## 2026-10-23: Stage 1 approved
PWA (Vite + React + TypeScript + Tailwind), Sleeper public read-only API called directly from the browser (CORS allows it), player list cached 24 h in IndexedDB.

## 2026-10-25: Valuation source and hosting (Stage 2)
- **Source:** FantasyCalc `GET /values/current` only. Free tier (< 1,000 monthly users) with visible attribution. Fetched only by a scheduled job, never by the browser. Each unique parameter set refreshed at most once every 3 hours.
- **Hosting:** Option A, a **public** GitHub repository with GitHub Actions + GitHub Pages. The job runs hourly and only calls FantasyCalc when the last attempt for a parameter set is at least 3 hours old. Snapshots are published as static JSON next to the app, so phone and desktop see the same values. The owner accepted that the code, the Sleeper username, and the stored values are publicly viewable.
- **League mapping:** all 23 leagues map to FantasyCalc parameters (22 → dynasty / 2 QB / 12 teams / PPR 1 / te+; Game On Dynasty → same with 10 teams). Settings FantasyCalc can't express are **accepted with visible notes**: TE premium +0.5 and +1.0 both use `te+`; best ball; passing-TD points; yardage/first-down bonuses; lineup sizes.
- **0–100 scale:** approved (see TRADE_LOGIC.md).
- **CLAUDE.md config:** all 23 leagues in scope; priority test league is The Dynasty Collective.
- **FantasyCalc terms on trade calculators** (data may not be used to "replicate or create a substitute for our trade calculator"): owner will decide whether to email FantasyCalc **before Stage 3**. Until then, FantasyCalc values are display-only.
