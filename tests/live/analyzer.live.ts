// LIVE: runs the Team Analyzer on every league of the configured owner and prints the results.
// Makes real Sleeper requests (including one /players/nfl download). Not part of `npm test`.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createClient } from '../../src/api/client';
import { createSleeperApi } from '../../src/api/sleeper';
import { analyzeLeague } from '../../src/analysis/tiers';
import { recommendStance } from '../../src/analysis/stance';
import { formatRecord } from '../../src/analysis/standings';
import { toPlayerIndex } from '../../src/domain/players';
import { findOwnerRoster } from '../../src/domain/roster';

const { sleeperUserId } = JSON.parse(readFileSync('valuations.config.json', 'utf8')) as { sleeperUserId: string };
const api = createSleeperApi(createClient({ maxConcurrent: 2 }));

it('classifies every team in every league exactly once (live)', async () => {
  const state = await api.getNflState();
  const season = state.league_season || state.season;
  const [leagues, raw] = await Promise.all([api.getUserLeagues(sleeperUserId, season), api.getAllPlayers()]);
  const players = toPlayerIndex(raw);
  const weeks = [state.week, state.week - 1, state.week - 2].filter((w) => w >= 1);
  const lines: string[] = [];
  for (const league of leagues) {
    const [rosters, tradedPicks, ...tx] = await Promise.all([
      api.getRosters(league.league_id),
      api.getTradedPicks(league.league_id),
      ...weeks.map((w) => api.getTransactions(league.league_id, w)),
    ]);
    const a = analyzeLeague({ league, rosters, tradedPicks, recentTransactions: tx.flat(), players, currentWeek: state.week });
    const placed = [...(a.teams ?? []).map((t) => t.rosterId), ...a.excluded.map((e) => e.rosterId)];
    if (a.teams) expect(new Set(placed).size).toBe(rosters.length);
    expect(placed.length).toBe(a.teams ? rosters.length : 0);
    const stance = recommendStance(a, findOwnerRoster(rosters, sleeperUserId));
    const mine = stance.team;
    const counts = a.teams ? ['contender', 'bubble', 'seller', 'deep_rebuild'].map((t) => a.teams!.filter((x) => x.tier === t).length).join('/') : 'no tiers';
    lines.push(
      [league.name.trim(), mine ? `${formatRecord(mine.record)} ${mine.tier} (${mine.confidence})` : '—', stance.kind === 'recommendation' ? stance.headline : stance.headline, `C/B/S/D ${counts}`, `excluded ${a.excluded.length}`, mine?.reason ?? ''].join(' | '),
    );
  }
  console.log(`\nweek ${state.week}\n` + lines.join('\n'));
});
