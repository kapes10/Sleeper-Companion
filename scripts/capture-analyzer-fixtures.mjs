// Captures live Sleeper data for the Team Analyzer tests and writes REDACTED fixtures.
//
//   node scripts/capture-analyzer-fixtures.mjs <username> <leagueId> [<leagueId> ...]
//
// Writes tests/fixtures/analyzer/league-<A|B|C…>/{league,rosters,users,traded_picks,transactions}.json,
// plus players.json (only rostered players: id, name, position, team, age) and nfl_state.json.
// Every user ID, league ID, league name, team name and manager name is replaced. Roster IDs,
// player IDs and records are kept. Raw responses are never written to disk.
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://api.sleeper.app/v1';
const OUT = 'tests/fixtures/analyzer';
const OWNER_ID = '100000000000000001';
const RECENT_WEEKS = 3;
const [username, ...leagueIds] = process.argv.slice(2);
if (!username || !leagueIds.length) {
  console.error('usage: node scripts/capture-analyzer-fixtures.mjs <username> <leagueId> [<leagueId> ...]');
  process.exit(1);
}

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 1) + '\n');
const pad = (n) => String(n).padStart(2, '0');

const user = await get(`/user/${encodeURIComponent(username)}`);
const state = await get('/state/nfl');
const allPlayers = await get('/players/nfl');
const userIds = new Map([[user.user_id, OWNER_ID]]);
const fakeUser = (id) => {
  if (id == null) return id;
  if (!userIds.has(id)) userIds.set(id, `2000000000000${String(userIds.size).padStart(5, '0')}`);
  return userIds.get(id);
};

mkdirSync(OUT, { recursive: true });
write(`${OUT}/nfl_state.json`, state);
const playerIds = new Set();

for (const [i, realId] of leagueIds.entries()) {
  const letter = String.fromCharCode(65 + i);
  const fakeLeague = `30000000000000010${i}`;
  const dir = `${OUT}/league-${letter}`;
  mkdirSync(dir, { recursive: true });
  const weeks = Array.from({ length: RECENT_WEEKS }, (_, k) => state.week - k).filter((w) => w >= 1);
  const [league, rosters, users, picks, ...tx] = await Promise.all([
    get(`/league/${realId}`),
    get(`/league/${realId}/rosters`),
    get(`/league/${realId}/users`),
    get(`/league/${realId}/traded_picks`),
    ...weeks.map((w) => get(`/league/${realId}/transactions/${w}`)),
  ]);
  const s = league.settings ?? {};
  write(`${dir}/league.json`, {
    league_id: fakeLeague,
    name: `Analyzer Fixture ${letter}`,
    season: league.season,
    status: league.status,
    sport: league.sport,
    total_rosters: league.total_rosters,
    roster_positions: league.roster_positions,
    scoring_settings: league.scoring_settings,
    settings: Object.fromEntries(
      ['type', 'best_ball', 'reserve_slots', 'taxi_slots', 'num_teams', 'playoff_teams', 'playoff_week_start', 'start_week', 'league_average_match', 'trade_deadline', 'draft_rounds', 'playoff_seed_type', 'divisions'].map((k) => [k, s[k]]),
    ),
  });
  write(
    `${dir}/rosters.json`,
    rosters.map((r) => {
      for (const p of r.players ?? []) playerIds.add(p);
      const rs = r.settings ?? {};
      return {
        roster_id: r.roster_id,
        league_id: fakeLeague,
        owner_id: fakeUser(r.owner_id),
        co_owners: r.co_owners ? r.co_owners.map(fakeUser) : null,
        starters: r.starters,
        players: r.players,
        reserve: r.reserve,
        taxi: r.taxi,
        settings: Object.fromEntries(['wins', 'losses', 'ties', 'fpts', 'fpts_decimal', 'fpts_against', 'fpts_against_decimal'].map((k) => [k, rs[k]])),
      };
    }),
  );
  write(
    `${dir}/users.json`,
    users.map((u, j) => ({
      user_id: fakeUser(u.user_id),
      display_name: u.user_id === user.user_id ? 'Fixture Owner' : `Manager ${pad(j + 1)}`,
      metadata: u.metadata?.team_name ? { team_name: `Team ${pad(j + 1)}` } : {},
    })),
  );
  write(`${dir}/traded_picks.json`, picks.map((p) => ({ season: p.season, round: p.round, roster_id: p.roster_id, previous_owner_id: p.previous_owner_id, owner_id: p.owner_id })));
  let n = 0;
  write(
    `${dir}/transactions.json`,
    tx.flat().map((t) => ({ transaction_id: `tx-${letter}-${++n}`, type: t.type, status: t.status, roster_ids: t.roster_ids, leg: t.leg, created: t.created })),
  );
  console.log(`league-${letter}: ${rosters.length} rosters, ${picks.length} traded picks, ${tx.flat().length} recent transactions`);
}

const players = {};
for (const id of [...playerIds].sort()) {
  const p = allPlayers[id];
  if (p) players[id] = { player_id: id, full_name: p.full_name, first_name: p.first_name, last_name: p.last_name, position: p.position, team: p.team, age: p.age };
}
write(`${OUT}/players.json`, players);
console.log(`players: ${Object.keys(players).length}; week ${state.week}`);
