# Sleeper Companion

A personal, read-only companion app for your Sleeper fantasy football leagues. It runs in your browser (no login, no password) and can be installed on your phone's home screen. Player values come from [FantasyCalc](https://fantasycalc.com), refreshed by a scheduled job on GitHub.

**Current stage:** Stage 2: FantasyCalc player values on your rosters, match report, and manual CSV import.

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

Open the "Network" address it prints (e.g. `http://192.168.1.20:5173`) on your phone. Note that **installing** to the home screen and offline start-up need HTTPS, so that part only works after deployment (Stage 5) or on `localhost`.

## Put it online (GitHub Pages + scheduled values job)

This is what makes values update on their own and look the same on your phone and desktop. One-time setup, about 10 minutes. Everything here is free for a public repository.

1. **Create a GitHub account** at <https://github.com/signup> if you don't have one.
2. **Create an empty public repository**: <https://github.com/new>, name it `sleeper-companion`, choose **Public**, and do **not** add a README or license.
3. **Turn on Pages first**: in the new repository, open **Settings → Pages**, and under **Build and deployment → Source** choose **GitHub Actions**.
4. **Upload the code** from a terminal in this folder (replace `YOUR-NAME`):
   ```
   git remote add origin https://github.com/YOUR-NAME/sleeper-companion.git
   git push -u origin main
   ```
   Git will open a browser window to sign in the first time.
5. **Watch the first run**: open the **Actions** tab. "Refresh values and deploy" runs for 2–3 minutes. When it's green, your app is at `https://YOUR-NAME.github.io/sleeper-companion/`. Open that on your phone and desktop.

After that, the job runs **every hour on its own**. It only calls FantasyCalc for a format when the last call for that format is at least **3 hours** old, so values refresh about every 3–4 hours.

**Things to know**
- **Public repository:** anyone can see the code, your Sleeper username, and the stored FantasyCalc values (you approved this).
- **GitHub pauses schedules** in public repositories after **60 days with no new commits**. GitHub emails you first. To restart, open **Actions → Refresh values and deploy → Enable workflow**.
- **Manual run:** **Actions → Refresh values and deploy → Run workflow** redeploys right away. It still won't call FantasyCalc early.

### Seeing values when running locally

`npm run dev` shows "no values" until you download the published ones (this never calls FantasyCalc):
```
node scripts/pull-values.mjs https://YOUR-NAME.github.io/sleeper-companion/
```
Don't run `scripts/fetch-values.ts` yourself; it's for the scheduled job. A second caller could break FantasyCalc's 3-hour rule.

## Check that everything works

| Command | What it does |
| --- | --- |
| `npm test` | Runs all automated tests (uses saved, anonymised sample data, no internet needed). |
| `npm run typecheck` | Checks the code for type mistakes. |
| `npm run build` | Builds the installable app into the `dist/` folder. |
| `npm run preview` | Serves the built app locally so you can test the installable version. |

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
- `src/valuations/`: FantasyCalc parameter mapping, the scheduled job's core, Sleeper-ID matching, 0–100 scale, stale checks, CSV import
- `scripts/fetch-values.ts`: the scheduled FantasyCalc job (run by GitHub Actions)
- `.github/workflows/deploy.yml`: the hourly schedule, tests, build and deploy
- `src/storage/`: localStorage and IndexedDB helpers
- `src/features/`: the screens
- `src/components/`: shared UI pieces
- `tests/`: automated tests and fixtures
