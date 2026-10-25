import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toPlayerIndex } from '../src/domain/players';
import { parseFcResponse } from '../src/valuations/fantasycalc/parse';
import { emptyIndex, type SetState } from '../src/valuations/fantasycalc/refresh';
import { selectCsvSet, selectFcSet } from '../src/valuations/leagueValues';
import { countByReason, matchValues, type ValueRow } from '../src/valuations/match';
import { formatScaled, scaleValue, topValue } from '../src/valuations/scale';
import { fcFreshness, FC_STALE_AFTER_MS } from '../src/valuations/staleness';
import type { CsvSet } from '../src/valuations/csv/store';
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

  it('chooses a CSV set by dynasty/redraft and QB count, never a mismatched one', () => {
    const csv = (isDynasty: boolean, numQbs: 1 | 2): CsvSet => ({ id: 'x', name: 'n', source: 's', exportDate: '2026-10-20', importedAt: '2026-10-21T00:00:00Z', isDynasty, numQbs, rows: [], skippedRows: 0 });
    expect(selectCsvSet(fx.league02, { 'dynasty-2qb': { latest: csv(true, 2), previous: null } })).not.toBeNull();
    expect(selectCsvSet(fx.league02, { 'dynasty-1qb': { latest: csv(true, 1), previous: null } })).toBeNull();
    expect(selectCsvSet(fx.league02, { 'redraft-2qb': { latest: csv(false, 2), previous: null } })).toBeNull();
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
