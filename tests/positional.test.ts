import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bestLineup, maxWeightAssignment, UNVALUED_GAIN, type Candidate } from '../src/analysis/positional/assign';
import { countedPosition, eligiblePositions, lineupSlots, slotAccepts, type Position } from '../src/analysis/positional/slots';
import { analyzePositions, POSITIONAL_RULES, positionalSummary, type LeaguePositional, type TeamPositional } from '../src/analysis/positional/positional';
import { lookFor } from '../src/analysis/positional/lookFor';
import { analyzeLeague } from '../src/analysis/tiers';
import { recommendStance, type StanceResult } from '../src/analysis/stance';
import { findOwnerRoster } from '../src/domain/roster';
import type { PlayerIndex } from '../src/domain/players';
import { AZ_OWNER, azInput, azLeague, azPlayers, azValues, ownerRosterId, setWeeksPlayed, type Letter } from './analyzerHelpers';

const POS: Position[] = ['QB', 'RB', 'WR', 'TE'];

const run = (letter: Letter, change?: Parameters<typeof azInput>[1], players: PlayerIndex = azPlayers) => {
  const input = azInput(letter, change);
  return { input, result: analyzePositions({ league: input.league, rosters: input.rosters, players, values: azValues(letter) }) };
};
const ok = (r: LeaguePositional) => {
  if (r.status !== 'ok') throw new Error(r.reason);
  return r;
};
const myTeam = (r: LeaguePositional, letter: Letter) => ok(r).teams.find((t) => t.rosterId === ownerRosterId(letter))!;

// ---------------------------------------------------------------------------------------------
describe('optimal slot assignment', () => {
  /** Deterministic pseudo-random numbers so failures are reproducible. */
  function rng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }
  const gain = (c: { value: number | null }) => (c.value === null ? UNVALUED_GAIN : c.value + UNVALUED_GAIN * 2);

  /** Tries every way to fill the slots (each player at most once). */
  function bruteForce(slots: string[], cands: (Candidate & { elig: Position[] })[]): number {
    let best = 0;
    const used = new Set<number>();
    const rec = (i: number, total: number) => {
      if (i === slots.length) {
        best = Math.max(best, total);
        return;
      }
      rec(i + 1, total); // leave slot empty
      cands.forEach((c, j) => {
        if (used.has(j) || !c.canFill(slots[i]!)) return;
        used.add(j);
        rec(i + 1, total + gain(c));
        used.delete(j);
      });
    };
    rec(0, 0);
    return best;
  }

  it('matches brute force on 400 small random rosters (FLEX, SUPER_FLEX, multi-eligible and unvalued players)', () => {
    const rand = rng(20261026);
    const SLOT_TYPES = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];
    const ELIG: Position[][] = [['QB'], ['RB'], ['WR'], ['TE'], ['RB', 'WR'], ['WR', 'TE']];
    for (let trial = 0; trial < 400; trial++) {
      const slots = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => SLOT_TYPES[Math.floor(rand() * SLOT_TYPES.length)]!);
      const cands = Array.from({ length: Math.floor(rand() * 8) }, (_, i) => {
        const elig = ELIG[Math.floor(rand() * ELIG.length)]!;
        const value = rand() < 0.15 ? null : Math.round(rand() * 10000);
        return { id: String(i), value, elig, canFill: (slot: string) => slotAccepts(slot, elig) };
      });
      const lineup = bestLineup(slots, cands);
      // Valid: each player at most once, only in slots they're eligible for.
      const ids = lineup.filter(Boolean).map((c) => c!.id);
      expect(new Set(ids).size).toBe(ids.length);
      lineup.forEach((c, i) => c && expect(c.canFill(slots[i]!)).toBe(true));
      // Optimal: same total as brute force.
      const total = lineup.reduce((s, c) => s + (c ? gain(c) : 0), 0);
      expect(total).toBeCloseTo(bruteForce(slots, cands), 6);
    }
  });

  it('beats a greedy top-down fill when FLEX comes first', () => {
    // Greedy would put the RB (10) in FLEX and leave the RB slot empty: 10. Optimal: RB + WR = 18.
    const c = (id: string, value: number, elig: Position[]): Candidate => ({ id, value, canFill: (s) => slotAccepts(s, elig) });
    const lineup = bestLineup(['FLEX', 'RB'], [c('rb', 10, ['RB']), c('wr', 8, ['WR'])]);
    expect(lineup.map((x) => x?.id)).toEqual(['wr', 'rb']);
  });

  it('never prefers an unvalued player over a valued one, but uses them to fill an otherwise empty slot', () => {
    const c = (id: string, value: number | null, elig: Position[]): Candidate => ({ id, value, canFill: (s) => slotAccepts(s, elig) });
    expect(bestLineup(['WR'], [c('unvalued', null, ['WR']), c('cheap', 3, ['WR'])]).map((x) => x?.id)).toEqual(['cheap']);
    expect(bestLineup(['WR', 'WR'], [c('unvalued', null, ['WR']), c('cheap', 3, ['WR'])]).map((x) => x?.id).sort()).toEqual(['cheap', 'unvalued']);
  });

  it('handles no slots and no players', () => {
    expect(maxWeightAssignment([])).toEqual([]);
    expect(bestLineup(['QB', 'FLEX'], [])).toEqual([null, null]);
  });
});

