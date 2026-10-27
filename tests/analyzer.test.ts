import { describe, expect, it } from 'vitest';
import { seasonInfo } from '../src/analysis/season';
import { pickBalances, rosterAge, tradeCounts } from '../src/analysis/signals';
import { buildStandings, gamesBack } from '../src/analysis/standings';
import { recommendStance } from '../src/analysis/stance';
import { analyzeLeague, confidenceFromMargin, formatGames, type LeagueAnalysis, type Tier } from '../src/analysis/tiers';
import { findOwnerRoster } from '../src/domain/roster';
import { AZ_OWNER, azInput, azLeague, ownerRosterId, setWeeksPlayed, type Letter } from './analyzerHelpers';

const mine = (a: LeagueAnalysis, letter: Letter) => a.teams!.find((t) => t.rosterId === ownerRosterId(letter))!;
const tierCounts = (a: LeagueAnalysis) =>
  Object.fromEntries((['contender', 'bubble', 'seller', 'deep_rebuild'] as Tier[]).map((t) => [t, a.teams!.filter((x) => x.tier === t).length]));

describe('Team Analyzer on real league data (redacted)', () => {
  it.each(['A', 'B', 'C', 'D'] as Letter[])('league %s: every team is in exactly one tier or excluded, each with a reason and confidence', (letter) => {
    const input = azInput(letter);
    const a = analyzeLeague(input);
    expect(a.teams).not.toBeNull();
    const placed = [...a.teams!.map((t) => t.rosterId), ...a.excluded.map((e) => e.rosterId)];
    expect(placed.sort((x, y) => x - y)).toEqual(input.rosters.map((r) => r.roster_id).sort((x, y) => x - y));
    for (const t of a.teams!) {
      expect(t.reason).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(t.confidence);
      expect(t.details.length).toBeGreaterThan(0);
    }
  });

  it('league A (standard lineup): owner 4-2 is a Contender, but only 1 game clear, so Low confidence', () => {
    const a = analyzeLeague(azInput('A'));
    expect(a.logic).toBe('dynasty');
    expect(a.season).toMatchObject({ playoffTeams: 6, playoffWeekStart: 15, weeksScored: 6, weeksRemaining: 8, gamesRemaining: 8, gamesPerWeek: 1 });
    expect(a.reach).toBe(2);
    expect(a.farOut).toBe(4);
    const me = mine(a, 'A');
    expect(me).toMatchObject({ tier: 'contender', confidence: 'low', gamesClear: 1, inPlayoffSpot: true });
    expect(me.reason).toBe('4-2, 4th in points, 1 game clear of the cutoff');
    expect(tierCounts(a)).toEqual({ contender: 4, bubble: 7, seller: 1, deep_rebuild: 0 });
  });

  it('league B (best ball): owner 0-6 with a young roster is a Deep Rebuild; all four tiers appear', () => {
    const a = analyzeLeague(azInput('B'));
    const me = mine(a, 'B');
    expect(me).toMatchObject({ tier: 'deep_rebuild', gamesBack: 4, confidence: 'low' });
    expect(me.reason).toBe('0-6, 11th in points, 4 games back of the cutoff, young roster');
    expect(me.ageMedian!).toBeLessThanOrEqual(a.leagueMedianAge! - 1);
    expect(tierCounts(a)).toEqual({ contender: 4, bubble: 4, seller: 2, deep_rebuild: 2 });
  });

  it('league C (median games): records and games remaining count double; owner 12-0 is a Contender with High confidence', () => {
    const a = analyzeLeague(azInput('C'));
    expect(a.season).toMatchObject({ gamesPerWeek: 2, weeksScored: 6, gamesRemaining: 16 });
    expect(a.reach).toBe(4);
    expect(a.assumptions.join(' ')).toMatch(/league median/);
    expect(mine(a, 'C')).toMatchObject({ tier: 'contender', confidence: 'high', gamesClear: 7 });
  });

  it('league D (10 teams, 6 make the playoffs): owner 4-2 is a Contender with High confidence', () => {
    const a = analyzeLeague(azInput('D'));
    expect(a.standings).toHaveLength(10);
    expect(mine(a, 'D')).toMatchObject({ tier: 'contender', confidence: 'high', gamesClear: 2 });
  });

  it('counts recent completed trades and future pick balances from real data', () => {
    const a = analyzeLeague(azInput('B'));
    expect(a.pickSeasons).toEqual(['2027', '2028']);
    const total = a.teams!.reduce((s, t) => s + t.netPicks12!, 0);
    expect(total).toBe(0); // every pick gained is a pick someone else gave up
    expect(a.teams!.every((t) => t.futurePicks!.length >= 0)).toBe(true);
    const owned = a.teams!.reduce((s, t) => s + t.futurePicks!.length, 0);
    expect(owned).toBe(12 * 4 * 2); // 12 teams × 4 rounds × 2 seasons, each pick owned by exactly one team
  });
});

