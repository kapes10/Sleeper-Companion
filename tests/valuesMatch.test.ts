import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toPlayerIndex } from '../src/domain/players';
import { parseFcResponse } from '../src/valuations/fantasycalc/parse';
import { emptyIndex, type SetState } from '../src/valuations/fantasycalc/refresh';
import { selectCsvSet, selectFcSet } from '../src/valuations/leagueValues';
import { countByReason, matchValues, type ValueRow } from '../src/valuations/match';
import { formatScaled, scaleValue, topValue } from '../src/valuations/scale';
import { fcFreshness, FC_STALE_AFTER_MS } from '../src/valuations/staleness';
import { csvFormatKey, type CsvLibrary, type CsvSet } from '../src/valuations/csv/store';
import type { FcParams } from '../src/valuations/fantasycalc/params';
import { clone, fx } from './helpers';

const players = toPlayerIndex(fx.players);
const parse = (file: string, minPlayers = 1) => {
  const r = parseFcResponse(JSON.parse(readFileSync(file, 'utf8')), { minPlayers, maxUnreadableShare: 1 });
  if (!r.ok) throw new Error(r.error);
  return r.players.map((p): ValueRow => ({ sleeperId: p.sleeperId, name: p.name, position: p.position, team: p.team, value: p.value }));
};
const real = parse('tests/fixtures/fantasycalc/dynasty-2qb-12tm-ppr1-teplus.trimmed.json');
const messy = parse('tests/fixtures/fantasycalc/synthetic-messy.json');

describe('0–100 scale (approved formula)', () => {
  it('matches the approved examples', () => {
    expect(scaleValue(10708, 10708)).toBe(100);
    expect(scaleValue(5412, 10708)).toBe(51);
    expect(scaleValue(2230, 10708)).toBe(21);
    expect(scaleValue(225, 10708)).toBe(2);
    expect(scaleValue(3, 10708)).toBe(0);
    expect(formatScaled(scaleValue(3, 10708))).toBe('<1');
    expect(formatScaled(51)).toBe('51');
  });

  it('uses the highest player value as the top (picks are already excluded by parsing)', () => {
    expect(topValue(real.map((r) => r.value))).toBe(10708);
    expect(topValue([])).toBeNull();
  });
});

describe('matching by Sleeper ID only', () => {
  it('matches real FantasyCalc rows to Sleeper players and scales them', () => {
    const m = matchValues(real, players);
    expect(m.top).toBe(10708);
    expect(m.bySleeperId.get('8183')).toMatchObject({ raw: 6309, scaled: 59 }); // Brock Purdy
    expect(m.bySleeperId.get('7564')).toMatchObject({ raw: 8438, scaled: 79 }); // Ja'Marr Chase
    expect(m.bySleeperId.get('4984')).toMatchObject({ raw: 10708, scaled: 100 }); // Josh Allen, the top player
    expect(m.unmatched).toEqual([]);
    expect(m.bySleeperId.size).toBe(real.length);
  });

  it('lists every unmatched row with its reason and never matches by name', () => {
    const m = matchValues(messy, players);
    expect([...m.bySleeperId.keys()]).toEqual(['1166']);
    expect(countByReason(m.unmatched)).toEqual({ no_sleeper_id: 1, sleeper_id_not_found: 1, duplicate_sleeper_id: 2 });
  });

  it('does not match a row whose name matches a Sleeper player but whose ID is missing', () => {
    const rows: ValueRow[] = [{ sleeperId: null, name: 'Brock Purdy', position: 'QB', team: 'SF', value: 100 }];
    const m = matchValues(rows, players);
    expect(m.bySleeperId.size).toBe(0);
    expect(m.unmatched[0]!.reason).toBe('no_sleeper_id');
  });
});

