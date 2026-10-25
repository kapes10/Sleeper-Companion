// Scheduled FantasyCalc job. Run by GitHub Actions (see .github/workflows/deploy.yml):
//
//   node scripts/fetch-values.ts --ci [--simulate-failure]
//
// --simulate-failure records a failed attempt without contacting FantasyCalc (to test that the
// previous snapshot is kept and the app shows the failure / stale warnings).
//
// 1. Reads the owner's current Sleeper leagues and works out which FantasyCalc parameter sets they need.
// 2. For each set whose last attempt is ≥ 3 hours old, calls GET /values/current once.
// 3. Saves the raw response untouched, rotates latest → previous, and updates index.json.
//    A failed call keeps the existing snapshots and records the error.
//
// The published index.json must be downloaded first (scripts/pull-values.mjs) so the 3-hour
// rule is enforced across runs. Running this locally would be a second, independent caller,
// so it refuses unless run in CI or with --allow-local.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SleeperLeague, SleeperNflState } from '../src/api/types';
import { mapLeagueToFcParams, type FcParams } from '../src/valuations/fantasycalc/params.ts';
import { emptyIndex, runRefresh, type ValuesIndex } from '../src/valuations/fantasycalc/refresh.ts';

const DATA_DIR = process.env.VALUES_DIR ?? 'public/data/fantasycalc';
const SLEEPER = 'https://api.sleeper.app/v1';
const USER_AGENT = 'sleeper-companion (personal, noncommercial; values job)';

const args = process.argv.slice(2);
if (!args.includes('--ci') && !args.includes('--allow-local')) {
  console.error('Refusing to run: this job calls FantasyCalc. Use --ci (GitHub Actions) or --allow-local.');
  process.exit(2);
}

const config = JSON.parse(readFileSync('valuations.config.json', 'utf8')) as { sleeperUserId: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// 1. Which parameter sets do the owner's leagues need? (Sleeper failure aborts the run; data untouched.)
const state = await getJson<SleeperNflState>(`${SLEEPER}/state/nfl`);
const season = state.league_season || state.season;
const leagues = (await getJson<SleeperLeague[] | null>(`${SLEEPER}/user/${config.sleeperUserId}/leagues/nfl/${season}`)) ?? [];
const needed: FcParams[] = [];
let unsupported = 0;
for (const league of leagues) {
  const m = mapLeagueToFcParams(league);
  if (m.ok) needed.push(m.params);
  else unsupported++;
}
console.log(`${leagues.length} leagues for ${season}; ${unsupported} can't be mapped to FantasyCalc parameters.`);

// 2–3. Refresh what's due.
const indexPath = join(DATA_DIR, 'index.json');
const previous: ValuesIndex = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : emptyIndex();

const simulateFailure = args.includes('--simulate-failure');
if (simulateFailure) console.log('SIMULATED FAILURE run: FantasyCalc will not be contacted.');
const result = await runRefresh(previous, needed, {
  simulateFailure,
  now: Date.now,
  get: async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    return { status: res.status, text: await res.text() };
  },
  sha256: async (text) => createHash('sha256').update(text).digest('hex'),
});

for (const w of result.writes) {
  const path = join(DATA_DIR, w.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, w.content);
}
mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(indexPath, JSON.stringify(result.index, null, 2) + '\n');

for (const line of result.log) console.log(line);
console.log(`FantasyCalc calls this run: ${result.calls.length}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