describe('edge cases (derived from real league A, then modified)', () => {
  it('weeks 1–2: every team is Low confidence', () => {
    const a = analyzeLeague(azInput('A', (d) => setWeeksPlayed(d.rosters, 2)));
    expect(a.season.weeksScored).toBe(2);
    expect(a.teams!.every((t) => t.confidence === 'low')).toBe(true);
    expect(a.teams![0]!.details.join(' ')).toMatch(/only 2 weeks played/);
  });

  it('weeks 3–4: confidence is capped at Medium', () => {
    const a = analyzeLeague(azInput('A', (d) => setWeeksPlayed(d.rosters, 4)));
    expect(a.teams!.some((t) => t.confidence === 'medium')).toBe(true);
    expect(a.teams!.some((t) => t.confidence === 'high')).toBe(false);
  });

  it('no games played: no tiers, with a reason', () => {
    const a = analyzeLeague(azInput('A', (d) => setWeeksPlayed(d.rosters, 0)));
    expect(a.teams).toBeNull();
    expect(a.noTiersReason).toMatch(/hasn't started/);
    expect(a.standings).toHaveLength(12);
  });

  it('no games remaining (regular season over): no tiers, standings still shown', () => {
    const a = analyzeLeague(azInput('A', (d) => setWeeksPlayed(d.rosters, 14)));
    expect(a.season.phase).toBe('over');
    expect(a.teams).toBeNull();
    expect(a.noTiersReason).toMatch(/regular season is over/);
    expect(recommendStance(a, findOwnerRoster(azLeague('A').rosters, AZ_OWNER))).toMatchObject({ kind: 'unavailable' });
  });

  it.each([
    ['complete', /regular season is over/],
    ['post_season', /regular season is over/],
    ['pre_draft', /hasn't started/],
  ])('league status "%s" is handled without tiers', (status, message) => {
    const a = analyzeLeague(azInput('A', (d) => (d.league.status = status)));
    expect(a.teams).toBeNull();
    expect(a.noTiersReason).toMatch(message);
  });

  it('abandoned roster: excluded with a reason, but still counted in the standings', () => {
    const input = azInput('A', (d) => (d.rosters.find((r) => r.owner_id !== AZ_OWNER)!.owner_id = null));
    const orphan = input.rosters.find((r) => r.owner_id === null)!;
    const a = analyzeLeague(input);
    expect(a.excluded).toEqual([expect.objectContaining({ rosterId: orphan.roster_id, reason: expect.stringMatching(/No owner \(abandoned roster\)/) })]);
    expect(a.teams!.some((t) => t.rosterId === orphan.roster_id)).toBe(false);
    expect(a.standings).toHaveLength(12);
  });

  it('missing record data for one roster: excluded with a reason', () => {
    const a = analyzeLeague(azInput('A', (d) => (d.rosters.find((r) => r.owner_id !== AZ_OWNER)!.settings = null)));
    expect(a.excluded[0]!.reason).toMatch(/no win\/loss record/);
  });

  it('missing playoff settings: no tiers, and says what is missing', () => {
    const a = analyzeLeague(azInput('A', (d) => (d.league.settings.playoff_teams = undefined)));
    expect(a.teams).toBeNull();
    expect(a.noTiersReason).toBe("Sleeper didn't provide the number of playoff teams, so the playoff line can't be worked out.");
  });

  it('redraft: no Deep Rebuild tier and no age or pick signals', () => {
    const a = analyzeLeague(azInput('B', (d) => (d.league.settings.type = 0)));
    expect(a.logic).toBe('redraft');
    expect(a.teams!.some((t) => t.tier === 'deep_rebuild')).toBe(false);
    const me = mine(a, 'B');
    expect(me).toMatchObject({ tier: 'seller', ageMedian: null, netPicks12: null, futurePicks: null });
    expect(a.leagueMedianAge).toBeNull();
  });

  it('keeper leagues use the dynasty logic', () => {
    const a = analyzeLeague(azInput('B', (d) => (d.league.settings.type = 1)));
    expect(a.logic).toBe('keeper');
    expect(mine(a, 'B').tier).toBe('deep_rebuild');
  });

  it('unknown league type: no tiers', () => {
    expect(analyzeLeague(azInput('A', (d) => (d.league.settings.type = 7))).noTiersReason).toMatch(/not recognised/);
  });

  it('tied records: a tie counts as half a win, and a tie across the playoff line means Low confidence', () => {
    const input = azInput('A', (d) => {
      // Give the 6th and 7th teams identical records (one tie each).
      const st = buildStandings(d.rosters);
      for (const rank of [6, 7]) {
        const r = d.rosters.find((x) => x.roster_id === st[rank - 1]!.rosterId)!;
        r.settings = { ...r.settings, wins: 3, losses: 2, ties: 1 };
      }
    });
    const a = analyzeLeague(input);
    const sixth = a.standings[5]!;
    const seventh = a.standings[6]!;
    expect(sixth.winEq).toBe(3.5);
    expect(gamesBack(sixth, seventh)).toBe(0);
    expect(a.teams!.find((t) => t.rosterId === sixth.rosterId)).toMatchObject({ tiebreak: true, confidence: 'low' });
    expect(a.teams!.find((t) => t.rosterId === seventh.rosterId)).toMatchObject({ tiebreak: true, confidence: 'low', reason: expect.stringMatching(/3-2-1/) });
  });
});

describe('building blocks', () => {
  it('games back counts each tie as half a win and half a loss', () => {
    const [a, b] = buildStandings([
      { roster_id: 1, league_id: 'x', owner_id: 'u1', starters: [], players: [], settings: { wins: 5, losses: 1, ties: 0 } },
      { roster_id: 2, league_id: 'x', owner_id: 'u2', starters: [], players: [], settings: { wins: 3, losses: 2, ties: 1 } },
    ]);
    expect(gamesBack(a!, b!)).toBe(1.5);
    expect(gamesBack(b!, a!)).toBe(-1.5);
  });

  it('confidence from margin, tiebreaks and weeks played', () => {
    expect(confidenceFromMargin(1, false, 6)).toBe('high');
    expect(confidenceFromMargin(0.5, false, 6)).toBe('medium');
    expect(confidenceFromMargin(0.49, false, 6)).toBe('low');
    expect(confidenceFromMargin(5, true, 6)).toBe('low');
    expect(confidenceFromMargin(5, false, 4)).toBe('medium');
    expect(confidenceFromMargin(5, false, 2)).toBe('low');
    expect(confidenceFromMargin(Infinity, false, 8)).toBe('high');
  });

  it('formats game counts', () => {
    expect(formatGames(1)).toBe('1 game');
    expect(formatGames(1.5)).toBe('1.5 games');
    expect(formatGames(4)).toBe('4 games');
  });

  it('works out pick holdings from traded picks only', () => {
    const picks = [
      { season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }, // 1 gets 2's first
      { season: '2027', round: 2, roster_id: 3, previous_owner_id: 3, owner_id: 1 }, // 1 gets 3's second
      { season: '2027', round: 3, roster_id: 1, previous_owner_id: 1, owner_id: 3 }, // 1 gives a third (not counted in 1st/2nds)
      { season: '2026', round: 1, roster_id: 3, previous_owner_id: 3, owner_id: 1 }, // current season: ignored
    ];
    const { seasons, byRoster } = pickBalances(picks, [1, 2, 3], '2026', 3);
    expect(seasons).toEqual(['2027']);
    expect(byRoster.get(1)!.net12).toBe(2);
    expect(byRoster.get(2)!.net12).toBe(-1);
    expect(byRoster.get(1)!.owned!.length).toBe(4); // own 1st + 2nd, 2's 1st, 3's 2nd
    expect(byRoster.get(3)!.owned!.length).toBe(3); // own 1st + 3rd, 1's 3rd
    expect(pickBalances(picks, [1], '2026', null).byRoster.get(1)!.owned).toBeNull();
  });

  it('only counts completed trades, once each', () => {
    const counts = tradeCounts([
      { transaction_id: 'a', type: 'trade', status: 'complete', roster_ids: [1, 2] },
      { transaction_id: 'a', type: 'trade', status: 'complete', roster_ids: [1, 2] },
      { transaction_id: 'b', type: 'trade', status: 'failed', roster_ids: [1, 3] },
      { transaction_id: 'c', type: 'waiver', status: 'complete', roster_ids: [1] },
    ]);
    expect(Object.fromEntries(counts)).toEqual({ 1: 1, 2: 1 });
  });

  it('treats roster age as unavailable when too few players have an age', () => {
    const roster = { roster_id: 1, league_id: 'x', owner_id: 'u', starters: [], players: ['a', 'b', 'c', 'd', 'e'] };
    const ages = (n: number) => Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id, i) => [id, { id, name: id, position: 'WR', team: null, fantasyPositions: [], status: null, injuryStatus: null, age: i < n ? 20 + i : null, depthChartOrder: null }]));
    expect(rosterAge(roster, ages(5)).median).toBe(22);
    expect(rosterAge(roster, ages(4)).median).toBe(21.5);
    expect(rosterAge(roster, ages(3)).median).toBeNull();
  });

  it('reads the season state, including "no deadline" (99) and a passed deadline', () => {
    const { league, rosters } = azLeague('A');
    expect(seasonInfo({ ...league, settings: { ...league.settings, trade_deadline: 99 } }, rosters, 7).tradeDeadline).toBeNull();
    expect(seasonInfo({ ...league, settings: { ...league.settings, trade_deadline: 6 } }, rosters, 7)).toMatchObject({ tradeDeadline: 6, deadlinePassed: true });
  });
});

