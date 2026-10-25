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
- **FantasyCalc terms on trade calculators** (data may not be used to "replicate or create a substitute for our trade calculator"): see 2026-10-25 Stage 2 review below.

## 2026-10-25: Stage 2 review
- **CSV 0–100 scale approved:** manual CSV sets use the same formula as FantasyCalc, with the top value taken from that CSV set.
- **No trade calculator for now:** the Trade Evaluator is removed from the planned Stage 3 and will be replaced by another feature (to be defined). FantasyCalc values stay display-only.

## 2026-10-25: Stage plan revised
- The FantasyCalc valuation import (previously "Stage 2") is complete and approved.
- **Stage 2 (revised) is the Team Analyzer**: a tab that sorts every team in one league into Contender / Bubble / Seller / Deep Rebuild and suggests a stance for the owner's team. It's added alongside the existing features, not a rebuild. Tier, confidence and stance rules need owner approval before they're implemented.
- Still out of scope: partner matching, trade evaluator/finder, lineup manager, positional-needs analysis, multi-source valuations. FantasyCalc values may be shown as context in the analyzer but not used in its tier logic.

## 2026-10-25: Team Analyzer rules approved
- **Tier, confidence and stance rules approved** as written in TRADE_LOGIC.md ("Team Analyzer").
- **Best ball standings:** the owner checked Sleeper; best ball leagues are ordered by **record**. So no extra confidence cap for them.
- **Co-owners:** keep the existing handling. A roster you own or co-own is "your team"; if you appear on more than one roster in a league, no team is treated as yours and the app says so.
- **Pick values (display only):** a team's future picks use FantasyCalc's plain per-round value (e.g. "2027 1st"), not Early/Mid/Late. Picks FantasyCalc doesn't list show no value.
- CLAUDE.md config lines (username, league formats) restored after a template update reset them to placeholders.
