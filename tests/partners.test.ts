import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deadlineInfo, deadlineLabel, matchPartners, type PartnerInput, type PartnerResult } from '../src/analysis/partners';
import { analyzePositions, type PlayerRef, type TeamPositional } from '../src/analysis/positional/positional';
import type { Position } from '../src/analysis/positional/slots';
import { analyzeLeague, type Confidence, type Tier } from '../src/analysis/tiers';
import { recommendStance, type StanceResult } from '../src/analysis/stance';
import { findOwnerRoster } from '../src/domain/roster';
import { AZ_OWNER, azInput, azPartnerInput, azPlayers, azValues, ownerRosterId, setWeeksPlayed, type Letter } from './analyzerHelpers';

// ---------- helpers for controlled scenarios (built from real fixture data, then edited) ----------
const posTeams = (i: PartnerInput) => {
  if (i.positional?.status !== 'ok') throw new Error('positional not ok');
  return i.positional.teams;
};
const posTeam = (i: PartnerInput, rosterId: number) => posTeams(i).find((t) => t.rosterId === rosterId)!;
const others = (i: PartnerInput, letter: Letter) => i.analysis.teams!.filter((t) => t.rosterId !== ownerRosterId(letter)).map((t) => t.rosterId);
const player = (id: string, position: Position, value: number, injury: string | null = null): PlayerRef => ({
  id,
  name: `Player ${id}`,
  position,
  sleeperPosition: position,
  team: null,
  value,
  scaled: Math.round(value / 100),
  injury,
});
/** Gives a team exactly these needs/surpluses (and surplus players), clearing everything else. */
function setPositions(t: TeamPositional, needs: Position[], surplus: Partial<Record<Position, PlayerRef[]>>) {
  for (const p of ['QB', 'RB', 'WR', 'TE'] as Position[]) {
    t.positions[p].surplus = surplus[p] ?? [];
    t.positions[p].label = needs.includes(p) ? 'need' : surplus[p]?.length ? 'surplus' : 'adequate';
    t.positions[p].lowConfidence = false;
  }
  t.needs = needs;
  t.surpluses = Object.keys(surplus) as Position[];
}
function setTier(i: PartnerInput, rosterId: number, tier: Tier, confidence: Confidence = 'high', recentTrades = 0) {
  const t = i.analysis.teams!.find((x) => x.rosterId === rosterId)!;
  t.tier = tier;
  t.confidence = confidence;
  t.recentTrades = recentTrades;
}
function withStance(i: PartnerInput, stance: 'buy' | 'sell' | 'hold', kind: 'recommendation' | 'insufficient' = 'recommendation'): PartnerInput {
  const team = { ...i.stance.team!, confidence: (kind === 'insufficient' ? 'low' : 'high') as Confidence };
  const s: StanceResult = kind === 'recommendation' ? { kind, stance, team, headline: stance, reasons: [] } : { kind, leaning: stance, team, headline: `leaning ${stance}`, reasons: [] };
  return { ...i, stance: s };
}
/** League D, confident Buy, with every other team cleared to "no fit"; the owner needs RB and has QB surplus. */
function cleanD() {
  const i = withStance(azPartnerInput('D'), 'buy');
  const me = ownerRosterId('D');
  setPositions(posTeam(i, me), ['RB'], { QB: [player('q1', 'QB', 2000), player('q2', 'QB', 1500)] });
  for (const id of others(i, 'D')) {
    setPositions(posTeam(i, id), [], {});
    setTier(i, id, 'bubble');
  }
  return { i, me, ids: others(i, 'D') };
}
const list = (r: PartnerResult) => {
  if (r.kind !== 'list') throw new Error(`expected a list, got: ${r.reason}`);
  return r;
};

