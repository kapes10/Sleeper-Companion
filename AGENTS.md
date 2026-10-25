# Sleeper Trade Tool — Project Instructions

> This file is the standing instruction set for Codex. Read it at the start of each work session. If requirements conflict, stop and ask the owner to resolve the conflict. Do not silently change approved product scope, analytical assumptions, or architecture.

## 1. Product and owner

Build a **personal, noncommercial fantasy football tool for Sleeper**. The owner is nontechnical: explain important decisions, tradeoffs, and testing results in plain English. Prefer the simplest maintainable solution over unnecessary abstractions.

**Approved initial delivery:** a mobile-first, installable **Progressive Web App (PWA)** that also works on desktop. This is an intentional MVP simplification, **not a native iPhone/Android application**. Do not start React Native/Expo, app-store packaging, or a Chrome extension without explicit approval. Keep trade calculations and API access decoupled from the UI so a native app could reuse the underlying logic later.

### Owner-specific configuration — complete before implementation

- Sleeper username: `kapes10`
- Sleeper user ID (resolve from public API; persist after lookup): `819017179583361024` (resolved 2026-10-23)
- Supported leagues / league IDs and formats: `<LIST>`
- League types in scope (e.g., dynasty superflex PPR, redraft 1QB half-PPR): `<LIST>`
- Prioritized MVP league for live testing: `<LEAGUE>`

Do not invent these values. If required fields are missing, you may build using sanitized fixtures, but **do not claim live integration is validated**. Support **only the owner-approved leagues and their actual settings** in the MVP; explicitly flag unsupported formats instead of making guesses. League format labels are descriptive only: always read each league's actual scoring settings, roster positions, and relevant rules from Sleeper.

## 2. MVP outcomes and boundaries

Build the following features in this order, subject to the owner's approval at each stage.

### A. League connection and dashboard

- Look up the Sleeper account by username; save the stable user ID locally.
- Retrieve the owner's selected NFL leagues for the selected season.
- Map the owner to the correct roster in each league. Handle missing or ambiguous ownership explicitly; never silently attribute another person's roster to the owner.
- Show league name, season, format, scoring configuration, owner roster, team rosters, and relevant current-week information, with last-refresh times.
- Allow manual refresh and display clear states for loading, stale data, API errors, and unsupported settings.

### B. Trade Finder — primary value proposition

- Let the owner select a league and save a **per-league** competitive strategy: **Win Now, Rebuild / Sell Veterans, Balanced**, or a custom set of constraints.
- Allow the owner to specify desired positions, players/assets to shop, untouchable players, draft-pick preferences, and short-term versus long-term priorities.
- Analyze the owner's needs and opposing rosters; identify potential targets and plausible trade partners, taking both sides' needs into account.
- For every suggestion, explain the underlying roster fit, supporting data, valuation source, assumptions, and limitations.
- Do **not** imply that another manager is willing to trade or invent a numerical acceptance probability. If a likelihood estimate is later approved, label it as a heuristic, not a measured probability.

### C. Two-team Trade Evaluator

- Let the owner select players and, for supported leagues, traded future picks on each side.
- Show asset values, current-season impact, longer-term impact, positional fit, and the key reasons for the assessment.
- Evaluate dynasty and redraft assets differently, using the league's real roster and scoring settings.
- Show **unavailable / cannot evaluate** instead of producing a numeric verdict when required valuation data is absent, outdated, or incompatible.
- Two-team trades only; do not submit trades to Sleeper.

### D. Cross-league lineup review — read-only assistance

- Search for a player across **all owner-selected leagues** and show whether the owner has that player, whether the player is starting, and where the lineup is relevant for the current week.
- For leagues with supported roster rules and sufficient data, suggest bench replacements eligible for the relevant lineup slot; account for FLEX/SUPERFLEX and other approved slots.
- Distinguish a **proposed** change from a **verified** Sleeper lineup update. Provide a link/navigation path to the applicable Sleeper league/lineup screen for the owner to make the change manually.
- Refresh public data to verify when possible. If verification is unavailable, label the action **unverified** rather than complete.
- Detect known locked/closed periods where possible. If lineup legality or locking cannot be established from public data, display **manual verification required**; do not assert a substitution is valid.
- **Automatic cross-league benching and lineup submission are not supported by the public API and are out of scope.**

## 3. Approved technology and architecture

