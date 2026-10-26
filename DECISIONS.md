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
- **No trade calculator for now:** the Trade Evaluator is removed from the planned Stage 3 and will be replaced by another feature (to be defined). FantasyCalc values stay display-only. *(Updated 2026-10-26: Stage 4 uses them to produce display-only positional market-value labels; they are still never used for tiers, stance or any trade calculation.)*

## 2026-10-25: Stage plan revised
- The FantasyCalc valuation import (previously "Stage 2") is complete and approved.
- **Stage 2 (revised) is the Team Analyzer**: a tab that sorts every team in one league into Contender / Bubble / Seller / Deep Rebuild and suggests a stance for the owner's team. It's added alongside the existing features, not a rebuild. Tier, confidence and stance rules need owner approval before they're implemented.
- Still out of scope: partner matching, trade evaluator/finder, lineup manager, multi-source valuations. *(Positional-needs analysis moved in scope on 2026-10-26: see Stage 4 below.)* FantasyCalc values may be shown as context in the analyzer but not used in its tier logic.

## 2026-10-25: Team Analyzer rules approved
- **Tier, confidence and stance rules approved** as written in TRADE_LOGIC.md ("Team Analyzer").
- **Best ball standings:** the owner checked Sleeper; best ball leagues are ordered by **record**. So no extra confidence cap for them.
- **Co-owners:** keep the existing handling. A roster you own or co-own is "your team"; if you appear on more than one roster in a league, no team is treated as yours and the app says so.
- **Pick values (display only):** a team's future picks use FantasyCalc's plain per-round value (e.g. "2027 1st"), not Early/Mid/Late. Picks FantasyCalc doesn't list show no value.
- CLAUDE.md config lines (username, league formats) restored after a template update reset them to placeholders.

## 2026-10-25: Stage 3 (hosting) decisions
- **Hosting:** stay on GitHub Pages + GitHub Actions (free, HTTPS, deploys from `main`). The scheduled values job stays in the same workflow. If GitHub's hourly schedule still hasn't fired after ~24 hours, add a free cron-job.org timer that triggers the workflow (its GitHub key lives only in cron-job.org).
- **Phone caching (service worker), approved:** app files precached; a new version activates immediately and the app reloads onto it; update checks on every return to the foreground and hourly. Sleeper data is never cached by the service worker. The FantasyCalc index is network-first (offline: last copy); snapshot files are time-stamped and never change. Staleness is always judged from the snapshot's own fetch time.
- **Access:** public, with a `noindex` tag.
- **Commit email:** commits use GitHub's private address (129905720+kapes10@users.noreply.github.com). The 7 earlier commits were rewritten to remove the personal email; the owner approved replacing the public history.
- **League names in docs:** fine to keep; don't change them.
- **Failure test:** a manual-run checkbox records a simulated failed fetch without contacting FantasyCalc and without using up the 3-hour allowance.

## 2026-10-26: Stage 3 (hosting) approved
- The owner tested the hosted app on phone and computer and approved Stage 3.
- GitHub's schedule ran only 5 times in its first ~21 hours. The owner accepts values sometimes being a few hours stale (the warning shows), so the cron-job.org fallback (Option B) is **deferred** as a possible future update.

## 2026-10-26: Stage 4 (positional market-value analysis) approved
- **Scope (in scope now):** positional market-value analysis added to the Team Analyzer. It is **display-only**: needs and surpluses never feed tier assignment, confidence or the stance logic, which stay unchanged. Everything is labeled "market value, not projected production"; the market-value lineup is an analytical estimate, never a weekly lineup recommendation.
- **Decisions made by the owner (not to be reopened):**
  - Strength = the FantasyCalc market value of the assigned lineup at each position, ranked among teams in the same league.
  - Injury status is a visible note only; no automatic value penalty.
  - No extra age adjustment on top of dynasty FantasyCalc values (the tier logic's existing use of roster age is unchanged).
  - Needs and surpluses do not feed tier assignment or the stance; display-only.
- **Slot interpretation (confirmed for all 23 leagues):** slot types in use are QB, RB, WR, TE, FLEX, SUPER_FLEX, BN; none unsupported. FLEX = RB/WR/TE; SUPER_FLEX = QB/RB/WR/TE; eligibility from Sleeper's `fantasy_positions`. Travis Hunter (Sleeper: DB, eligible DB/WR) counts as a WR. Rostered kickers fill no slot and are counted as "not analyzed". IR and taxi players never fill lineup slots. In best ball leagues, "Sleeper's current starters" is the lineup Sleeper has stored. Any other slot type is flagged as unsupported, never treated as FLEX.
- **Market-value lineup:** built by optimal assignment (each player fills at most one slot) to maximise total matched value; unvalued players only fill a slot no valued player can.
- **Strength labels:** rank by lineup value at the position among active teams. Top third = **strong**, middle third = **adequate**, bottom third = **need** (relative: about a third of teams are a need at each position). Starters decide the rank; bench depth doesn't.
- **Depth and surplus:** useful depth = the most valuable bench players at the position, up to 1 QB, 2 RB, 2 WR, 1 TE. A further bench player is a **surplus** player if worth at least **10 on the approved 0–100 scale**. A position is labeled **surplus** if it has a surplus player and isn't a need.
- **Coverage:** a position's label is **withheld** ("not enough data") if a player Sleeper currently starts there has no value, or the market-value lineup can only fill a slot there with an unvalued player. It is **low confidence** if more than a third of the team's active players at that position are unvalued. Unvalued players are always counted and shown, and excluded from totals (never treated as zero).
- **League types:** **dynasty only.** Redraft and keeper leagues show "positional analysis is available for dynasty leagues only" (no redraft or keeper handling built). In dynasty, IR and taxi players are shown as roster assets in a separate "stashed, not in lineup" section and don't count toward strength or surplus.

## 2026-10-26: Stage 4 approved
- The owner reviewed and approved Stage 4 (positional market-value analysis); deployed the same day.

## 2026-10-26: Stage 4 review changes
- **Withheld positions are never ranked (owner approved):** if a team's position label is withheld ("not enough data"), that position gets no rank and is left out of the comparison. Ranks and the strong/adequate/need thirds at each position are calculated only among the teams with enough data there ("#3 of 11 compared"). The league overview leaves those teams out and shows how many teams were compared. Low-confidence positions stay in the comparison. This replaces "ranked among active teams" in the Stage 4 entry for withheld positions only; no other Stage 4 rule changed.
- Tier-card market-value lines also name incomplete positions ("not enough data at QB", "low confidence at TE"), so a short line never reads as a clean assessment.
- The FantasyCalc notice on the Team Analyzer now says the values are used for the display-only positional analysis and are not used for tiers or the stance (it previously said "context only").