describe('slot rules', () => {
  it('reads FLEX and SUPER_FLEX eligibility, and flags unknown slots', () => {
    expect(slotAccepts('FLEX', ['TE'])).toBe(true);
    expect(slotAccepts('FLEX', ['QB'])).toBe(false);
    expect(slotAccepts('SUPER_FLEX', ['QB'])).toBe(true);
    expect(slotAccepts('IDP_FLEX', ['WR'])).toBe(false); // unknown slots accept nobody, never treated as FLEX
    expect(lineupSlots(['QB', 'FLEX', 'K', 'IDP_FLEX', 'BN', 'BN'])).toEqual({ slots: ['QB', 'FLEX', 'K', 'IDP_FLEX'], unsupported: ['K', 'IDP_FLEX'] });
  });

  it('counts a DB/WR player (e.g. Travis Hunter) as a WR, and kickers as not analyzed', () => {
    const hunter = { position: 'DB', fantasyPositions: ['DB', 'WR'] };
    expect(eligiblePositions(hunter)).toEqual(['WR']);
    expect(countedPosition(hunter)).toBe('WR');
    expect(countedPosition({ position: 'K', fantasyPositions: ['K'] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('positional market value on real leagues (redacted Sleeper + real FantasyCalc)', () => {
  it.each(['A', 'B', 'C', 'D'] as Letter[])('league %s: lineups are valid and positions are ranked consistently', (letter) => {
    const { input, result } = run(letter);
    const r = ok(result);
    const slots = input.league.roster_positions.filter((p) => p !== 'BN');
    expect(r.teams).toHaveLength(input.rosters.filter((x) => x.owner_id).length);
    for (const t of r.teams) {
      const roster = input.rosters.find((x) => x.roster_id === t.rosterId)!;
      const held = new Set([...(roster.reserve ?? []), ...(roster.taxi ?? [])]);
      expect(t.marketLineup.map((e) => e.slot)).toEqual(slots);
      expect(t.sleeperStarters.map((e) => e.player?.id ?? '0')).toEqual(slots.map((_, i) => roster.starters?.[i] ?? '0'));
      const ids = t.marketLineup.flatMap((e) => (e.player ? [e.player.id] : []));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(held.has(id)).toBe(false); // IR / taxi never in the lineup
      for (const e of t.marketLineup) if (e.player) expect(slotAccepts(e.slot, eligiblePositions(azPlayers[e.player.id]!))).toBe(true);
      for (const pos of POS) {
        const p = t.positions[pos];
        expect(p.value).toBe(p.lineupPlayers.reduce((s, x) => s + (x.value ?? 0), 0));
        expect(p.rank).toBe(1 + r.teams.filter((o) => o.positions[pos].value > p.value).length);
        for (const s of p.surplus) expect(s.scaled!).toBeGreaterThanOrEqual(POSITIONAL_RULES.surplusMinScaled);
        expect(p.depth.length).toBeLessThanOrEqual(POSITIONAL_RULES.usefulDepth[pos]);
      }
      expect(t.unvalued.length).toBe((roster.players ?? []).filter((id) => !azValues(letter).has(id)).length);
    }
  });

  it('league A: labels follow the approved thirds (12 teams: 1–4 strong, 5–8 adequate, 9–12 need)', () => {
    const r = ok(run('A').result);
    for (const t of r.teams) {
      for (const pos of POS) {
        const p = t.positions[pos];
        if (p.label === 'withheld') continue;
        if (p.rank > 8) expect(p.label).toBe('need');
        else if (p.label !== 'surplus') expect(p.label).toBe(p.rank <= 4 ? 'strong' : 'adequate');
      }
    }
  });

  it("league A: owner's team (4-2, standard lineup)", () => {
    const me = myTeam(run('A').result, 'A');
    expect(Object.fromEntries(POS.map((p) => [p, `${me.positions[p].label} #${me.positions[p].rank}`]))).toEqual({
      QB: 'strong #2',
      RB: 'adequate #7',
      WR: 'strong #3',
      TE: 'adequate #7',
    });
    expect(me.needs).toEqual([]);
    expect(me.marketLineup.find((e) => e.slot === 'QB')!.player!.name).toBe('Caleb Williams');
    // Tidy display: the most valuable WR sits in a WR slot, not FLEX.
    expect(me.marketLineup.filter((e) => e.slot === 'WR').map((e) => e.player!.name)).toContain("Ja'Marr Chase");
    expect(me.stashed.ir.length).toBeGreaterThan(0);
  });

  it('league D (10 teams) uses the 10-team values and thirds (7–10 need)', () => {
    const r = ok(run('D').result);
    expect(r.activeTeams).toBe(10);
    for (const t of r.teams) for (const pos of POS) if (t.positions[pos].rank > 20 / 3 && t.positions[pos].label !== 'withheld') expect(t.positions[pos].label).toBe('need');
    expect(myTeam(r, 'D').positions.QB.surplus.map((p) => p.name)).toEqual(expect.arrayContaining(['Aaron Rodgers']));
  });

  it('overview lists the 3 strongest and 3 thinnest teams per position', () => {
    const r = ok(run('A').result);
    for (const pos of POS) {
      const byRank = [...r.teams].sort((a, b) => a.positions[pos].rank - b.positions[pos].rank || a.rosterId - b.rosterId);
      expect(r.overview[pos].strongest).toEqual(byRank.slice(0, 3).map((t) => t.rosterId));
      expect(r.overview[pos].thinnest).toEqual(byRank.slice(-3).reverse().map((t) => t.rosterId));
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('when the analysis is withheld', () => {
  it.each([
    ['K', ['K']],
    ['IDP_FLEX', ['IDP_FLEX']],
  ])('an unsupported %s slot withholds the whole analysis (never treated as FLEX)', (slot, expected) => {
    const { result } = run('A', (d) => d.league.roster_positions.splice(1, 0, slot));
    expect(result).toMatchObject({ status: 'unavailable', unsupportedSlots: expected });
    expect(result.status === 'unavailable' && result.reason).toMatch(/doesn't support/);
  });

  it.each([
    [0, 'redraft'],
    [1, 'keeper'],
  ])('league type %s (%s) is not analyzed: dynasty only', (type) => {
    const { result } = run('A', (d) => (d.league.settings.type = type));
    expect(result).toMatchObject({ status: 'unavailable', reason: 'Positional market-value analysis is available for dynasty leagues only.' });
  });

  it('no FantasyCalc values for the format', () => {
    const input = azInput('A');
    expect(analyzePositions({ league: input.league, rosters: input.rosters, players: azPlayers, values: null, valuesMissingReason: 'No values yet.' })).toMatchObject({
      status: 'unavailable',
      reason: 'No values yet.',
    });
  });
});

describe('roster groups and edge cases (derived from real league A)', () => {
  const ownerRoster = (d: ReturnType<typeof azLeague>) => d.rosters.find((r) => r.owner_id === AZ_OWNER)!;

  it('IR and taxi players never fill lineup slots; they are listed as stashed assets', () => {
    const base = myTeam(run('A').result, 'A');
    const top = base.marketLineup.filter((e) => e.player).sort((a, b) => b.player!.value! - a.player!.value!)[0]!.player!;
    const { result } = run('A', (d) => {
      const r = ownerRoster(d);
      r.reserve = [...(r.reserve ?? []), top.id];
    });
    const me = myTeam(result, 'A');
    expect(me.marketLineup.some((e) => e.player?.id === top.id)).toBe(false);
    expect(me.stashed.ir.map((p) => p.id)).toContain(top.id);
    expect(me.lineupValue).toBeLessThan(base.lineupValue);
  });

  it('a short roster leaves slots empty without crashing', () => {
    const { result } = run('A', (d) => {
      const r = ownerRoster(d);
      r.players = r.players!.slice(0, 4);
      r.reserve = [];
      r.taxi = [];
    });
    const me = myTeam(result, 'A');
    expect(me.marketLineup.filter((e) => e.player === null).length).toBeGreaterThanOrEqual(6);
    expect(me.bench).toEqual([]);
  });

  it('abandoned rosters are excluded and not ranked', () => {
    const { result } = run('A', (d) => (d.rosters.find((r) => r.owner_id !== AZ_OWNER)!.owner_id = null));
    const r = ok(result);
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0]!.reason).toMatch(/abandoned/);
    expect(r.activeTeams).toBe(11);
    expect(Math.max(...r.teams.map((t) => t.positions.QB.rank))).toBeLessThanOrEqual(11);
  });

  it('injury status is a note only: no value penalty, same lineup', () => {
    const base = myTeam(run('A').result, 'A');
    const star = base.marketLineup.find((e) => e.slot === 'QB')!.player!;
    const injured = structuredClone(azPlayers);
    injured[star.id] = { ...injured[star.id]!, injuryStatus: 'Out' };
    const me = myTeam(run('A', undefined, injured).result, 'A');
    expect(me.marketLineup).toEqual(base.marketLineup.map((e) => (e.player?.id === star.id ? { ...e, player: { ...e.player, injury: 'Out' } } : e)));
    expect(me.positions.QB.value).toBe(base.positions.QB.value);
    expect(me.injuries.map((p) => p.id)).toContain(star.id);
  });

  it('a DB/WR-eligible player can fill WR, FLEX and SUPER_FLEX and counts as WR; a kicker is not analyzed', () => {
    const base = myTeam(run('A').result, 'A');
    const wr = base.marketLineup.find((e) => e.slot === 'WR')!.player!;
    const players = structuredClone(azPlayers);
    players[wr.id] = { ...players[wr.id]!, position: 'DB', fantasyPositions: ['DB', 'WR'] };
    const me = myTeam(run('A', undefined, players).result, 'A');
    const entry = me.marketLineup.find((e) => e.player?.id === wr.id)!;
    expect(['WR', 'FLEX', 'SUPER_FLEX']).toContain(entry.slot);
    expect(entry.player!.position).toBe('WR');

    const withK = structuredClone(azPlayers);
    const benchId = base.bench[0]!.id;
    withK[benchId] = { ...withK[benchId]!, position: 'K', fantasyPositions: ['K'] };
    const meK = myTeam(run('A', undefined, withK).result, 'A');
    expect(meK.notAnalyzed.map((p) => p.id)).toEqual([benchId]);
    expect(meK.marketLineup.some((e) => e.player?.id === benchId)).toBe(false);
  });

  it('unvalued players are counted, excluded from totals (never zero), and can withhold or lower confidence', () => {
    const base = myTeam(run('A').result, 'A');
    const values = azValues('A');
    // 1. Adding an unvalued bench WR changes no totals, but is counted.
    const input = azInput('A', (d) => ownerRoster(d).players!.push('99999901'));
    const players = { ...azPlayers, '99999901': { id: '99999901', name: 'Unvalued Rookie', position: 'WR', team: 'NYJ', fantasyPositions: ['WR'], status: null, injuryStatus: null, age: 21 } };
    const r1 = ok(analyzePositions({ league: input.league, rosters: input.rosters, players, values }));
    const me1 = r1.teams.find((t) => t.rosterId === ownerRosterId('A'))!;
    expect(me1.positions.WR.value).toBe(base.positions.WR.value);
    expect(me1.unvalued.map((p) => p.name)).toContain('Unvalued Rookie');
    expect(me1.positions.WR.unvaluedCount).toBe(base.positions.WR.unvaluedCount + 1);

    // 2. If Sleeper starts a player with no value at a position, that position's label is withheld.
    const qb = base.sleeperStarters.find((e) => e.slot === 'QB')!.player!;
    const noQbValue = new Map(values);
    noQbValue.delete(qb.id);
    const inputA = azInput('A');
    const r2 = ok(analyzePositions({ league: inputA.league, rosters: inputA.rosters, players: azPlayers, values: noQbValue }));
    const me2 = r2.teams.find((t) => t.rosterId === ownerRosterId('A'))!;
    expect(me2.positions.QB.label).toBe('withheld');
    expect(me2.positions.QB.note).toMatch(/starts in Sleeper but has no FantasyCalc value/);

    // 3. More than a third of active TEs unvalued → low confidence (add 3 unvalued bench TEs).
    const extra = ['99999911', '99999912', '99999913'];
    const input3 = azInput('A', (d) => ownerRoster(d).players!.push(...extra));
    const players3: PlayerIndex = { ...azPlayers };
    for (const id of extra) players3[id] = { id, name: `Unvalued TE ${id}`, position: 'TE', team: null, fantasyPositions: ['TE'], status: null, injuryStatus: null, age: 23 };
    const r3 = ok(analyzePositions({ league: input3.league, rosters: input3.rosters, players: players3, values }));
    const te = r3.teams.find((t) => t.rosterId === ownerRosterId('A'))!.positions.TE;
    expect(te.unvaluedCount).toBe(base.positions.TE.unvaluedCount + 3);
    expect(te.unvaluedCount / te.activeCount).toBeGreaterThan(1 / 3);
    expect(te).toMatchObject({ lowConfidence: true, note: `Low confidence: ${te.unvaluedCount} of ${te.activeCount} active TEs have no FantasyCalc value.` });
    expect(te.value).toBe(base.positions.TE.value);
  });

  it('surplus: a bench player beyond useful depth worth 10+ on the 0–100 scale; never on a need', () => {
    const r = ok(run('D').result);
    const me = myTeam(r, 'D');
    expect(me.positions.QB.label).toBe('surplus');
    expect(me.surpluses).toContain('QB');
    expect(me.positions.QB.depth).toHaveLength(1);
    for (const t of r.teams) for (const pos of POS) if (t.positions[pos].label === 'need') expect(t.surpluses).not.toContain(pos);
  });

  it('positional results do not depend on how many games have been played', () => {
    const early = run('A', (d) => setWeeksPlayed(d.rosters, 1)).result;
    const late = run('A', (d) => setWeeksPlayed(d.rosters, 13)).result;
    expect(early).toEqual(run('A').result);
    expect(late).toEqual(run('A').result);
  });
});

// ---------------------------------------------------------------------------------------------
describe('"what to look for" (uses the unchanged stance)', () => {
  const team = (needs: Position[], surpluses: Position[]): TeamPositional => {
    const me = structuredClone(myTeam(run('A').result, 'A'));
    me.needs = needs;
    me.surpluses = surpluses;
    for (const p of surpluses) me.positions[p].surplus = [{ id: 'x', name: 'Spare Player', position: p, sleeperPosition: p, team: null, value: 1500, scaled: 14, injury: null }];
    return me;
  };
  const pos = ok(run('A').result);
  const stance = (s: Partial<StanceResult> & { kind: StanceResult['kind'] }) => s as StanceResult;

  it('Buy: points at the needs and offers the surplus', () => {
    const l = lookFor(stance({ kind: 'recommendation', stance: 'buy' }), pos, team(['RB'], ['WR']));
    expect(l.lines).toEqual([
      expect.stringMatching(/^Top needs: RB \(#7 of 12 in market value\)\.$/),
      'Top surpluses: WR (Spare Player 1,500).',
      'Buying: look to add market value at RB; your surplus at WR is what you could offer.',
    ]);
  });

  it('Sell and Hold reference the surplus; low confidence shows the leaning', () => {
    expect(lookFor(stance({ kind: 'recommendation', stance: 'sell' }), pos, team([], ['WR'])).lines.at(-1)).toBe('Selling: your surplus at WR is the clearest market value to move.');
    expect(lookFor(stance({ kind: 'recommendation', stance: 'hold' }), pos, team(['TE'], ['QB'])).lines.at(-1)).toBe('Holding: if you do trade, your surplus at QB could address TE.');
    expect(lookFor(stance({ kind: 'insufficient', leaning: 'buy' }), pos, team(['RB'], [])).lines.at(-1)).toMatch(/^Your stance isn't confident yet \(leaning buy\)\. If you act on it: buying: look to add market value at RB\.$/);
  });

  it('says so when the data is too thin', () => {
    expect(lookFor(stance({ kind: 'recommendation', stance: 'buy' }), { status: 'unavailable', reason: 'x', unsupportedSlots: [] }, null)).toEqual({ available: false, lines: ['Not enough data to say: x'] });
    expect(lookFor(stance({ kind: 'unavailable' }), pos, team([], [])).lines).toEqual([
      'No position stands out: your market value ranks in the middle or better everywhere, with no surplus.',
      'No stance right now, so these are market-value notes only.',
    ]);
  });

  it('summary line for tier cards', () => {
    expect(positionalSummary(team(['RB', 'TE'], ['WR']))).toBe('thin at RB, TE · surplus at WR');
    expect(positionalSummary(team([], []))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('tier isolation: Stage 4 changes no tier, confidence or stance output', () => {
  const baseline = JSON.parse(readFileSync('tests/fixtures/analyzer/tier-baseline.json', 'utf8')) as Record<string, unknown>;
  it.each(['A', 'B', 'C', 'D'] as Letter[])('league %s matches the pre-Stage-4 baseline', (letter) => {
    const input = azInput(letter);
    const a = analyzeLeague(input);
    analyzePositions({ league: input.league, rosters: input.rosters, players: azPlayers, values: azValues(letter) }); // running it must not affect tiers
    const s = recommendStance(a, findOwnerRoster(input.rosters, AZ_OWNER));
    expect({
      teams: a.teams!.map((t) => ({ rosterId: t.rosterId, tier: t.tier, confidence: t.confidence, reason: t.reason, details: t.details })),
      excluded: a.excluded.map((e) => ({ rosterId: e.rosterId, reason: e.reason })),
      stance: { kind: s.kind, headline: s.headline, reasons: s.reasons, stance: 'stance' in s ? s.stance : null, leaning: 'leaning' in s ? s.leaning : null },
    }).toEqual(baseline[letter]);
  });
});
