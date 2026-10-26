// LIVE: positional market-value analysis on every league of the configured owner, using the
// FantasyCalc values published on the hosted site (never calls FantasyCalc). Not part of `npm test`.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createClient } from '../../src/api/client';
import { createSleeperApi } from '../../src/api/sleeper';
import { analyzePositions } from '../../src/analysis/positional/positional';
import { ANALYZED_POSITIONS } from '../../src/analysis/positional/slots';
import { toPlayerIndex } from '../../src/domain/players';
import { parseFcResponse } from '../../src/valuations/fantasycalc/parse';
import type { ValuesIndex } from '../../src/valuations/fantasycalc/refresh';
import { selectFcSet } from '../../src/valuations/leagueValues';
import { matchValues } from '../../src/valuations/match';

const SITE = 'https://kapes10.github.io/Sleeper-Companion/data/fantasycalc/';
const { sleeperUserId } = JSON.parse(readFileSync('valuations.config.json', 'utf8')) as { sleeperUserId: string };
const api = createSleeperApi(createClient({ maxConcurrent: 2 }));

it('analyzes positional market value for every team in every league (live)', async () => {
  const state = await api.getNflState();
  const [leagues, raw, index] = await Promise.all([
    api.getUserLeagues(sleeperUserId, state.league_season || state.season),
    api.getAllPlayers(),
    fetch(`${SITE}index.json?t=${Date.now()}`).then((r) => r.json() as Promise<ValuesIndex>),
  ]);
  const players = toPlayerIndex(raw);
  const snapshots = new Map<string, ReturnType<typeof matchValues>['bySleeperId']>();
  const lines: string[] = [];
  for (const league of leagues) {
    const sel = selectFcSet(league, index);
    let values = null;
    if (sel.kind === 'available') {
      if (!snapshots.has(sel.key)) {
        const parsed = parseFcResponse(await (await fetch(SITE + sel.state.latest!.file)).json(), { minPlayers: 1, maxUnreadableShare: 1 });
        if (!parsed.ok) throw new Error(parsed.error);
        snapshots.set(sel.key, matchValues(parsed.players.map((p) => ({ sleeperId: p.sleeperId, name: p.name, position: p.position, team: p.team, value: p.value })), players).bySleeperId);
      }
      values = snapshots.get(sel.key)!;
    }
    const rosters = await api.getRosters(league.league_id);
    const r = analyzePositions({ league, rosters, players, values });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') continue;
    expect(r.teams.length + r.excluded.length).toBe(rosters.length);
    const me = r.teams.find((t) => rosters.find((x) => x.roster_id === t.rosterId)?.owner_id === sleeperUserId)!;
    const withheld = r.teams.reduce((s, t) => s + ANALYZED_POSITIONS.filter((p) => t.positions[p].label === 'withheld').length, 0);
    const low = r.teams.reduce((s, t) => s + ANALYZED_POSITIONS.filter((p) => t.positions[p].lowConfidence).length, 0);
    lines.push(
      [
        league.name.trim(),
        ANALYZED_POSITIONS.map((p) => `${p} ${me.positions[p].label}${me.positions[p].lowConfidence ? '(low)' : ''} #${me.positions[p].rank}`).join(', '),
        `needs: ${me.needs.join('/') || '-'}`,
        `surplus: ${me.surpluses.map((p) => `${p} (${me.positions[p].surplus.map((x) => x.name).join(', ')})`).join('; ') || '-'}`,
        `unvalued ${me.unvalued.length}/${me.rostered}`,
        `league withheld ${withheld}, low ${low}`,
      ].join(' | '),
    );
  }
  console.log('\n' + lines.join('\n'));
});