- **Stack:** TypeScript, React, Vite, Tailwind CSS, Vitest.
- **App:** one repository and one app; no monorepo or separate packages for the MVP.
- **Interface:** mobile-first, touch-friendly, accessible dark theme; responsive on desktop; installable PWA where the browser/platform supports installation.
- **Hosting:** static hosting only. No backend, database, cloud sync, user accounts, paid services, or third-party AI calls without owner approval.
- **Persistence:** use `localStorage` only for small preferences and per-league strategy settings; use **IndexedDB** for larger cached API/player datasets when needed. Neither is a cross-device sync solution. Explain when lack of synchronization affects a feature.
- Keep API clients, domain models, calculations, and UI separate within the single app (e.g., `src/api`, `src/domain`, `src/features`, `src/components`). Prefer small pure functions for analytical logic.
- Never put secrets in frontend source or environment variables exposed to the browser. Do not add a server solely to conceal a nonexistent key.
- Avoid feature creep, unnecessary dependencies, and complex infrastructure.

## 4. Sleeper API and data access

- Verify current documentation before implementing integration: <https://docs.sleeper.com/>.
- Use **documented public read-only endpoints only**. Never submit account changes or use passwords, cookies, authentication tokens, private endpoints, reverse-engineered write APIs, or browser automation to bypass platform restrictions.
- Personal, noncommercial use only. Reassess terms and licensing before public/commercial distribution.
- Apply reasonable request throttling and retries with backoff; honor current documented limits. Do not hardcode an unverified rate-limit number.
- Cache the **full NFL player dataset** for up to one day (or a shorter period if required); prefer smaller documented endpoints when useful. Do not refresh the full dataset on every page visit.
- Cache roster/league data separately, with shorter appropriate lifetimes and a manual refresh. Show source timestamps and indicate when cached data may be stale.
- Resolve the current season/week from a documented source, and do not confuse NFL regular-season weeks with fantasy playoff schedules.
- Use stable Sleeper IDs to join user, league, roster, player, and draft-pick records. Handle traded picks, missing player IDs, co-ownership, empty rosters, and incomplete API responses safely.
- The app must remain honest if API access from the browser is blocked by CORS or other restrictions: investigate compliant options and request owner approval before changing architecture. Do not quietly add proxy servers or undocumented endpoints.

## 5. Valuation, projections, and analytical integrity

- Sleeper league data **is not itself a complete trade-value or player-projection source**. Do not manufacture market values, rest-of-season projections, injury updates, rankings, draft-pick values, or current news.
- For MVP, support owner-provided **CSV/JSON imports** of valuations. Require clear fields or mapping for: player/asset identity, value, source, as-of date, format (dynasty/redraft), and any applicable scoring assumptions. Validate duplicates, missing IDs, incompatible formats, and malformed files.
- Distinguish and label:
  - **Market/trade value:** an estimate drawn from an identified valuation source.
  - **Projected production:** a forecast from a separately identified source, if supplied.
  - **Team-specific fit:** an explainable calculation or qualitative assessment using approved strategy rules.
- Never present market value as projected production or portray an internally calculated fit score as an externally observed market value.
- If imported data is stale, missing, incompatible, or insufficient, show explicit warnings and withhold affected quantitative recommendations. Provide useful qualitative roster analysis only if it can be supported by actual data.
- Keep the valuation provider interface replaceable for future authorized sources, but do not build paid/provider integrations without approval.
- **No invented trade weights or formulas.** Propose any subjective fantasy-specific scoring model—including age curves, positional scarcity, competitive-window weights, draft-pick discounting, thresholds, and trade fairness bands—in plain English with examples, and obtain owner approval before using it. Document approval in `DECISIONS.md`.
- Ordinary engineering algorithms (sorting, ID matching, caching, eligibility checks, validation) do not require per-formula approval.
- Ranking results must explain *why* they appear, what data was used, and when that data was last updated.

## 6. Truthfulness, testing, and fixtures

- Never fabricate real outputs or silently substitute fixtures/mock data into the production interface. Test data belongs in clearly marked test/fixture contexts only.
- Automated tests should use **small, sanitized, deterministic fixtures** based on documented schemas or suitably redacted live responses. Do not commit unredacted user/member identifiers, private league information, or full large player datasets.
- Keep live integration tests separate from unit tests. Label any feature not yet verified against the owner's actual leagues **not live-validated**.
- Test at least:
  - valid/invalid Sleeper username and stable ID lookup;
  - league selection, season selection, and owner-to-roster mapping;
  - each owner-approved league format and its real scoring/lineup rules;
  - player data reconciliation and missing/retired IDs;
  - valuation import, age of data, and unsupported scoring assumptions;
  - distinct Win Now versus Rebuild ranking behavior with approved rules;
  - two-team trade calculation and missing asset values;
  - multi-league player search, eligible bench alternatives, and unverified lineup updates;
  - network failures, stale caches, and mobile layouts.