describe('choosing the value set for a league', () => {
  const state = (fetchedAt: string | null): SetState => ({
    key: 'dynasty-2qb-12tm-ppr1-teplus',
    params: { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1, tep: 'te+' },
    latest: fetchedAt
      ? { file: 'x.json', url: 'u', params: { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1, tep: 'te+' }, fetchedAt, httpStatus: 200, bytes: 1, sha256: 's', playerCount: 1, pickCount: 0, unreadableCount: 0 }
      : null,
    previous: null,
    lastAttemptAt: fetchedAt,
    lastAttemptOk: true,
    lastError: null,
  });

  it('picks the snapshot matching the league format', () => {
    const index = { ...emptyIndex(), sets: { 'dynasty-2qb-12tm-ppr1-teplus': state('2026-10-25T02:00:00Z') } };
    expect(selectFcSet(fx.league01, index)).toMatchObject({ kind: 'available', key: 'dynasty-2qb-12tm-ppr1-teplus' });
    expect(selectFcSet(fx.league02, index)).toMatchObject({ kind: 'available', key: 'dynasty-2qb-12tm-ppr1-teplus' });
  });

  it('never uses a different format’s values (10-team league, only 12-team published)', () => {
    const tenTeam = clone(fx.league02);
    tenTeam.total_rosters = 10;
    const index = { ...emptyIndex(), sets: { 'dynasty-2qb-12tm-ppr1-teplus': state('2026-10-25T02:00:00Z') } };
    expect(selectFcSet(tenTeam, index)).toMatchObject({ kind: 'missing', key: 'dynasty-2qb-10tm-ppr1-teplus' });
    expect(selectFcSet(fx.league02, null)).toMatchObject({ kind: 'missing' });
  });

  it('reports unsupported leagues instead of picking something close', () => {
    const odd = clone(fx.league02);
    odd.total_rosters = 9;
    expect(selectFcSet(odd, emptyIndex())).toMatchObject({ kind: 'unsupported' });
  });

  describe('CSV set selection requires all five format settings to match', () => {
    const P: FcParams = { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1, tep: 'te+' };
    const csv = (params: FcParams | undefined, id = 'x'): CsvSet => ({
      id,
      name: id,
      source: 's',
      exportDate: '2026-10-20',
      importedAt: '2026-10-21T00:00:00Z',
      isDynasty: params?.isDynasty ?? true,
      numQbs: params?.numQbs ?? 2,
      params,
      rows: [],
      skippedRows: 0,
    });
    const lib = (...sets: CsvSet[]): CsvLibrary => Object.fromEntries(sets.map((s) => [csvFormatKey(s), { latest: s, previous: null }]));

    it('uses a set built for exactly this format', () => {
      expect(selectCsvSet(fx.league02, lib(csv(P, 'exact')))).toMatchObject({ kind: 'match', set: { id: 'exact' } });
    });

    it.each([
      ['redraft', { isDynasty: false }],
      ['1QB', { numQbs: 1 }],
      ['10 teams', { numTeams: 10 }],
      ['half PPR', { ppr: 0.5 }],
      ['no TE premium', { tep: 'none' }],
      ['TE++', { tep: 'te++' }],
    ] as const)('does not use a set built for %s, and says one exists', (_, change) => {
      const other = csv({ ...P, ...change } as FcParams, 'other');
      expect(selectCsvSet(fx.league02, lib(other))).toEqual({ kind: 'mismatch', others: [other] });
    });

    it('never uses an older set whose scoring was not recorded', () => {
      const legacy = csv(undefined, 'legacy');
      expect(csvFormatKey(legacy)).toBe('dynasty-2qb');
      expect(selectCsvSet(fx.league02, lib(legacy))).toEqual({ kind: 'mismatch', others: [legacy] });
    });

    it('picks the matching set when several formats are stored', () => {
      const r = selectCsvSet(fx.league02, lib(csv({ ...P, ppr: 0.5 }, 'half'), csv(P, 'exact'), csv(undefined, 'legacy')));
      expect(r).toMatchObject({ kind: 'match', set: { id: 'exact' } });
    });

    it('reports none when nothing is stored', () => {
      expect(selectCsvSet(fx.league02, {})).toEqual({ kind: 'none' });
    });
  });

  it('flags values older than 6 hours as stale, and a failed last attempt', () => {
    const fetched = Date.parse('2026-10-25T02:00:00Z');
    const s = state('2026-10-25T02:00:00Z');
    expect(fcFreshness(s, fetched + FC_STALE_AFTER_MS)).toMatchObject({ kind: 'fresh' });
    expect(fcFreshness(s, fetched + FC_STALE_AFTER_MS + 1)).toMatchObject({ kind: 'stale', lastAttemptFailed: false });
    const failed = { ...s, lastAttemptOk: false, lastError: 'HTTP 503' };
    expect(fcFreshness(failed, fetched + 7 * 3_600_000)).toMatchObject({ kind: 'stale', lastAttemptFailed: true, lastError: 'HTTP 503' });
    expect(fcFreshness(state(null), fetched)).toMatchObject({ kind: 'missing' });
    expect(fcFreshness(undefined, fetched)).toMatchObject({ kind: 'missing' });
  });
});
