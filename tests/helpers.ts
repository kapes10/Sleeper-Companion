// Test-only helpers. Fixtures are REDACTED captures of live Sleeper responses
// (see scripts/capture-fixtures.mjs); they are never used by the production app.
import user from './fixtures/user.json';
import nflState from './fixtures/nfl_state.json';
import userLeagues from './fixtures/user_leagues.json';
import league01 from './fixtures/league_01.json';
import league01Rosters from './fixtures/league_01_rosters.json';
import league01Users from './fixtures/league_01_users.json';
import league02 from './fixtures/league_02.json';
import league02Rosters from './fixtures/league_02_rosters.json';
import league02Users from './fixtures/league_02_users.json';
import playersSubset from './fixtures/players_subset.json';
import type { SleeperLeague, SleeperLeagueUser, SleeperPlayerMap, SleeperRoster } from '../src/api/types';

export const OWNER_ID = '100000000000000001';
export const LEAGUE_01_ID = '300000000000000001'; // best ball, two empty starter slots
export const LEAGUE_02_ID = '300000000000000002'; // standard lineup, IR + taxi

export const fx = {
  user,
  nflState,
  userLeagues: userLeagues as unknown as SleeperLeague[],
  league01: league01 as unknown as SleeperLeague,
  league01Rosters: league01Rosters as unknown as SleeperRoster[],
  league01Users: league01Users as SleeperLeagueUser[],
  league02: league02 as unknown as SleeperLeague,
  league02Rosters: league02Rosters as unknown as SleeperRoster[],
  league02Users: league02Users as SleeperLeagueUser[],
  players: playersSubset as unknown as SleeperPlayerMap,
};

/** Deep copy so a test can modify a fixture without affecting others. */
export const clone = <T>(v: T): T => structuredClone(v);

const routes: Record<string, unknown> = {
  '/user/fixture_owner': fx.user,
  '/state/nfl': fx.nflState,
  [`/user/${OWNER_ID}/leagues/nfl/${fx.nflState.league_season}`]: fx.userLeagues,
  [`/league/${LEAGUE_01_ID}`]: fx.league01,
  [`/league/${LEAGUE_01_ID}/rosters`]: fx.league01Rosters,
  [`/league/${LEAGUE_01_ID}/users`]: fx.league01Users,
  [`/league/${LEAGUE_02_ID}`]: fx.league02,
  [`/league/${LEAGUE_02_ID}/rosters`]: fx.league02Rosters,
  [`/league/${LEAGUE_02_ID}/users`]: fx.league02Users,
  '/players/nfl': fx.players,
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fetch stand-in that serves fixtures by URL path and records every call. Unknown users → null, like Sleeper. */
export function fixtureFetch() {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname.replace(/^\/v1/, '');
    calls.push(path);
    if (path in routes) return json(routes[path]);
    if (path.startsWith('/user/')) return json(null);
    return json(null, 404);
  }) as typeof fetch;
  return { impl, calls };
}

// ---------- Published FantasyCalc values (built with the real job code from the trimmed real fixture) ----------
import { readFileSync } from 'node:fs';
import { emptyIndex, runRefresh, type ValuesIndex } from '../src/valuations/fantasycalc/refresh';
import type { FcParams } from '../src/valuations/fantasycalc/params';

export const FC_12: FcParams = { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1, tep: 'te+' };
export const FC_TRIMMED_TEXT = readFileSync('tests/fixtures/fantasycalc/dynasty-2qb-12tm-ppr1-teplus.trimmed.json', 'utf8');

export async function publishedValues(
  opts: { fetchedAt?: string; params?: FcParams[]; extraRows?: unknown[]; failLaterAt?: string; failError?: string } = {},
) {
  const fetchedAt = opts.fetchedAt ?? '2026-10-25T02:00:00.000Z';
  const text = opts.extraRows ? JSON.stringify([...JSON.parse(FC_TRIMMED_TEXT), ...opts.extraRows]) : FC_TRIMMED_TEXT;
  const r = await runRefresh(emptyIndex(), opts.params ?? [FC_12], {
    now: () => Date.parse(fetchedAt),
    get: async () => ({ status: 200, text }),
    sha256: async () => 'test',
    parseOptions: { minPlayers: 10 },
  });
  let index: ValuesIndex = r.index;
  if (opts.failLaterAt) {
    const failed = await runRefresh(index, opts.params ?? [FC_12], {
      now: () => Date.parse(opts.failLaterAt!),
      get: async () => ({ status: 503, text: '' }),
      sha256: async () => 'test',
    });
    index = failed.index;
  }
  const files: Record<string, string> = { 'index.json': JSON.stringify(index) };
  for (const w of r.writes) files[w.path] = w.content;
  return files;
}

/** Serves published value files at <origin>/data/fantasycalc/<path>; unknown paths 404. */
export function valuesFetch(files: Record<string, string> | 'offline') {
  return (async (input: RequestInfo | URL) => {
    if (files === 'offline') throw new TypeError('Failed to fetch');
    const path = new URL(String(input)).pathname.split('/data/fantasycalc/')[1] ?? '';
    return path in files ? new Response(files[path], { status: 200 }) : new Response('not found', { status: 404 });
  }) as typeof fetch;
}
