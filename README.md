# Sleeper Companion

A personal, read-only companion app for your Sleeper fantasy football leagues. It runs entirely in your browser (no server, no login, no password) and can be installed on your phone's home screen.

**Current stage:** Stage 1: username lookup, league list, and your roster in each league.

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
- `src/storage/`: localStorage and IndexedDB helpers
- `src/features/`: the screens
- `src/components/`: shared UI pieces
- `tests/`: automated tests and fixtures
