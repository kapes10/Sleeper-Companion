// LIVE: the lineup manager's scan for one player across every league of the configured owner,
// using real Sleeper data. Read-only GET requests; nothing is written anywhere. Not part of `npm test`.
// League types here come from Sleeper's undocumented best_ball setting FOR THIS CHECK ONLY; the
// app itself never sets a type from it (the owner chooses).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createClient } from '../../src/api/client';
import { createSleeperApi } from '../../src/api/sleeper';
import { scanLeague, placementText, lineupSlotList, rosterIssues } from '../../src/analysis/lineup/placement';
import { findOwnerRoster } from '../../src/domain/roster';
import { toPlayerIndex } from '../../src/domain/players';

const { sleeperUserId: ME } = JSON.parse(readFileSync('valuations.config.json', 'utf8')) as { sleeperUserId: string };
const PLAYER = process.env.LINEUP_PLAYER ?? 'Kirk Cousins';
let requests = 0;
const api = createSleeperApi(
  createClient({
    maxConcurrent: 2,
    fetchImpl: (...a) => {
      requests++;
      return fetch(...a);
    },
  }),
);

it('scans every league for one player (live)', async () => {
  const state = await api.getNflState({ fresh: true });
  const leagues = await api.getUserLeagues(ME, state.league_season, { fresh: true });
  const players = toPlayerIndex(await api.getAllPlayers());
  const scanRequests = requests - 1; // the player list is cached daily in the app
  const id = Object.values(players).find((p) => p.name === PLAYER && ['QB', 'RB', 'WR', 'TE'].includes(p.position ?? ''))!.id;
  const lines: string[] = [];
  const tally: Record<string, number> = {};
  for (const league of leagues) {
    const rosters = await api.getRosters(league.league_id, { fresh: true });
    const own = findOwnerRoster(rosters, ME);
    if (own.kind === 'found') expect(rosterIssues(own.roster, lineupSlotList(league), players)).toEqual([]);
    const row = scanLeague({ league, rosters, ownerId: ME, players, playerId: id, leagueType: league.settings.best_ball === 1 ? 'bestball' : 'managed', state });
    if (!row) continue;
    const k = row.finding.kind + ('code' in row.finding ? `:${row.finding.code}` : '');
    tally[k] = (tally[k] ?? 0) + 1;
    const cands = row.finding.kind === 'available' ? ` | ${row.finding.candidates.map((c) => `${c.name} (${c.position}, ${c.team ?? 'FA'}${c.injuryStatus ? ', ' + c.injuryStatus : ''})`).join(', ')}` : '';
    lines.push(`${league.name.trim()} | ${placementText(row.placement)} | ${k} | ${row.finding.reason}${cands}`);
  }
  const total = requests - 1;
  console.log(`\n${PLAYER}, week ${state.week} ${state.season_type}\n${lines.join('\n')}\nTALLY ${JSON.stringify(tally)}\nREQUESTS (excluding the daily player list): ${total} (state + league list + ${leagues.length} rosters)`);
  expect(total).toBe(2 + leagues.length);
  expect(scanRequests).toBe(2);
});
