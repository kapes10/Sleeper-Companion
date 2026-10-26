// LIVE: trade partner matching for every league of the configured owner, using real Sleeper data
// and the FantasyCalc values published on the hosted site (never calls FantasyCalc). Not part of `npm test`.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createClient } from '../../src/api/client';
import { createSleeperApi } from '../../src/api/sleeper';
import { analyzeLeague } from '../../src/analysis/tiers';
import { recommendStance } from '../../src/analysis/stance';
import { analyzePositions } from '../../src/analysis/positional/positional';
import { matchPartners } from '../../src/analysis/partners';
import { findOwnerRoster, teamName } from '../../src/domain/roster';
import { toPlayerIndex } from '../../src/domain/players';
import { parseFcResponse, type FcPickValue } from '../../src/valuations/fantasycalc/parse';
import type { ValuesIndex } from '../../src/valuations/fantasycalc/refresh';
import { selectFcSet } from '../../src/valuations/leagueValues';
import { matchValues } from '../../src/valuations/match';

const SITE = 'https://kapes10.github.io/Sleeper-Companion/data/fantasycalc/';
const { sleeperUserId: ME } = JSON.parse(readFileSync('valuations.config.json', 'utf8')) as { sleeperUserId: string };
const api = createSleeperApi(createClient({ maxConcurrent: 2 }));

it('matches trade partners in every league (live)', async () => {
  const state = await api.getNflState();
  const [leagues, raw, index] = await Promise.all([api.getUserLeagues(ME, state.league_season), api.getAllPlayers(), fetch(`${SITE}index.json?t=${Date.now()}`).then((r) => r.json() as Promise<ValuesIndex>)]);
  const players = toPlayerIndex(raw);
  const snaps = new Map<string, { values: ReturnType<typeof matchValues>['bySleeperId']; picks: FcPickValue[] }>();
  const lines: string[] = [];
  const tally: Record<string, number> = {};
  for (const league of leagues) {
    const sel = selectFcSet(league, index);
    let values = null;
    let picks: FcPickValue[] = [];
    if (sel.kind === 'available') {
      if (!snaps.has(sel.key)) {
        const parsed = parseFcResponse(await (await fetch(SITE + sel.state.latest!.file)).json(), { minPlayers: 1, maxUnreadableShare: 1 });
        if (!parsed.ok) throw new Error(parsed.error);
        snaps.set(sel.key, { values: matchValues(parsed.players.map((p) => ({ sleeperId: p.sleeperId, name: p.name, position: p.position, team: p.team, value: p.value })), players).bySleeperId, picks: parsed.picks });
      }
      ({ values, picks } = snaps.get(sel.key)!);
    }
    const weeks = [state.week, state.week - 1, state.week - 2].filter((w) => w >= 1);
    const [rosters, users, traded, ...tx] = await Promise.all([api.getRosters(league.league_id), api.getLeagueUsers(league.league_id), api.getTradedPicks(league.league_id), ...weeks.map((w) => api.getTransactions(league.league_id, w))]);
    const analysis = analyzeLeague({ league, rosters, tradedPicks: traded, recentTransactions: tx.flat(), players, currentWeek: state.week });
    const mine = findOwnerRoster(rosters, ME);
    const stance = recommendStance(analysis, mine);
    const positional = analyzePositions({ league, rosters, players, values });
    const nameOf = (rid: number) => teamName(users, rosters.find((r) => r.roster_id === rid)?.owner_id ?? null) ?? `Team ${rid}`;
    const r = matchPartners({ league, analysis, stance, mine, positional, fcPicks: picks, protectedIds: new Set(), nameOf, currentWeek: state.week });

    const outcome = r.kind === 'list' ? (r.caveat ? 'list (low-confidence caveat)' : 'list') : `explanation: ${r.code}`;
    tally[outcome] = (tally[outcome] ?? 0) + 1;
    const head = `${league.name.trim()} | ${stance.team ? `${stance.team.tier}/${stance.team.confidence}` : '-'} | ${stance.headline}`;
    if (r.kind === 'list') {
      expect(r.partners.length).toBeGreaterThan(0);
      lines.push(`${head} | ${outcome} | ${r.partners.length} partners, ${r.notListed.length} not listed`);
      for (const p of r.partners.slice(0, 3)) {
        lines.push(
          `    #${p.rank}${p.tied ? ' (tied)' : ''} ${nameOf(p.rosterId)} [${p.tier}/${p.tierConfidence}] grade ${p.grade}, ${p.fit}, trades ${p.recentTrades}, label ${p.confidence} | they have ${p.theyHave.join('/') || '-'}: ${p.targets.flatMap((g) => g.players.map((x) => x.name)).join(', ') || '-'} | they need ${p.theyNeed.join('/') || '-'}: ${p.offers.flatMap((g) => g.players.map((x) => x.name)).join(', ') || '-'}`,
        );
      }
    } else lines.push(`${head} | ${outcome}`);
  }
  console.log('\n' + lines.join('\n') + '\n\nTALLY ' + JSON.stringify(tally));
});