describe('stance for the owner’s team', () => {
  const stanceFor = (letter: Letter, change?: Parameters<typeof azInput>[1]) => {
    const input = azInput(letter, change);
    return recommendStance(analyzeLeague(input), findOwnerRoster(input.rosters, AZ_OWNER));
  };

  it('Contender with confidence → Buy', () => {
    expect(stanceFor('C')).toMatchObject({ kind: 'recommendation', stance: 'buy', headline: 'Buy' });
  });

  it('Low confidence → not enough data, with the leaning shown', () => {
    expect(stanceFor('A')).toMatchObject({ kind: 'insufficient', leaning: 'buy', headline: 'Not enough data for a confident recommendation. Leaning: Buy.' });
    expect(stanceFor('B')).toMatchObject({ kind: 'insufficient', leaning: 'sell', headline: expect.stringMatching(/Sell veterans for youth and picks/) });
  });

  it('Bubble → Hold and Seller → Sell when confident', () => {
    // Owner in league C falls to 4-8: 1 game back of the 5-7 last seed with 16 left → Bubble (High: 3 games inside reach).
    const hold = stanceFor('C', (d) => {
      const r = d.rosters.find((x) => x.owner_id === AZ_OWNER)!;
      r.settings = { ...r.settings, wins: 4, losses: 8 };
    });
    expect(hold).toMatchObject({ kind: 'recommendation', stance: 'hold', team: { tier: 'bubble', gamesBack: 1, confidence: 'high' } });
    const sell = stanceFor('B', (d) => (d.league.settings.type = 0)); // redraft: 0-6 → Seller
    expect(sell).toMatchObject({ stance: 'sell' });
  });

  it('a passed trade deadline means no stance', () => {
    expect(stanceFor('C', (d) => (d.league.settings.trade_deadline = 5))).toMatchObject({ kind: 'unavailable', headline: 'The trade deadline (week 5) has passed, so trades are closed.' });
  });

  it('team not found or on two rosters → unavailable, never a guess', () => {
    const input = azInput('A');
    const a = analyzeLeague(input);
    expect(recommendStance(a, findOwnerRoster(input.rosters, 'someone-else'))).toMatchObject({ kind: 'unavailable', team: null });
    const two = structuredClone(input.rosters);
    two.find((r) => r.owner_id !== AZ_OWNER)!.co_owners = [AZ_OWNER];
    expect(recommendStance(a, findOwnerRoster(two, AZ_OWNER))).toMatchObject({ kind: 'unavailable', headline: expect.stringMatching(/more than one roster/) });
  });

  it('co-owned roster counts as yours', () => {
    const input = azInput('A', (d) => {
      const r = d.rosters.find((x) => x.owner_id === AZ_OWNER)!;
      r.owner_id = 'another-user';
      r.co_owners = [AZ_OWNER];
    });
    const s = recommendStance(analyzeLeague(input), findOwnerRoster(input.rosters, AZ_OWNER));
    expect(s.team?.rosterId).toBe(ownerRosterId('A'));
  });
});