// ---------------------------------------------------------------------------------------------
describe('real fixture leagues (redacted Sleeper + real FantasyCalc)', () => {
  it('league A: no needs and no surpluses → "no reasonable fit" explanation', () => {
    const r = matchPartners(azPartnerInput('A'));
    expect(r).toMatchObject({ kind: 'explanation', code: 'no_fit' });
  });

  it('league B: leaning Sell (low confidence) → list with a visible caveat, contenders first, all Low', () => {
    const i = azPartnerInput('B');
    const r = list(matchPartners(i));
    expect(r.myStance).toBe('sell');
    expect(r.caveat).toMatch(/low-confidence leaning toward selling/);
    expect(r.partners.every((p) => p.confidence === 'low')).toBe(true);
    expect(r.partners.map((p) => p.grade)).toEqual([...r.partners.map((p) => p.grade)].sort());
    expect(r.partners[0]!.tier).toBe('contender');
  });

  it.each(['C', 'D'] as Letter[])('league %s: confident Buy → ordered by grade, then fit, then recent trades; ties share a position', (letter) => {
    const i = azPartnerInput(letter);
    const r = list(matchPartners(i));
    expect(r.myStance).toBe('buy');
    expect(r.caveat).toBeNull();
    for (let k = 1; k < r.partners.length; k++) {
      const a = r.partners[k - 1]!;
      const b = r.partners[k]!;
      const ka = [a.grade, a.fit === 'two-way' ? 0 : 1, -a.recentTrades];
      const kb = [b.grade, b.fit === 'two-way' ? 0 : 1, -b.recentTrades];
      const firstDiff = ka.findIndex((v, idx) => v !== kb[idx]);
      if (firstDiff >= 0) expect(ka[firstDiff]!).toBeLessThan(kb[firstDiff]!); // strictly better on the first differing key
      else {
        expect(a.rank).toBe(b.rank);
        expect(a.tied && b.tied).toBe(true);
        expect(i.nameOf(a.rosterId).localeCompare(i.nameOf(b.rosterId))).toBeLessThanOrEqual(0);
      }
    }
    // Recent trades break the tie between otherwise-equal partners: the 1-trade team is first and not tied.
    expect(r.partners[0]).toMatchObject({ rank: 1, tied: false, recentTrades: 1 });
  });

  it('league D: offers are the owner’s real QB surplus (Rodgers, McKee), highest value first, as assets to consider', () => {
    const r = list(matchPartners(azPartnerInput('D')));
    for (const p of r.partners) {
      expect(p.theyNeed).toEqual(['QB']);
      expect(p.offers[0]!.players.map((x) => x.name)).toEqual(['Aaron Rodgers', 'Tanner McKee']);
      expect(p.reasons.join(' ')).toMatch(/They have a need at QB, where you have surplus market value/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('ranking', () => {
  it('Buy: stance first. A one-way Seller outranks a two-way Contender; Bubble sits between', () => {
    const { i, ids } = cleanD();
    const [seller, contender, bubble] = ids as [number, number, number];
    setTier(i, seller, 'seller');
    setPositions(posTeam(i, seller), [], { RB: [player('r1', 'RB', 3000)] }); // they have what I need → one-way
    setTier(i, contender, 'contender');
    setPositions(posTeam(i, contender), ['QB'], { RB: [player('r2', 'RB', 2500)] }); // two-way
    setTier(i, bubble, 'bubble');
    setPositions(posTeam(i, bubble), ['QB'], {}); // one-way
    const r = list(matchPartners(i));
    expect(r.partners.map((p) => [p.rosterId, p.grade, p.fit, p.rank])).toEqual([
      [seller, 1, 'one-way', 1],
      [bubble, 2, 'one-way', 2],
      [contender, 3, 'two-way', 3],
    ]);
    expect(r.partners[2]!.reasons[0]).toMatch(/Stances don't line up; listed only for a two-way positional fit/);
  });

  it('Sell: Contender is grade 1, Bubble grade 2; Seller/Deep Rebuild only when two-way', () => {
    const { i: base, ids } = cleanD();
    const i = withStance(base, 'sell');
    const [contender, bubble, seller2way, rebuild1way] = ids as [number, number, number, number];
    setTier(i, contender, 'contender');
    setPositions(posTeam(i, contender), ['QB'], {});
    setTier(i, bubble, 'bubble');
    setPositions(posTeam(i, bubble), ['QB'], { RB: [player('r1', 'RB', 1200)] });
    setTier(i, seller2way, 'seller');
    setPositions(posTeam(i, seller2way), ['QB'], { RB: [player('r2', 'RB', 1300)] });
    setTier(i, rebuild1way, 'deep_rebuild');
    setPositions(posTeam(i, rebuild1way), ['QB'], {});
    const r = list(matchPartners(i));
    expect(r.partners.map((p) => [p.rosterId, p.grade, p.fit])).toEqual([
      [contender, 1, 'one-way'],
      [bubble, 2, 'two-way'],
      [seller2way, 3, 'two-way'],
    ]);
    expect(r.notListed).toContainEqual({ rosterId: rebuild1way, reason: "Stances don't line up and the fit is only one-way." });
  });

  it('Seller and Deep Rebuild are equal for a buyer, and two-way comes before one-way within a grade', () => {
    const { i, ids } = cleanD();
    const [a, b, c] = ids as [number, number, number];
    setTier(i, a, 'deep_rebuild');
    setPositions(posTeam(i, a), [], { RB: [player('r1', 'RB', 1100)] });
    setTier(i, b, 'seller');
    setPositions(posTeam(i, b), ['QB'], { RB: [player('r2', 'RB', 1100)] });
    setTier(i, c, 'seller');
    setPositions(posTeam(i, c), [], { RB: [player('r3', 'RB', 1100)] });
    const r = list(matchPartners(i));
    expect(r.partners[0]).toMatchObject({ rosterId: b, fit: 'two-way', rank: 1, tied: false });
    expect(r.partners.slice(1).map((p) => [p.rank, p.tied])).toEqual([
      [2, true],
      [2, true],
    ]);
  });

  it('identical needs and fit: a tie is preserved (shared position, alphabetical display); trades break it', () => {
    const { i, ids } = cleanD();
    const [a, b] = ids as [number, number];
    for (const id of [a, b]) {
      setTier(i, id, 'seller');
      setPositions(posTeam(i, id), ['QB'], {});
    }
    const r = list(matchPartners(i));
    const names = r.partners.map((p) => i.nameOf(p.rosterId));
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    expect(r.partners.map((p) => [p.rank, p.tied])).toEqual([
      [1, true],
      [1, true],
    ]);
    // Reverse the names: display order flips, ranks don't change.
    const flipped = list(matchPartners({ ...i, nameOf: (id) => (id === a ? 'zzz' : id === b ? 'aaa' : i.nameOf(id)) }));
    expect(flipped.partners.map((p) => p.rosterId)).toEqual([b, a]);
    expect(flipped.partners.every((p) => p.rank === 1 && p.tied)).toBe(true);
    // A recent trade breaks the tie.
    setTier(i, a, 'seller', 'high', 2);
    const broken = list(matchPartners(i));
    expect(broken.partners.map((p) => [p.rosterId, p.rank, p.tied])).toEqual([
      [a, 1, false],
      [b, 2, false],
    ]);
  });

  it('confidence is a label only: it never changes the order', () => {
    const { i, ids } = cleanD();
    const [a, b] = ids as [number, number];
    setTier(i, a, 'seller', 'low');
    setPositions(posTeam(i, a), ['QB'], { RB: [player('r1', 'RB', 1500)] });
    setTier(i, b, 'seller', 'high');
    setPositions(posTeam(i, b), ['QB'], {});
    const r = list(matchPartners(i));
    expect(r.partners.map((p) => [p.rosterId, p.confidence])).toEqual([
      [a, 'low'],
      [b, 'high'],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('targets, offers and protected players', () => {
  it('targets: their surplus at your need; up to 3, highest value first; injuries are notes only', () => {
    const { i, ids } = cleanD();
    const [a] = ids as [number];
    setTier(i, a, 'seller');
    const rbs = [player('r1', 'RB', 1100), player('r2', 'RB', 3000, 'Out'), player('r3', 'RB', 2000), player('r4', 'RB', 1500)];
    setPositions(posTeam(i, a), [], { RB: rbs });
    const p = list(matchPartners(i)).partners[0]!;
    expect(p.targets).toEqual([{ position: 'RB', players: [rbs[1], rbs[2], rbs[3]] }]);
    expect(p.targets[0]!.players[0]).toMatchObject({ value: 3000, injury: 'Out' }); // value unchanged by injury
    expect(p.offers).toEqual([]);
  });

  it('protected players are never offered; protecting every surplus player at a position removes that fit', () => {
    const { i, ids } = cleanD();
    const [a, b] = ids as [number, number];
    setTier(i, a, 'seller');
    setPositions(posTeam(i, a), ['QB'], {});
    setTier(i, b, 'seller');
    setPositions(posTeam(i, b), ['QB'], { RB: [player('r1', 'RB', 1500)] });

    const one = list(matchPartners({ ...i, protectedIds: new Set(['q1']) }));
    expect(one.protectedCount).toBe(1);
    for (const p of one.partners) expect(p.offers.flatMap((g) => g.players.map((x) => x.id))).toEqual(['q2']);

    const all = list(matchPartners({ ...i, protectedIds: new Set(['q1', 'q2']) }));
    expect(all.partners.map((p) => [p.rosterId, p.fit, p.theyNeed])).toEqual([[b, 'one-way', []]]); // b only on "they have"
    expect(all.notListed.map((n) => n.rosterId)).toContain(a);
    expect(JSON.stringify(all.partners)).not.toMatch(/"q1"|"q2"/);
  });

  it('every listed asset has a matched value (unvalued players are never offered or targeted)', () => {
    for (const l of ['B', 'C', 'D'] as Letter[]) {
      const r = matchPartners(azPartnerInput(l));
      if (r.kind !== 'list') continue;
      for (const p of r.partners) for (const g of [...p.targets, ...p.offers]) for (const x of g.players) expect(x.value).not.toBeNull();
    }
  });
});

describe('draft picks (context only)', () => {
  it('maps by exact season and round to the plain FantasyCalc value; never early/mid/late; otherwise no value', () => {
    const i = azPartnerInput('D');
    const p = list(matchPartners(i)).partners[0]!;
    const plain = (name: string) => i.fcPicks.find((x) => x.name === name)?.value ?? null;
    for (const line of [...p.picks.mine!, ...p.picks.theirs!]) {
      const ord = line.round === 1 ? '1st' : line.round === 2 ? '2nd' : line.round === 3 ? '3rd' : `${line.round}th`;
      expect(line.value).toBe(plain(`${line.season} ${ord}`));
    }
    expect(i.fcPicks.some((x) => x.name === '2027 1st (Early)')).toBe(true); // exists, but never used
    // A season FantasyCalc doesn't list → no value.
    const noMap = list(matchPartners({ ...i, fcPicks: [] })).partners[0]!;
    expect(noMap.picks.mine!.every((l) => l.value === null)).toBe(true);
    // Picks never appear as targets or offers.
    for (const g of [...p.targets, ...p.offers]) expect(g.position).not.toBe('PICK');
  });
});

// ---------------------------------------------------------------------------------------------
describe('explanations instead of a list', () => {
  const code = (i: PartnerInput) => matchPartners(i) as Extract<PartnerResult, { kind: 'explanation' }>;

  it('Hold and leaning Hold: no list, no preferred tier', () => {
    expect(code(withStance(azPartnerInput('D'), 'hold'))).toMatchObject({ code: 'hold', reason: expect.stringMatching(/^Your stance is Hold.*No tier is assumed/) });
    expect(code(withStance(azPartnerInput('D'), 'hold', 'insufficient'))).toMatchObject({ code: 'hold', reason: expect.stringMatching(/leaning Hold/) });
  });

  it('trade deadline passed', () => {
    expect(code(azPartnerInput('D', (d) => (d.league.settings.trade_deadline = 5)))).toMatchObject({ code: 'deadline_passed', reason: 'Trades closed after week 5, so no partners are suggested.' });
  });

  it('no games remaining, and season not started', () => {
    expect(code(azPartnerInput('D', (d) => setWeeksPlayed(d.rosters, 14)))).toMatchObject({ code: 'no_games' });
    expect(code(azPartnerInput('D', (d) => (d.league.status = 'pre_draft')))).toMatchObject({ code: 'not_started' });
  });

  it.each([
    [0, 'redraft'],
    [1, 'keeper'],
  ])('league type %s (%s): dynasty only', (type) => {
    expect(code(azPartnerInput('D', (d) => (d.league.settings.type = type)))).toMatchObject({ code: 'not_dynasty', reason: 'Partner matching is available for dynasty leagues only.' });
  });

  it('your team not found, or on two rosters (ambiguous)', () => {
    const i = azPartnerInput('D');
    expect(code({ ...i, mine: { kind: 'not_found' } })).toMatchObject({ code: 'not_found' });
    expect(code({ ...i, mine: { kind: 'ambiguous', rosterIds: [1, 2] } })).toMatchObject({ code: 'ambiguous' });
  });

  it('unsupported lineup slots (Stage 4 withheld) or no FantasyCalc values → positional unavailable', () => {
    const unsupported = azPartnerInput('D', (d) => d.league.roster_positions.splice(1, 0, 'K'));
    expect(code(unsupported)).toMatchObject({ code: 'positional_unavailable', reason: expect.stringMatching(/doesn't support \(K\)/) });
    expect(code({ ...azPartnerInput('D'), positional: null })).toMatchObject({ code: 'positional_unavailable', reason: expect.stringMatching(/could not be loaded/) });
  });

  it('a tier with no complementary partners → "no reasonable fit"', () => {
    const { i, ids } = cleanD();
    for (const id of ids) setTier(i, id, 'contender'); // only grade-3 teams, none with two-way fit
    setPositions(posTeam(i, ids[0]!), ['QB'], {});
    expect(code(i)).toMatchObject({ code: 'no_fit' });
  });
});

describe('deadline labels', () => {
  it('99 is "no deadline", labeled an observed convention; a week; or not provided', () => {
    const { league } = azInput('D');
    expect(deadlineInfo({ ...league, settings: { ...league.settings, trade_deadline: 99 } }, 7)).toEqual({ kind: 'none_observed' });
    expect(deadlineLabel({ kind: 'none_observed' })).toMatch(/observed convention, not documented/);
    expect(deadlineLabel(deadlineInfo({ ...league, settings: { ...league.settings, trade_deadline: 12 } }, 7))).toBe('Trade deadline: week 12.');
    expect(deadlineLabel(deadlineInfo({ ...league, settings: { ...league.settings, trade_deadline: undefined } }, 7))).toBe('Trade deadline: not provided by Sleeper.');
    const r = matchPartners(azPartnerInput('D', (d) => (d.league.settings.trade_deadline = 99)));
    expect(r.deadline).toEqual({ kind: 'none_observed' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('confidence labels', () => {
  it('starts at the lower of your stance and their tier confidence', () => {
    const { i, ids } = cleanD();
    setTier(i, ids[0]!, 'seller', 'medium');
    setPositions(posTeam(i, ids[0]!), ['QB'], {});
    expect(list(matchPartners(i)).partners[0]).toMatchObject({ confidence: 'medium', confidenceNotes: ['Their tier is medium confidence.'] });
  });

  it('your low-confidence leaning makes every partner Low, with a visible caveat', () => {
    const { i, ids } = cleanD();
    setTier(i, ids[0]!, 'seller', 'high');
    setPositions(posTeam(i, ids[0]!), ['QB'], {});
    const r = list(matchPartners(withStance(i, 'buy', 'insufficient')));
    expect(r.caveat).toBeTruthy();
    expect(r.partners[0]!.confidence).toBe('low');
  });

  it('a low-confidence position in the fit lowers it one level; under 75% valued coverage makes it Low', () => {
    const { i, ids } = cleanD();
    setTier(i, ids[0]!, 'seller', 'high');
    setPositions(posTeam(i, ids[0]!), ['QB'], {});
    posTeam(i, ids[0]!).positions.QB.lowConfidence = true;
    expect(list(matchPartners(i)).partners[0]).toMatchObject({ confidence: 'medium', confidenceNotes: ['Low-confidence market value at QB.'] });

    const t = posTeam(i, ids[0]!);
    t.positions.QB.lowConfidence = false;
    t.unvalued = Array.from({ length: Math.ceil(t.rostered * 0.3) }, (_, k) => player(`u${k}`, 'WR', 0));
    const p = list(matchPartners(i)).partners[0]!;
    expect(p.confidence).toBe('low');
    expect(p.confidenceNotes.join(' ')).toMatch(/Their roster has only \d+ of \d+ players with a FantasyCalc value/);
  });

  it('early season (weeks 1–2): tiers are Low, so your stance is a leaning (caveat) or Hold', () => {
    const r = matchPartners(azPartnerInput('D', (d) => setWeeksPlayed(d.rosters, 2)));
    if (r.kind === 'list') {
      expect(r.caveat).toBeTruthy();
      expect(r.partners.every((p) => p.confidence === 'low')).toBe(true);
    } else expect(['hold', 'no_fit']).toContain(r.code);
  });
});

describe('abandoned and co-owned teams', () => {
  it('an abandoned roster is excluded with a note, never suggested', () => {
    const i = azPartnerInput('D', (d) => (d.rosters.find((r) => r.owner_id !== AZ_OWNER)!.owner_id = null));
    const r = matchPartners(i);
    const orphan = i.analysis.excluded[0]!.rosterId;
    expect(r.excluded).toContainEqual(expect.objectContaining({ rosterId: orphan, reason: expect.stringMatching(/abandoned/) }));
    if (r.kind === 'list') expect(r.partners.some((p) => p.rosterId === orphan)).toBe(false);
  });

  it('a co-owned partner team is treated like any other team', () => {
    const plain = matchPartners(azPartnerInput('D'));
    const co = matchPartners(azPartnerInput('D', (d) => (d.rosters.find((r) => r.owner_id !== AZ_OWNER)!.co_owners = ['200000000000099999'])));
    expect(co).toEqual(plain);
  });
});

describe('language: no verdicts, acceptance or proposals', () => {
  it('reasons never mention fairness, acceptance, probability or a trade proposal', () => {
    for (const l of ['B', 'C', 'D'] as Letter[]) {
      const r = matchPartners(azPartnerInput(l));
      const text = JSON.stringify(r).toLowerCase();
      expect(text).not.toMatch(/fair|accept|probab|proposal|lopsided|% chance/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('regression: Stage 5 changes no tier, confidence, stance or Stage 4 output', () => {
  const tierBaseline = JSON.parse(readFileSync('tests/fixtures/analyzer/tier-baseline.json', 'utf8')) as Record<string, unknown>;
  const s4Baseline = JSON.parse(readFileSync('tests/fixtures/analyzer/stage4-baseline.json', 'utf8')) as Record<string, unknown>;

  it.each(['A', 'B', 'C', 'D'] as Letter[])('league %s matches both pre-Stage-5 baselines, and matching never modifies its inputs', (letter) => {
    const input = azInput(letter);
    const a = analyzeLeague(input);
    const mine = findOwnerRoster(input.rosters, AZ_OWNER);
    const s = recommendStance(a, mine);
    const positional = analyzePositions({ league: input.league, rosters: input.rosters, players: azPlayers, values: azValues(letter) });

    const pi: PartnerInput = { ...azPartnerInput(letter), analysis: a, stance: s, mine, positional };
    const before = JSON.stringify([a, s, positional]);
    matchPartners(pi);
    matchPartners({ ...pi, protectedIds: new Set(['x']) });
    expect(JSON.stringify([a, s, positional])).toBe(before);

    expect({
      teams: a.teams!.map((t) => ({ rosterId: t.rosterId, tier: t.tier, confidence: t.confidence, reason: t.reason, details: t.details })),
      excluded: a.excluded.map((e) => ({ rosterId: e.rosterId, reason: e.reason })),
      stance: { kind: s.kind, headline: s.headline, reasons: s.reasons, stance: 'stance' in s ? s.stance : null, leaning: 'leaning' in s ? s.leaning : null },
    }).toEqual(tierBaseline[letter]);
    expect(JSON.parse(JSON.stringify(positional))).toEqual(s4Baseline[letter]);
  });
});