- Do not claim that compilation alone proves functionality. Report test commands, results, and what still requires manual device/live verification.
- A stage is complete only when its specific acceptance criteria pass or remaining exceptions are documented and approved.

## 7. Development workflow and owner approvals

1. At the beginning of a new stage, review this file, `PRODUCT.md` (if present), `TRADE_LOGIC.md` (if present), `DECISIONS.md`, and `NOTES.md`.
2. Present a brief implementation plan with measurable acceptance criteria and identify any decisions that materially affect business logic, data quality, costs, privacy, or architecture.
3. Implement **one small working stage**. Run relevant tests, correct failures, and verify user-visible behavior as far as tooling permits.
4. **STOP after each stage.** State what works, what does not, what was tested, and what approval or information is needed next. Wait for the owner's permission before starting the next stage.
5. Commit each working stage to Git with a descriptive message, provided the repository exists and the owner has approved the stage. Do not include secrets, unredacted live fixtures, large caches, or local configuration. Never rewrite unrelated history.
6. Record active limitations and next steps in `NOTES.md`. Record durable approved choices and rationale in `DECISIONS.md`. Do not silently change decisions already recorded.
7. Never add features outside the approved MVP without asking. You may suggest improvements, but do not implement them automatically.

Explain consequential decisions simply. Ask for approval when changing the stack, adding a paid service/backend, collecting more user data, changing how trade advice is calculated, or broadening supported leagues. Do not interrupt for routine implementation details.

## 8. Initial development stages and acceptance criteria

**Stage 0 — Confirm scope and architecture**
- Confirm owner configuration, chosen PWA delivery, API constraints, valuation import shape, and staged plan.
- **Pass:** owner approves the plan and outstanding assumptions are recorded.

**Stage 1 — Sleeper connection + dashboard**
- Implement username lookup, selected season, league selection, stable roster mapping, basic league dashboard, caching, and error states.
- **Pass:** shows the owner's approved test league using real API data, or explicitly records why live verification is blocked; tests pass.

**Stage 2 — Valuation import + Trade Finder**
- Implement validated imports and one approved, explainable target-selection model for a supported league and position (begin with running backs if compatible with the owner's leagues).
- **Pass:** shows traceable recommendations; changes appropriately between Win Now and Rebuild under test fixtures; does not invent missing values.

**Stage 3 — Trade Evaluator**
- Implement two-team player and supported-pick selection with transparent, approved comparisons.
- **Pass:** calculations are reproducible, assumptions are visible, and absent/incompatible valuations block unsupported numerical conclusions.

**Stage 4 — Cross-league lineup review**
- Implement player search, starting/bench identification, supported replacement eligibility, manual Sleeper navigation, and verified/pending/unverified states.
- **Pass:** accurately identifies a chosen player's status across approved leagues; never claims to have submitted a lineup change.

**Stage 5 — PWA quality and deployment**
- Verify mobile accessibility, installation behavior on supported devices, caching behavior, static deployment, and recovery from network failure.
- **Pass:** owner can open and use the deployed app on a cellphone and desktop; known platform limitations are documented.

## 9. Project files and documentation

Keep this `AGENTS.md` concise enough to serve as standing guidance. Maintain supporting files as the project develops:

- `PRODUCT.md` — detailed user stories, approved league formats, screen requirements, acceptance criteria, and deferred features.
- `TRADE_LOGIC.md` — approved valuation sources, formulas, strategy definitions, sample calculations, and limitations.
- `DECISIONS.md` — dated, owner-approved architectural and business-logic decisions.
- `NOTES.md` — current progress, bugs, unresolved questions, and exact next step.
- `README.md` — setup, commands, installation, testing, and deployment instructions for a nontechnical owner.

Create these supporting files when first needed; do not invent approvals or decisions merely to populate them.

## 10. Explicitly out of scope

- Chrome extension or native iOS/Android app in the MVP.
- Automatic lineup changes, waiver claims, or trade submission.
- Undocumented Sleeper APIs or unauthorized write automation.
- User accounts, backend/database, cross-device syncing, and paid subscriptions.
- LLM/AI-generated recommendations or paid data feeds.
- IDP and any unapproved league format; multi-team trades.
- Public/commercial distribution without renewed API/licensing and privacy review.

## 11. First instruction to Codex

**Do not start coding immediately.** Review this file; inspect the repository and official Sleeper documentation; identify missing owner configuration and any API/browser limitations; propose Stage 0's brief plan and acceptance criteria. Once approved, execute only the first authorized stage, test it, summarize outcomes, and stop for the next approval.
