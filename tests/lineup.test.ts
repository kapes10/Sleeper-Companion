// Stage 6 lineup manager: pure logic, local state, cache timing and regression.
// Fixtures: REDACTED real data from four of the owner's leagues (tests/fixtures/analyzer).
// A and D are standard-lineup leagues, B and C best ball. Anything marked "modified" is a
// changed copy of real data, made for a case not seen live.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SleeperNflState, SleeperRoster } from '../src/api/types';
import type { PlayerIndex } from '../src/domain/players';
import { createClient } from '../src/api/client';
import { createServices } from '../src/services';
import { memoryStore } from '../src/storage/idb';
import {
  confirmProposal,
  eligibleReplacements,
  injuryNote,
  LOCK_CAVEAT,
  placementOf,
  rosterIssues,
  scanLeague,
  sortName,
  weekNotes,
  lineupSlotList,
  type LeagueType,
} from '../src/analysis/lineup/placement';
import { searchPlayers } from '../src/analysis/lineup/search';
import { applyRead, checkItem, latestCheckText, markDone, newItem, recordFailure, recordOpened, type FreshRead, type LineupItem } from '../src/analysis/lineup/verify';
import { addItems, leagueTypeOf, loadItems, loadLeagueTypes, saveItems, saveLeagueTypes } from '../src/storage/lineup';
import { SleeperApiError } from '../src/api/client';
import { matchPartners } from '../src/analysis/partners';
import { AZ_OWNER, azLeague, azPartnerInput, azPlayers, type Letter } from './analyzerHelpers';

const STATE = JSON.parse(readFileSync('tests/fixtures/analyzer/nfl_state.json', 'utf8')) as SleeperNflState;
const pid = (name: string) => Object.values(azPlayers).find((p) => p.name === name)!.id;
const COUSINS = pid('Kirk Cousins');
const CALEB = pid('Caleb Williams');
const ADAMS = pid('Davante Adams');
const mine = (rosters: SleeperRoster[]) => rosters.find((r) => r.owner_id === AZ_OWNER)!;
const d = (l: Letter) => structuredClone(azLeague(l));
const scan = (l: Letter, playerId: string, type: LeagueType = 'managed', change?: (x: ReturnType<typeof d>) => void, players: PlayerIndex = azPlayers) => {
  const x = d(l);
  change?.(x);
  return scanLeague({ league: x.league, rosters: x.rosters, ownerId: AZ_OWNER, players, playerId, leagueType: type, state: STATE });
};
const names = (ids: { name: string }[]) => ids.map((c) => c.name);

