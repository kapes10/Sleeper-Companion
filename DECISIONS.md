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
- Still out of scope: partner matching, trade evaluator/finder, lineup manager, multi-source valuations. *(Positional-needs analysis moved in scope on 2026-10-26: see Stage 4 below.)* *(Market-value partner matching moved in scope on 2026-10-26: see Stage 5 below. Trade evaluator, trade builder, fairness verdicts and acceptance predictions stay out of scope.)* *(An assisted, read-only lineup manager moved in scope on 2026-10-28: see Stage 6 below. Automatic or batch lineup submission and any write to Sleeper stay out of scope.)* FantasyCalc values may be shown as context in the analyzer but not used in its tier logic.

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

## 2026-10-26: Stage 5 (within-league trade partner matching) approved
- **Scope:** market-value partner matching inside one league, reached from the owner's team card ("Trade partners"). It suggests which teams to approach, with possible targets and offers as **assets to consider**. It is **not** a trade builder: no complete trade proposals, no fair/lopsided verdicts, no acceptance probabilities, nothing sent to anyone, nothing written to Sleeper. No projections, extra valuation sources or multi-team trades. Dynasty leagues only.
- **Reads, never changes:** tiers, tier confidence, the owner's stance and every Stage 4 output.
- **Framing:** everything is market value (FantasyCalc), not projected production; all labels are estimates. A partner's stance is shown as an inference from its tier, with that team's tier confidence.
- **Stance compatibility grade (first ranking key):** owner Buy: Seller and Deep Rebuild = grade 1 (equal), Bubble = 2, Contender = 3. Owner Sell: Contender = 1, Bubble = 2, Seller and Deep Rebuild = 3. Grade-3 teams are listed only with a two-way positional fit, labeled "stances don't line up". Unlisted teams are counted with a reason.
- **Positional fit (second key), Stage 4 needs/surpluses only:** "they have what you need" = their surplus positions matching the owner's needs; "you have what they need" = the owner's (unprotected) surplus positions matching their needs. Both = two-way; one = one-way (both directions equal); neither = not listed. Withheld positions are never used.
- **Tie-breaker (third key):** more completed trades in the last 3 weeks first. This is context only, not evidence of willingness. Remaining ties share a position number ("tied") and are displayed alphabetically by team name, without breaking the tie.
- **Targets and offers:** targets = the partner's Stage 4 surplus players at the owner's need positions; offers = the owner's surplus players at the partner's need positions, excluding protected players. Up to 3 per matching position, highest market value first, values and 0–100 scale as context. Injuries are notes only.
- **Confidence label (never changes rank):** the lower of the owner's stance confidence (Low when it is only a leaning, with a visible caveat) and the partner's tier confidence; down one level if any fit position is low confidence for either team; Low if either team has under 75% of rostered players valued. Coverage is always shown.
- **When no list is shown (explanation instead):** Hold or leaning Hold (no preferred tier assumed); stance unavailable; trade deadline passed; no games remaining (playoffs/offseason); redraft or keeper league; Stage 4 unavailable for the league or the owner's team; no team with any fit. Abandoned and no-record teams are excluded with a note; if the owner is on more than one roster, no list.
- **Picks:** never targets or offers. Shown as "Draft picks (context)" for both teams, valued only by FantasyCalc's plain per-round value for the exact season and round; otherwise "no value". Early/mid/late is never inferred.
- **Trade deadline 99:** read as "no trade deadline", an **observed convention, not documented**, and labeled that way wherever shown.
- **Protected players:** the owner can mark players as protected, per league, in this browser's local storage (device-only, no sync, nothing sent anywhere). Protected players never appear as offers; if every surplus player at a position is protected, that position no longer counts toward "you have what they need" (a partner's fit and order can change).

## 2026-10-26: Stage 5 approved
- The owner reviewed and approved Stage 5 (within-league trade partner matching); deployed the same day.

## 2026-10-27: Trade candidate rules revised (owner approved)
The owner found the suggested players were the wrong type: too many injured players and low-value backups (targets had a median of 12 on the 0–100 scale; 13 of 37 were IR/Out; 26 of 37 were not NFL starters). These rules **replace** the Stage 5 "Targets and offers", "Picks" and injury bullets for the Trade partners lists only. Ranking of partner teams is unchanged (stance grade, then Stage 4 positional fit, then recent trades). Tiers, stance and Stage 4 are unchanged.
- **Value floor:** every suggested player or pick is worth at least 10 on the approved 0–100 scale.
- **Unavailable players** (Sleeper injury status IR, Out, PUP, Sus, DNR) are **listed after** available ones, with the note. "Questionable" counts as available. Values are never adjusted.
- **When the owner is buying:**
  - **Targets:** the partner's players (lineup, bench or IR; not taxi) at the owner's **need positions** who are worth **more than the owner's weakest market-value-lineup player at that position**, are **26 or older**, and are **currently first on their NFL depth chart** (Sleeper `depth_chart_order` = 1). Unavailable players qualify without the depth-chart check but are listed last. Players with no known age don't qualify.
  - **Offers:** the owner's Stage 4 surplus players at the partner's need positions, plus the owner's **young** (24 or under) players not in the market-value lineup (bench, taxi or IR), plus the owner's **draft picks**.
- **When the owner is selling:**
  - **Targets:** the partner's **young** (24 or under) players not in their market-value lineup (bench, taxi or IR), plus the partner's **draft picks**.
  - **Offers:** the owner's Stage 4 surplus players at the partner's need positions, plus the owner's **veterans** (27 or older).
- **Draft picks are now suggestible assets** (previously context only). They are still valued only by FantasyCalc's plain per-round value for the exact season and round; early/mid/late is never guessed, and picks with no exact value aren't suggested.
- **Lists:** up to 3 players per position and up to 3 picks, available players first, then highest market value. Protected players are never offered.

## 2026-10-28: Stage 6 (assisted, read-only lineup manager) scope approved
- **Scope:** the owner searches for a player and sees every league where they roster him and where he sits: starting slot, bench, reserve (IR) or taxi. In leagues the owner has marked Managed where he starts, the app lists bench players eligible under the app's supported slot rules (QB, RB, WR, TE, FLEX, SUPER_FLEX). The owner makes any change in Sleeper and asks the app to check afterward.
- **Never:** writes to Sleeper; automatic, batch or one-click submission; automating the Sleeper website or app; handling credentials; undocumented endpoints; matchup data, an NFL schedule source or extra slot types without approval; projections, start/sit advice, ranking bench players, or FantasyCalc values in this feature; background polling; inferring league type from a league's name.
- **League type** (Managed / Best ball / Unknown) is set by the owner and saved per league on this device only. Best ball and Unknown leagues are informational only.
- **Status model:** workflow state, latest check and finding are tracked and shown separately. A failed check never changes the workflow state.
- Lineup facts come from the rosters endpoint only. "Check again" and the review screen always fetch fresh data.
- **Undocumented fields (owner approved):** the roster `taxi` and `co_owners` lists, the order of roster `starters` (documented only for matchups) and the contents of league `roster_positions` may be used, labeled "observed in live data, not documented". If any is missing or inconsistent, the league gets an Uncertain finding; the app never guesses.
- Detailed rules (eligibility, wording, verification, staleness, links) will be recorded here once the owner approves them.
