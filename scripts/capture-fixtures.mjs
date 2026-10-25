// Captures live Sleeper responses for the owner's account and writes REDACTED test fixtures.
//
//   node scripts/capture-fixtures.mjs <username> <leagueId> [<leagueId> ...]
//
// Redaction: only whitelisted fields are kept; every user ID, league ID, league name, team name
// and manager name is replaced with a placeholder. Player IDs and NFL player data are public and
// kept, but the player file only contains players that appear on the captured rosters.
// Raw responses are never written to disk.
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://api.sleeper.app/v1';
const OUT = 'tests/fixtures';
const [username, ...leagueIds] = process.argv.slice(2);
if (!username || leagueIds.length === 0) {
  console.error('usage: node scripts/capture-fixtures.mjs <username> <leagueId> [<leagueId> ...]');
  process.exit(1);
}

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const pad = (n) => String(n).padStart(2, '0');
const userIds = new Map();
const leagueIdMap = new Map();
const fakeUserId = (id) => {
  if (id == null) return id;
  if (!userIds.has(id)) userIds.set(id, `2000000000000000${pad(userIds.size + 1)}`);
  return userIds.get(id);
};
const fakeLeagueId = (id) => {
  if (!leagueIdMap.has(id)) leagueIdMap.set(id, `3000000000000000${pad(leagueIdMap.size + 1)}`);
  return leagueIdMap.get(id);
};

const user = await get(`/user/${encodeURIComponent(username)}`);
userIds.set(user.user_id, '100000000000000001');
const state = await get('/state/nfl');
const season = state.league_season || state.season;
const leagues = await get(`/user/${user.user_id}/leagues/nfl/${season}`);

const redactLeague = (l, i) => ({
  league_id: fakeLeagueId(l.league_id),
  name: `Fixture League ${pad(i + 1)}`,
  season: l.season,
  season_type: l.season_type,
  status: l.status,
  sport: l.sport,
  total_rosters: l.total_rosters,
  roster_positions: l.roster_positions,
  scoring_settings: l.scoring_settings,
  settings: {
    type: l.settings?.type,
    best_ball: l.settings?.best_ball,
    reserve_slots: l.settings?.reserve_slots,
    taxi_slots: l.settings?.taxi_slots,
    num_teams: l.settings?.num_teams,
  },
});

// Captured leagues are numbered first so their fake IDs are stable and predictable.
const ordered = [...leagueIds.map((id) => leagues.find((l) => l.league_id === id)), ...leagues.filter((l) => !leagueIds.includes(l.league_id))];
if (ordered.some((l) => !l)) throw new Error('A requested league ID is not in this account\'s current-season leagues');
const redactedLeagues = ordered.map(redactLeague);

mkdirSync(OUT, { recursive: true });
const write = (name, data) => writeFileSync(`${OUT}/${name}`, JSON.stringify(data, null, 2) + '\n');

write('user.json', { user_id: '100000000000000001', username: 'fixture_owner', display_name: 'Fixture Owner', avatar: null });
write('nfl_state.json', state);
write('user_leagues.json', redactedLeagues);

const playerIds = new Set();
for (const [i, realId] of leagueIds.entries()) {
  const [rosters, users] = await Promise.all([get(`/league/${realId}/rosters`), get(`/league/${realId}/users`)]);
  const id = fakeLeagueId(realId);
  const n = pad(i + 1);
  write(`league_${n}.json`, redactedLeagues[i]);
  write(
    `league_${n}_rosters.json`,
    rosters.map((r) => {
      for (const p of [...(r.players ?? []), ...(r.starters ?? [])]) playerIds.add(p);
      return {
        roster_id: r.roster_id,
        league_id: id,
        owner_id: fakeUserId(r.owner_id),
        co_owners: r.co_owners ? r.co_owners.map(fakeUserId) : null,
        starters: r.starters,
        players: r.players,
        reserve: r.reserve,
        taxi: r.taxi,
      };
    }),
  );
  write(
    `league_${n}_users.json`,
    users.map((u, j) => ({
      user_id: fakeUserId(u.user_id),
      display_name: u.user_id === user.user_id ? 'Fixture Owner' : `Manager ${pad(j + 1)}`,
      metadata: u.metadata?.team_name ? { team_name: `Team ${pad(j + 1)}` } : {},
    })),
  );
}

const allPlayers = await get('/players/nfl');
const subset = {};
for (const id of [...playerIds].sort()) {
  const p = allPlayers[id];
  if (!p) continue;
  subset[id] = {
    player_id: p.player_id,
    first_name: p.first_name,
    last_name: p.last_name,
    full_name: p.full_name,
    position: p.position,
    fantasy_positions: p.fantasy_positions,
    team: p.team,
    status: p.status,
    injury_status: p.injury_status,
  };
}
// One team defense, whose record has no full_name, to cover that naming path.
subset.PHI = (({ player_id, first_name, last_name, full_name, position, fantasy_positions, team, status, injury_status }) => ({ player_id, first_name, last_name, full_name, position, fantasy_positions, team, status, injury_status }))(allPlayers.PHI);
write('players_subset.json', subset);
console.log(`Wrote fixtures for ${leagueIds.length} league(s), ${Object.keys(subset).length} players, ${redactedLeagues.length} league summaries.`);