// ---------------------------------------------------------------------------------------------
describe('search', () => {
  it('finds players by any part of the name, ignoring case, accents and punctuation', () => {
    expect(names(searchPlayers(azPlayers, 'kirk cous', new Set()))).toEqual(['Kirk Cousins']);
    expect(names(searchPlayers(azPlayers, 'JAMARR', new Set()))).toContain("Ja'Marr Chase");
    expect(searchPlayers(azPlayers, 'k', new Set())).toEqual([]); // too short
  });

  it('keeps players with the same name separate (the screen shows team and position)', () => {
    const p: PlayerIndex = {
      ...azPlayers,
      x1: { id: 'x1', name: 'Kyle Williams', position: 'WR', team: 'NE', fantasyPositions: ['WR'], status: null, injuryStatus: null, age: 23, depthChartOrder: 2 },
      x2: { id: 'x2', name: 'Kyle Williams', position: 'QB', team: null, fantasyPositions: ['QB'], status: null, injuryStatus: 'IR', age: 30, depthChartOrder: null },
    };
    const r = searchPlayers(p, 'kyle williams', new Set());
    // The fixture already has one real Kyle Williams; all three stay separate entries.
    expect(r.map((x) => x.id)).toEqual([pid('Kyle Williams'), 'x1', 'x2']);
    expect(r.map((x) => `${x.position} ${x.team}`)).toContain('QB null');
  });

  it('only lists QB/RB/WR/TE unless the player is on one of your rosters', () => {
    const p: PlayerIndex = { k1: { id: 'k1', name: 'Kick Erson', position: 'K', team: 'X', fantasyPositions: ['K'], status: null, injuryStatus: null, age: 30, depthChartOrder: 1 } };
    expect(searchPlayers(p, 'kick', new Set())).toEqual([]);
    expect(searchPlayers(p, 'kick', new Set(['k1']))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('placement (roster data only)', () => {
  it('reads starting slot, bench, reserve and taxi from the real rosters', () => {
    const a = d('A');
    const slots = lineupSlotList(a.league);
    expect(placementOf(mine(a.rosters), slots, COUSINS)).toEqual({ kind: 'starting', slot: 'QB', slotIndex: 0 });
    expect(placementOf(mine(a.rosters), slots, ADAMS)).toEqual({ kind: 'reserve' });
    const dd = d('D');
    expect(placementOf(mine(dd.rosters), lineupSlotList(dd.league), COUSINS)).toEqual({ kind: 'bench' });
    expect(placementOf(mine(dd.rosters), lineupSlotList(dd.league), ADAMS)).toEqual({ kind: 'taxi' });
    expect(placementOf(mine(dd.rosters), lineupSlotList(dd.league), 'not-a-player')).toBeNull();
  });

  it('every real fixture roster is consistent', () => {
    for (const l of ['A', 'B', 'C', 'D'] as Letter[]) {
      const x = d(l);
      expect(rosterIssues(mine(x.rosters), lineupSlotList(x.league), azPlayers)).toEqual([]);
    }
  });

  it('flags inconsistent roster data (modified copies)', () => {
    const a = d('A');
    const slots = lineupSlotList(a.league);
    const r = mine(a.rosters);
    expect(rosterIssues({ ...r, starters: r.starters!.slice(1) }, slots, azPlayers)[0]).toMatch(/9 starters, but the league has 10/);
    expect(rosterIssues({ ...r, starters: ['999999', ...r.starters!.slice(1)] }, slots, azPlayers)[0]).toMatch(/isn't on the roster's player list/);
    expect(rosterIssues({ ...r, players: [...r.players!, '999999'], starters: ['999999', ...r.starters!.slice(1)] }, slots, azPlayers)[0]).toMatch(/isn't in Sleeper's player list/);
    expect(rosterIssues({ ...r, reserve: [...r.reserve!, COUSINS] }, slots, azPlayers)[0]).toMatch(/also listed on reserve or taxi/);
    expect(rosterIssues({ ...r, starters: [COUSINS, COUSINS, ...r.starters!.slice(2)] }, slots, azPlayers)[0]).toMatch(/two lineup slots/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('eligible replacements (supported slot rules only; never ranked)', () => {
  const a = d('A');
  const r = mine(a.rosters);

  it('QB takes QBs only', () => expect(names(eligibleReplacements(r, 'QB', azPlayers))).toEqual(['Caleb Williams']));
  it('RB, WR and TE take their own position', () => {
    expect(names(eligibleReplacements(r, 'RB', azPlayers))).toEqual(['J.K. Dobbins', 'Keaton Mitchell', 'Rachaad White']);
    expect(names(eligibleReplacements(r, 'WR', azPlayers))).toEqual(['Keenan Allen', 'Christian Kirk', 'Luke McCaffrey', 'Terry McLaurin', 'Rashee Rice', 'Roman Wilson']);
    expect(names(eligibleReplacements(r, 'TE', azPlayers))).toEqual(['Erick All Jr.']);
  });
  it('FLEX takes RB/WR/TE (no QB); SUPER_FLEX also takes QBs; grouped QB, RB, WR, TE then by last name', () => {
    const flex = eligibleReplacements(r, 'FLEX', azPlayers);
    expect(flex.map((c) => c.position)).not.toContain('QB');
    expect(names(flex)).toEqual(['J.K. Dobbins', 'Keaton Mitchell', 'Rachaad White', 'Keenan Allen', 'Christian Kirk', 'Luke McCaffrey', 'Terry McLaurin', 'Rashee Rice', 'Roman Wilson', 'Erick All Jr.']);
    expect(names(eligibleReplacements(r, 'SUPER_FLEX', azPlayers))[0]).toBe('Caleb Williams');
  });
  it('reserve and taxi players are never candidates', () => {
    const all = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'].flatMap((s) => eligibleReplacements(r, s, azPlayers).map((c) => c.id));
    for (const id of [...r.reserve!, ...r.taxi!]) expect(all).not.toContain(id);
  });
  it('unsupported slot types get no candidates (never treated as FLEX)', () => expect(eligibleReplacements(r, 'REC_FLEX', azPlayers)).toEqual([]));
  it('order does not depend on roster order or on value', () => {
    const shuffled = { ...r, players: [...r.players!].reverse() };
    expect(eligibleReplacements(shuffled, 'FLEX', azPlayers)).toEqual(eligibleReplacements(r, 'FLEX', azPlayers));
  });
  it('last-name order ignores suffixes', () => {
    expect(sortName('Erick All Jr.')).toBe('all erick');
    expect(sortName('Marvin Harrison Jr.')).toBe('harrison marvin');
  });
  it('injury labels are notes only (an IR label is not reserve placement)', () => {
    expect(injuryNote({ injuryStatus: 'IR' })).toMatch(/note only; he's on your bench, not your reserve list/);
    expect(injuryNote({ injuryStatus: 'Questionable' })).toBe('Sleeper injury status: Questionable (a note only).');
    expect(injuryNote({ injuryStatus: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('findings per league (worked example: Kirk Cousins)', () => {
  it('Managed, starting: bench option available with the lock/bye caveat', () => {
    const row = scan('A', COUSINS)!;
    expect(row.placement).toEqual({ kind: 'starting', slot: 'QB', slotIndex: 0 });
    expect(row.finding).toMatchObject({ kind: 'available', slot: 'QB', check: LOCK_CAVEAT });
    expect(names((row.finding as { candidates: { name: string }[] }).candidates)).toEqual(['Caleb Williams']);
    expect(row.finding.reason).toMatch(/under this app's slot rules\. Listed by position and name, not ranked\./);
  });

  it('Managed, no bench QB (modified copy): "No bench option", a valid result with the slot and reason', () => {
    const row = scan('A', COUSINS, 'managed', (x) => {
      const r = mine(x.rosters);
      r.players = r.players!.filter((p) => p !== CALEB);
    })!;
    expect(row.finding.kind).toBe('none');
    expect(row.finding.reason).toMatch(/Nobody on your bench can fill QB under this app's slot rules \(QB takes QB/);
    expect(row.finding.check).toMatch(/free agents/);
  });

  it('Managed, on the bench / reserve / taxi: information only', () => {
    expect(scan('D', COUSINS)!.finding).toMatchObject({ kind: 'info', code: 'bench' });
    expect(scan('A', ADAMS)!.finding).toMatchObject({ kind: 'info', code: 'reserve' });
    expect(scan('D', ADAMS)!.finding).toMatchObject({ kind: 'info', code: 'taxi' });
  });

  it('Best ball and Unknown leagues: information only, even when he starts', () => {
    const bb = scan('A', COUSINS, 'bestball')!;
    expect(bb.finding).toMatchObject({ kind: 'info', code: 'bestball' });
    expect(bb.finding.reason).toMatch(/generally set automatically/);
    expect(scan('A', COUSINS, 'unknown')!.finding).toMatchObject({ kind: 'info', code: 'unknown_type' });
    expect(scan('C', COUSINS, 'bestball')!.placement).toEqual({ kind: 'bench' });
  });

  it('unsupported slot (modified copy with REC_FLEX): Can\'t tell, no proposal', () => {
    const row = scan('A', COUSINS, 'managed', (x) => {
      x.league.roster_positions[0] = 'REC_FLEX';
    })!;
    expect(row.finding).toMatchObject({ kind: 'uncertain', code: 'unsupported_slot' });
    expect(row.finding.reason).toMatch(/REC_FLEX slot, a slot type this app doesn't support/);
  });

  it('ambiguous ownership (modified: owner also co-owns another roster holding him): Can\'t tell', () => {
    const row = scan('A', COUSINS, 'managed', (x) => {
      const other = x.rosters.find((r) => r.owner_id !== AZ_OWNER)!;
      other.co_owners = [AZ_OWNER];
    })!;
    expect(row).toMatchObject({ placement: null, finding: { kind: 'uncertain', code: 'ambiguous' } });
  });

  it('inconsistent roster data: Can\'t tell, never a guess', () => {
    const row = scan('A', COUSINS, 'managed', (x) => {
      const r = mine(x.rosters);
      r.starters = r.starters!.slice(1);
    })!;
    expect(row).toMatchObject({ placement: null, finding: { kind: 'uncertain', code: 'inconsistent' } });
  });

  it('a player you don\'t roster gives no row', () => expect(scan('B', COUSINS)).toBeNull());

  it('abandoned rosters (no owner) are never treated as yours', () => {
    expect(
      scan('A', COUSINS, 'managed', (x) => {
        mine(x.rosters).owner_id = null;
      }),
    ).toBeNull();
  });

  it('season complete or draft not finished: information only', () => {
    expect(scan('A', COUSINS, 'managed', (x) => void (x.league.status = 'complete'))!.finding).toMatchObject({ kind: 'info', code: 'league_complete' });
    expect(scan('A', COUSINS, 'managed', (x) => void (x.league.status = 'drafting'))!.finding).toMatchObject({ kind: 'info', code: 'league_drafting' });
  });

  it('playoff, preseason and offseason weeks add a note, never a status', () => {
    const lg = d('A').league;
    expect(weekNotes(lg, { ...STATE, week: 15 })[0]).toMatch(/playoff week in this league/);
    expect(weekNotes(lg, STATE)).toEqual([]);
    expect(weekNotes(lg, { ...STATE, season_type: 'pre' })[0]).toMatch(/preseason/);
    expect(weekNotes(lg, { ...STATE, season_type: 'off' })[0]).toMatch(/offseason/);
  });

  it('findings never mention values, projections, rankings or advice', () => {
    const text = JSON.stringify([scan('A', COUSINS), scan('A', pid('Braelon Allen')), scan('D', pid('Aaron Rodgers'))]).toLowerCase();
    expect(text).not.toMatch(/fantasycalc|projection|projected|should start|best option|recommend|value/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('saved plans and verification', () => {
  function plan(opts: { player?: string; repl?: string } = {}) {
    const x = d('A');
    const out = opts.player ?? COUSINS;
    const rep = opts.repl ?? CALEB;
    const row = scanLeague({ league: x.league, rosters: x.rosters, ownerId: AZ_OWNER, players: azPlayers, playerId: out, leagueType: 'managed', state: STATE })!;
    const f = row.finding as { slot: string; slotIndex: number };
    return newItem({
      league: x.league,
      roster: mine(x.rosters),
      state: STATE,
      outgoing: { id: out, name: azPlayers[out]!.name },
      replacement: { id: rep, name: azPlayers[rep]!.name },
      slot: f.slot,
      slotIndex: f.slotIndex,
      receivedAt: 1000,
      now: 1000,
      finding: { kind: row.finding.kind, reason: row.finding.reason },
    });
  }
  function read(change?: (x: ReturnType<typeof d>) => void, state: SleeperNflState = STATE): FreshRead {
    const x = d('A');
    change?.(x);
    return { state, league: x.league, rosters: x.rosters, ownerId: AZ_OWNER, players: azPlayers, receivedAt: 5000 };
  }
  const swap = (r: SleeperRoster, outId: string, inId: string) => {
    r.starters = r.starters!.map((s) => (s === outId ? inId : s));
  };
  const upd = (o: ReturnType<typeof applyRead>) => {
    expect(o.kind).toBe('updated');
    return o.item;
  };

  it('a new plan saves the full context and starts Pending, not checked', () => {
    const i = plan();
    expect(i).toMatchObject({ key: `${d('A').league.league_id}:${COUSINS}:2026:regular:7`, season: '2026', week: 7, seasonType: 'regular', slot: 'QB', slotIndex: 0, workflow: 'pending', latestCheck: { kind: 'none' } });
    expect(i.baseline).toEqual(mine(d('A').rosters).starters);
    expect(i.slotLayout).toEqual(lineupSlotList(d('A').league));
    expect(latestCheckText(i.latestCheck, String)).toBe('Not checked yet.');
  });

  it('a failed fetch never changes the workflow state or the baseline', () => {
    for (const wf of ['pending', 'done_unverified', 'changed'] as const) {
      const i = { ...plan(), workflow: wf };
      const f = recordFailure(i, new SleeperApiError('network', 'x'), 9000);
      expect(f.workflow).toBe(wf);
      expect(f.baseline).toEqual(i.baseline);
      expect(f.latestCheck).toEqual({ kind: 'failed', at: 9000, error: 'network' });
      expect(latestCheckText(f.latestCheck, String)).toBe("Check failed at 9000: couldn't reach Sleeper. Your saved status hasn't changed.");
    }
    expect(recordFailure(plan(), new SleeperApiError('rate_limited', 'x', 429), 1).latestCheck).toMatchObject({ error: 'rate_limited' });
  });

  it('an unchanged read stays Pending (it does not prove Sleeper ignored a change)', () => {
    const i = upd(applyRead(plan(), read()));
    expect(i.workflow).toBe('pending');
    expect(i.latestCheck).toEqual({ kind: 'ok', receivedAt: 5000 });
    expect(i.note).toBeNull();
  });

  it('changes only in unrelated slots stay Pending, with a note describing them', () => {
    const i = upd(applyRead(plan(), read((x) => swap(mine(x.rosters), pid('Braelon Allen'), pid('J.K. Dobbins')))));
    expect(i.workflow).toBe('pending');
    expect(i.note).toMatch(/Kirk Cousins still starts at QB\. Other slots changed since you saved this: FLEX \(lineup slot 9\) now J\.K\. Dobbins/);
  });

  it('Verified as proposed: the replacement is in the intended slot and the outgoing player is not starting', () => {
    const i = upd(applyRead(plan(), read((x) => swap(mine(x.rosters), COUSINS, CALEB))));
    expect(i.workflow).toBe('verified');
    expect(i.workflowReason).toBe("Sleeper's data shows Caleb Williams at QB and Kirk Cousins not starting.");
  });

  it('either FLEX slot counts as the intended slot', () => {
    const allen = pid('Braelon Allen');
    const dobbins = pid('J.K. Dobbins');
    const schultz = pid('Dalton Schultz');
    const i = plan({ player: allen, repl: dobbins }); // Allen in FLEX slot 9
    const r = upd(
      applyRead(
        i,
        read((x) => {
          const m = mine(x.rosters);
          m.starters = m.starters!.map((s) => (s === schultz ? dobbins : s === allen ? schultz : s)); // Dobbins into FLEX slot 8
        }),
      ),
    );
    expect(r.workflow).toBe('verified');
  });

  it('Changed, not as proposed: outgoing not starting but a different player in the slot, with the facts Sleeper returned', () => {
    const purdy = pid('Brock Purdy');
    const i = upd(
      applyRead(
        plan(),
        read((x) => {
          const m = mine(x.rosters);
          m.starters = m.starters!.map((s) => (s === COUSINS ? purdy : s === purdy ? CALEB : s)); // Purdy to QB, Caleb to SF
        }),
      ),
    );
    expect(i.workflow).toBe('changed');
    expect(i.workflowReason).toMatch(/^Kirk Cousins isn't starting, but Caleb Williams isn't at QB\./);
    expect(i.facts).toEqual(['Kirk Cousins: On your bench.', 'Caleb Williams: Starting at SUPER_FLEX (SF) (lineup slot 10).', 'QB (lineup slot 1): Brock Purdy.']);
  });

  it('Changed, not as proposed: outgoing still starts but in a different slot type', () => {
    const purdy = pid('Brock Purdy');
    const i = upd(
      applyRead(
        plan(),
        read((x) => {
          const m = mine(x.rosters);
          m.starters = m.starters!.map((s) => (s === COUSINS ? CALEB : s === purdy ? COUSINS : s));
        }),
      ),
    );
    expect(i.workflow).toBe('changed');
    expect(i.workflowReason).toMatch(/Kirk Cousins is still starting, but now at SUPER_FLEX \(SF\)/);
  });

  it('Expired: dropped or traded players, replacement moved to reserve/taxi', () => {
    expect(upd(applyRead(plan(), read((x) => void (mine(x.rosters).players = mine(x.rosters).players!.filter((p) => p !== COUSINS)))))).toMatchObject({ workflow: 'expired', workflowReason: 'Kirk Cousins is no longer on your roster.' });
    expect(upd(applyRead(plan(), read((x) => void (mine(x.rosters).players = mine(x.rosters).players!.filter((p) => p !== CALEB)))))).toMatchObject({ workflow: 'expired', workflowReason: 'Caleb Williams is no longer on your roster.' });
    expect(upd(applyRead(plan(), read((x) => void (mine(x.rosters).taxi = [...mine(x.rosters).taxi!, CALEB]))))).toMatchObject({ workflow: 'expired' });
    expect(upd(applyRead(plan(), read((x) => void (mine(x.rosters).reserve = [...mine(x.rosters).reserve!, CALEB]))))).toMatchObject({ workflow: 'expired' });
  });

  it('Expired: new week, new season or season type, changed slot layout, or ownership change', () => {
    expect(upd(applyRead(plan(), read(undefined, { ...STATE, week: 8 })))).toMatchObject({ workflow: 'expired', workflowReason: expect.stringMatching(/This was for week 7 \(2026 regular\); Sleeper now shows week 8/) });
    expect(upd(applyRead(plan(), read(undefined, { ...STATE, season: '2027' }))).workflow).toBe('expired');
    expect(upd(applyRead(plan(), read(undefined, { ...STATE, season_type: 'post' }))).workflow).toBe('expired');
    expect(upd(applyRead(plan(), read((x) => void x.league.roster_positions.splice(1, 0, 'RB')))).workflowReason).toMatch(/lineup slots changed/);
    expect(upd(applyRead(plan(), read((x) => void (mine(x.rosters).owner_id = 'someone-else')))).workflow).toBe('expired');
  });

  it('inconsistent roster data: Can\'t tell, workflow unchanged', () => {
    const o = applyRead(plan(), read((x) => void (mine(x.rosters).starters = mine(x.rosters).starters!.slice(1))));
    expect(o.kind).toBe('uncertain');
    expect(o.item.workflow).toBe('pending');
    const c = checkItem(plan(), read((x) => void (mine(x.rosters).starters = mine(x.rosters).starters!.slice(1))), 'managed');
    expect(c.finding).toMatchObject({ kind: 'uncertain' });
  });

  it('Marked done stays labeled unverified on an unchanged read, and verifies on a confirming read', () => {
    const done = markDone(plan(), 2000);
    expect(done).toMatchObject({ workflow: 'done_unverified', doneMarkedAt: 2000 });
    const same = upd(applyRead(done, read()));
    expect(same.workflow).toBe('done_unverified');
    expect(same.workflowReason).toMatch(/Sleeper's data may lag/);
    expect(upd(applyRead(done, read((x) => swap(mine(x.rosters), COUSINS, CALEB)))).workflow).toBe('verified');
  });

  it('opening Sleeper records a time only and never changes any status', () => {
    const i = plan();
    const o = recordOpened(i, 3000);
    expect(o).toEqual({ ...i, openedAt: 3000 });
  });

  it('Verified and Expired are final: later reads only update the check time', () => {
    const v = upd(applyRead(plan(), read((x) => swap(mine(x.rosters), COUSINS, CALEB))));
    const again = upd(applyRead(v, read()));
    expect(again.workflow).toBe('verified');
  });

  it('checkItem adds the finding from the same read', () => {
    const v = checkItem(plan(), read((x) => swap(mine(x.rosters), COUSINS, CALEB)), 'managed');
    expect(v.workflow).toBe('verified');
    expect(v.finding).toMatchObject({ kind: 'info', reason: expect.stringMatching(/on your bench/) });
  });

  it('review step: keeps a proposal only if the fresh read still matches', () => {
    const fresh = (change?: (x: ReturnType<typeof d>) => void) => scan('A', COUSINS, 'managed', change);
    expect(confirmProposal(fresh(), { slot: 'QB', slotIndex: 0 }, CALEB, 'Kirk Cousins')).toMatchObject({ ok: true, candidate: { id: CALEB } });
    expect(confirmProposal(fresh((x) => swap(mine(x.rosters), COUSINS, CALEB)), { slot: 'QB', slotIndex: 0 }, CALEB, 'Kirk Cousins')).toMatchObject({ ok: false, reason: expect.stringMatching(/latest data changed/) });
    expect(confirmProposal(fresh(), { slot: 'QB', slotIndex: 0 }, 'gone', 'Kirk Cousins')).toMatchObject({ ok: false, reason: expect.stringMatching(/no longer eligible/) });
    expect(confirmProposal(null, { slot: 'QB', slotIndex: 0 }, CALEB, 'Kirk Cousins')).toMatchObject({ ok: false, reason: 'Kirk Cousins is no longer on your roster in this league.' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('local state (this device only)', () => {
  it('league types default to Unknown and save per league', () => {
    localStorage.clear();
    expect(leagueTypeOf(loadLeagueTypes(), 'L1')).toBe('unknown');
    saveLeagueTypes({ L1: 'managed', L2: 'bestball', L3: 'unknown' });
    expect(loadLeagueTypes()).toEqual({ L1: 'managed', L2: 'bestball' });
    localStorage.setItem('sleeper-companion:league-types', '{broken');
    expect(loadLeagueTypes()).toEqual({});
  });

  it('plans save, reload and never duplicate the same league, player and week', () => {
    localStorage.clear();
    const a = { key: 'L1:P1:2026:regular:7' } as LineupItem;
    const b = { key: 'L2:P1:2026:regular:7' } as LineupItem;
    const r = addItems([a], [a, b]);
    expect(r.items.map((i) => i.key)).toEqual([a.key, b.key]);
    expect(r.skipped).toEqual([a]);
    saveItems(r.items);
    expect(loadItems().map((i) => i.key)).toEqual([a.key, b.key]);
    saveItems([]);
    expect(localStorage.getItem('sleeper-companion:lineup-items')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('fresh reads and received-at time', () => {
  it('fetchedAt is when the answer arrived, not when the request started; force bypasses the 5-minute reuse', async () => {
    let t = 1000;
    const s = createServices({ store: memoryStore(), now: () => t });
    let calls = 0;
    const load = () =>
      new Promise<number>((res) => {
        calls++;
        t += 700; // the answer arrives 700 ms later
        res(calls);
      });
    const first = await s.cached('k', load);
    expect(first.fetchedAt).toBe(1700);
    const reused = await s.cached('k', load);
    expect(reused).toEqual({ data: 1, fetchedAt: 1700 });
    const forced = await s.cached('k', load, true);
    expect(forced).toEqual({ data: 2, fetchedAt: 2400 });
  });

  it('fresh requests tell the browser not to reuse its saved copy; normal ones do not', async () => {
    const inits: (RequestInit | undefined)[] = [];
    const client = createClient({
      backoffMs: 0,
      fetchImpl: (async (_u: RequestInfo | URL, init?: RequestInit) => {
        inits.push(init);
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    await client.getJson('/state/nfl');
    await client.getJson('/state/nfl', { fresh: true });
    expect(inits[0]?.cache).toBeUndefined();
    expect(inits[1]?.cache).toBe('no-cache');
  });
});

// ---------------------------------------------------------------------------------------------
describe('regression: Stage 6 changes no Stage 5 output', () => {
  const baseline = JSON.parse(readFileSync('tests/fixtures/analyzer/stage5-baseline.json', 'utf8')) as Record<string, unknown>;
  it.each(['A', 'B', 'C', 'D'] as Letter[])('league %s partner matching matches the pre-Stage-6 baseline', (l) => {
    expect(JSON.parse(JSON.stringify(matchPartners(azPartnerInput(l))))).toEqual(baseline[l]);
  });
});
