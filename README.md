# Sleeper Companion

A personal, read-only companion app for your Sleeper fantasy football leagues. It runs in your browser (no login, no password) and can be installed on your phone's home screen. Player values come from [FantasyCalc](https://fantasycalc.com), refreshed by a scheduled job on GitHub.

**Done so far:** league list and rosters (Stage 1), FantasyCalc player values with a match report and manual CSV import.
**Also done:** Stage 2 (revised): Team Analyzer.
**In progress:** Stage 3: hosting (awaiting review).

## Run it on your computer

You need [Node.js](https://nodejs.org/) (version 20 or newer) installed once.

1. Open a terminal in this folder (in VS Code: **Terminal → New Terminal**).
2. First time only, install the building blocks:
   ```
   npm install
   ```
3. Start the app:
   ```
   npm run dev
   ```
4. Open the address it prints (usually <http://localhost:5173>) in your browser.
5. Press **Ctrl + C** in the terminal to stop it.

### Try it on your phone (same Wi-Fi)

```
npm run dev -- --host
```

Open the "Network" address it prints (e.g. `http://192.168.1.20:5173`) on your phone. Note that **installing** to the home screen and offline start-up need HTTPS, so use the live address below for that.

## The live app

**Address:** <https://kapes10.github.io/Sleeper-Companion/> (HTTPS, hosted free on GitHub Pages from the public repository `kapes10/Sleeper-Companion`).

It's public: anyone with the link can open it. A `noindex` tag asks search engines not to list it. Nothing private is stored on the server.

### How deploys happen
Every push to the `main` branch starts **Actions → "Refresh values and deploy"**, which:
1. runs the tests;
2. builds the app and checks the build (`npm run check:build`);
3. refreshes FantasyCalc values that are due;
4. publishes everything.

It takes about 1–2 minutes. Your phone gets the new version the next time you open or switch back to the app. GitHub caches files for up to 10 minutes, so allow that long after a deploy.

### How to roll back
- **Quick (temporary):**
  1. On GitHub, open **Actions → Refresh values and deploy**.
  2. Click the last run that was working (green tick, before the bad change).
  3. Click **Re-run all jobs**. That redeploys the older code, still with the latest values.
  4. Note: the next push, or the next scheduled values refresh, deploys `main` again. Do the permanent fix as well.
- **Permanent:** in a terminal in this folder:
  ```
  git revert HEAD --no-edit
  git push
  ```
  This adds a new commit that undoes the last one (nothing is deleted), and the push redeploys. To undo several commits, run `git log --oneline` and send the list to your assistant.

### Check that the values job ran
- **In the app:** **Player values & match report** shows each format's snapshot time, and says if the latest refresh failed.
- **On GitHub:** **Actions → Refresh values and deploy**. Scheduled runs show "schedule" as the trigger. Open a run, then the **build** job, then **Refresh FantasyCalc values that are due**, to see "updated", "skipped (less than 3 hours)" or "FAILED".
- **Raw data:** <https://kapes10.github.io/Sleeper-Companion/data/fantasycalc/index.json> (`lastAttemptAt`, `lastAttemptOk`, `lastError` for each format).

### Refresh values by hand
**Actions → Refresh values and deploy → Run workflow → Run workflow** (green button). It only contacts FantasyCalc for formats whose last attempt was **at least 3 hours ago**, so you can't break FantasyCalc's rate limit by clicking it.

**To test a failure:** tick **"Test only: record a failed fetch"** before running. The old values are kept and FantasyCalc is **not** contacted. Right away, the **match report** shows "The latest refresh failed… showing the previous good snapshot". Rosters and the Team Analyzer keep showing the kept values normally until they're more than 6 hours old; then they show the stale-values warning, including the failure reason. The failure message stays until the **next successful refresh**. That only happens once a refresh is due: 3 hours after the last *real* FantasyCalc call, plus however late GitHub's hourly run is. Runs before then skip the format, so the failure stays.

### If the hourly schedule stops running
GitHub sometimes delays or skips scheduled runs. It also pauses schedules after **60 days with no new commits**; to restart, open **Actions → Refresh values and deploy → Enable workflow**. If scheduled runs never appear, the fallback (approved, not set up yet) is a free cron-job.org timer that presses "Run workflow" hourly. Ask your assistant for the setup steps.

## Install it on your phone

**iPhone (Safari):**
1. Open the address above in **Safari** (not Chrome; iPhone only installs from Safari).
2. Tap **Share** (square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open it from the new **Companion** icon. It opens full-screen, with no address bar.

**Android (Chrome):**
1. Open the address in **Chrome**.
2. Tap **⋮**, then **Add to Home screen** (or **Install app**), then **Install**.
3. Open it from the new icon.

### On-device checklist (tick each on your phone)
| # | Check | iPhone | Android |
|---|---|---|---|
| 1 | Site opens over HTTPS (padlock) in the browser | ☐ | ☐ |
| 2 | "Add to Home Screen" / "Install app" is offered | ☐ | ☐ |
| 3 | Icon (green football on dark) and name "Companion" on the home screen | ☐ | ☐ |
| 4 | Opens full-screen, no browser bars; the title isn't hidden under the clock or notch | ☐ | ☐ |
| 5 | Enter username, see all 23 leagues | ☐ | ☐ |
| 6 | A roster shows values; "Values from FantasyCalc.com" is visible | ☐ | ☐ |
| 7 | Team Analyzer: open 3 leagues; each shows your team card and all teams | ☐ | ☐ |
| 8 | Moving around: "← All leagues" / "← Team Analyzer" links work (no browser back button in full-screen); Android's back gesture also works | ☐ | ☐ |
| 9 | Refresh buttons reload data (there's no pull-to-refresh in full-screen) | ☐ | ☐ |
| 10 | Rotate the phone sideways: nothing is cut off by the notch | ☐ | ☐ |
| 11 | Airplane mode, then open the app: it opens, and shows a readable "Couldn't reach Sleeper" message | ☐ | ☐ |
| 12 | After a push (wait ~10 minutes), switch away from and back to the app: the new version loads without clearing anything | ☐ | ☐ |

## Local vs hosted setup
| | Local (`npm run dev` / `npm run preview`) | Hosted (GitHub Pages) |
|---|---|---|
| App address | `http://localhost:5173` / `:4173` | https://kapes10.github.io/Sleeper-Companion/ |
| FantasyCalc values | Only after `node scripts/pull-values.mjs https://kapes10.github.io/Sleeper-Companion/` (downloads the published copy; never calls FantasyCalc). Saved in `public/data/`, which git ignores | Written by the scheduled job into the deployed site |
| Values job | Refuses to run (`scripts/fetch-values.ts` needs `--ci`), so you can't become a second FantasyCalc caller | Runs in GitHub Actions (`--ci`) |
| Settings | `valuations.config.json` (your public Sleeper user ID) and `VALUES_DIR` (where values are written; set by the workflow) | Same files, no extra settings |
| Secrets | None needed | None. Deploys use GitHub's built-in token. If the cron-job.org fallback is ever added, its key lives only in cron-job.org |

## Check that everything works

| Command | What it does |
| --- | --- |
| `npm test` | Runs all automated tests (uses saved, anonymised sample data, no internet needed). |
| `npm run test:live` | Runs the Team Analyzer on all your real leagues and prints each result (needs internet; downloads Sleeper's player list once). |
| `npm run typecheck` | Checks the code for type mistakes. |
| `npm run build` | Builds the installable app into the `dist/` folder. |
| `npm run preview` | Serves the built app locally so you can test the installable version. |
| `npm run check:build` | After a build: checks the app manifest, icons, service worker, the noindex and FantasyCalc tags, and that no keys or personal emails are in the files to be published. |

## Where your data lives

- Your username and Sleeper user ID are saved in this browser's `localStorage`. Other browsers and devices don't see it, so you will enter your username once per device.
- Sleeper's full player list (~15 MB) is saved in this browser's IndexedDB and refreshed at most once every 24 hours, as Sleeper requests.
- League and roster data is kept in memory for 5 minutes; the **Refresh** button always re-downloads it.
- **FantasyCalc values** live on the hosted site (`/data/fantasycalc/`), so every device sees the same ones. The latest and previous snapshot are kept for each format, untouched, including draft-pick values (not used yet).
- **Manual CSV imports** are saved in this browser's IndexedDB only. They don't sync to your other devices.

## Updating the test fixtures

Tests use anonymised copies of real Sleeper responses in `tests/fixtures/`. To recapture them:

```
node scripts/capture-fixtures.mjs <username> <leagueId> [<leagueId> ...]
```

The script replaces every user ID, league ID, league name, team name and manager name with placeholders before writing anything.

## Project layout

- `src/api/`: talks to Sleeper's public API (retries, timeouts, readable errors)
- `src/domain/`: pure logic: league summaries, finding your roster, starters/bench
- `src/data/`: the 24-hour player cache
- `src/analysis/`: Team Analyzer logic (standings, season state, age/pick/trade signals, tiers, stance); no screen code
- `src/valuations/`: FantasyCalc parameter mapping, the scheduled job's core, Sleeper-ID matching, 0–100 scale, stale checks, CSV import
- `scripts/fetch-values.ts`: the scheduled FantasyCalc job (run by GitHub Actions)
- `.github/workflows/deploy.yml`: the hourly schedule, tests, build and deploy
- `src/storage/`: localStorage and IndexedDB helpers
- `src/features/`: the screens
- `src/components/`: shared UI pieces
- `tests/`: automated tests and fixtures
