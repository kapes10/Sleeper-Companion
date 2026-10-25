<!--
  AGENTS.md mirrors CLAUDE.md so every coding assistant follows the same rules.
  Keep the two files identical below this note. If they ever differ, stop and ask the owner.
  Approved decisions: DECISIONS.md. Approved formulas and valuation rules: TRADE_LOGIC.md.
  Current status, limitations and next step: NOTES.md.
-->

# Sleeper Team Analyzer

Personal fantasy football team analyzer for Sleeper leagues. Mobile-first PWA that also works on desktop. Built for a nontechnical owner: explain decisions in plain English, and keep things simple.

## My leagues (fill in before starting)
- Sleeper username: kapes10 (user ID 819017179583361024)
- League formats I actually play (e.g. "dynasty superflex PPR", "redraft 1QB half-PPR"): dynasty superflex full-PPR with TE premium (+0.5 or +1.0), 10 or 12 teams; both best ball and managed lineups. All 23 of my 2026 leagues (approved 2026-10-25). Priority test league: The Dynasty Collective.
- Build and test against these formats only. Do not add support for other formats unless I ask.

## Stack
- TypeScript, React, Vite, Tailwind, Vitest
- Single app (no monorepo, no separate packages)
- Installable PWA, mobile-first, dark theme
- No backend and no database, except one scheduled job that fetches player valuations and saves them to a small database or JSON file that the app reads. Static hosting otherwise. Preferences live in localStorage, which does NOT sync between devices. Tell me whenever this limitation affects a feature.

## Sleeper API rules
- Documented public endpoints only (https://docs.sleeper.com/). The API is read-only.
- Never write to Sleeper. Never ask for passwords, capture cookies or tokens, or use undocumented or reverse-engineered endpoints.
- The full NFL player list is large. Fetch it at most once per day and cache it.
- Stay well under Sleeper's documented rate limit and handle network errors gracefully.
- Personal, noncommercial use only.

## Valuation source rules (FantasyCalc)
- Use only the documented GET /values/current endpoint (https://fantasycalc.com/api-docs). Do not call any other FantasyCalc endpoint without written permission.
- Cache responses and reuse them. Refresh each unique set of query parameters no more than once every 3 hours.
- Fetch only from the scheduled job, never directly from the browser.
- Show a visible link to fantasycalc.com wherever its values appear. Before shipping, read the full terms on the docs page and follow any attribution requirement.

## Data integrity (strict)
- Never fabricate player values, projections, rankings, or injury news.
- Never silently substitute mock data for real data. Mock data lives only in tests/fixtures.
- If valuation data is missing or stale, show a visible warning.
- Save real Sleeper API responses from my leagues as test fixtures.
- Anything not validated against live data must be labeled as such.

## Analysis logic rules
- Deterministic, explainable functions kept separate from UI components.
- Every recommendation shows what went into it and why.
- Do not invent weights or formulas. Propose them in plain English and wait for my approval before using them.
- Buyer/seller tiers are estimates. Show a confidence level based on games played, and get my approval on thresholds in plain English before using them.
- Probabilities like "chance a team accepts" are estimates and must be labeled as estimates.

## Workflow
- Work in small stages. STOP after each stage, summarize what works and what doesn't, and wait for my approval.
- Run tests and fix failures before declaring a stage done.
- Commit to git after each working stage.
- Don't add features I didn't ask for.
- Record known limitations in NOTES.md.

## Out of scope for now
Chrome extension, automatic lineup or trade submission, user accounts, any backend beyond the valuation fetch job, AI features, IDP leagues, multi-team trades, trade evaluator, trade finder, lineup manager.