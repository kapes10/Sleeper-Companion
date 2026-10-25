import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFcResponse } from '../src/valuations/fantasycalc/parse';
import { emptyIndex, FC_MIN_REFRESH_MS, isDue, runRefresh, SIMULATED_FAILURE_ERROR, type RefreshDeps } from '../src/valuations/fantasycalc/refresh';
import type { FcParams } from '../src/valuations/fantasycalc/params';

const realText = readFileSync('tests/fixtures/fantasycalc/dynasty-2qb-12tm-ppr1-teplus.trimmed.json', 'utf8');
const messy = JSON.parse(readFileSync('tests/fixtures/fantasycalc/synthetic-messy.json', 'utf8'));

const P12: FcParams = { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1, tep: 'te+' };
const P10: FcParams = { ...P12, numTeams: 10 };
const HOUR = 3_600_000;
const T0 = Date.parse('2026-10-25T02:00:00Z');

function deps(overrides: Partial<RefreshDeps> = {}) {
  let time = T0;
  const get = vi.fn(async () => ({ status: 200, text: realText }));
  const d: RefreshDeps = {
    now: () => time,
    get,
    sha256: async (t) => `sha-${t.length}`,
    parseOptions: { minPlayers: 10 }, // the trimmed fixture has 48 players
    ...overrides,
  };
  return { d, get: (overrides.get as typeof get) ?? get, advance: (ms: number) => (time += ms) };
}

describe('parsing FantasyCalc responses', () => {
  it('reads the real (trimmed) response: players, picks, Sleeper IDs', () => {
    const r = parseFcResponse(JSON.parse(realText), { minPlayers: 10 });
    if (!r.ok) throw new Error(r.error);
    expect(r.players).toHaveLength(48);
    expect(r.picks).toHaveLength(3);
    expect(r.players[0]).toMatchObject({ name: 'Josh Allen', sleeperId: '4984', value: 10708, position: 'QB', team: 'BUF' });
    expect(r.unreadable).toEqual([]);
  });

  it('separates unreadable rows from usable ones in a messy response', () => {
    const r = parseFcResponse(messy, { minPlayers: 1, maxUnreadableShare: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(r.players.map((p) => p.name)).toEqual(['Kirk Cousins', 'No Sleeper Id', 'Duplicate A', 'Duplicate B', 'Ghost Player']);
    expect(r.players[1]!.sleeperId).toBeNull();
    expect(r.picks).toEqual([{ name: '2027 1st', pickId: 'FP_2027_1', value: 3000 }]);
    expect(r.unreadable.map((u) => u.reason)).toEqual([
      'missing player details',
      'value missing or not a number',
      'value missing or not a number',
      'missing player details',
      'missing name or position',
      'negative value',
    ]);
  });

  it('rejects responses that are not usable', () => {
    expect(parseFcResponse([])).toEqual({ ok: false, error: 'Response was empty (no values).' });
    expect(parseFcResponse({ error: 'rate limited' })).toEqual({ ok: false, error: 'Response is not a list of values.' });
    expect(parseFcResponse(messy, { minPlayers: 1 }).ok).toBe(false); // too many unreadable rows
    expect(parseFcResponse(JSON.parse(realText)).ok).toBe(false); // fewer than the default 50 players
  });
});

describe('3-hour refresh rule', () => {
  it('is due when never attempted, not due within 3 hours, due at exactly 3 hours', () => {
    const state = (at: string | null) => ({ key: 'k', params: P12, latest: null, previous: null, lastAttemptAt: at, lastAttemptOk: true, lastError: null });
    expect(isDue(undefined, T0)).toBe(true);
    expect(isDue(state(null), T0)).toBe(true);
    expect(isDue(state(new Date(T0 - FC_MIN_REFRESH_MS + 1).toISOString()), T0)).toBe(false);
    expect(isDue(state(new Date(T0 - FC_MIN_REFRESH_MS).toISOString()), T0)).toBe(true);
    expect(isDue(state(new Date(T0 + HOUR).toISOString()), T0)).toBe(false); // future timestamp: never call early
    expect(isDue(state('garbage'), T0)).toBe(false);
  });

  it('calls once per unique parameter set, even if many leagues need it', async () => {
    const { d, get } = deps();
    const r = await runRefresh(emptyIndex(), [P12, P12, P10, P12], d);
    expect(get).toHaveBeenCalledTimes(2);
    expect(r.calls).toEqual([
      'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te%2B',
      'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=1&tep=te%2B',
    ]);
  });

  it('never calls FantasyCalc more than once in 3 hours across hourly runs', async () => {
    const { d, get, advance } = deps();
    let index = emptyIndex();
    const callTimes: number[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const r = await runRefresh(index, [P12], d);
      if (r.calls.length) callTimes.push(d.now());
      index = r.index;
      advance(HOUR);
    }
    expect(get).toHaveBeenCalledTimes(8);
    for (let i = 1; i < callTimes.length; i++) expect(callTimes[i]! - callTimes[i - 1]!).toBeGreaterThanOrEqual(FC_MIN_REFRESH_MS);
  });

  it('counts a failed attempt toward the 3 hours', async () => {
    const failing = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const { d, advance } = deps({ get: failing });
    const first = await runRefresh(emptyIndex(), [P12], d);
    advance(HOUR);
    const second = await runRefresh(first.index, [P12], d);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(second.calls).toEqual([]);
  });
});

describe('storing snapshots', () => {
  it('saves the raw body untouched with time, parameters and URL', async () => {
    const { d } = deps();
    const r = await runRefresh(emptyIndex(), [P12], d);
    expect(r.writes).toEqual([{ path: 'dynasty-2qb-12tm-ppr1-teplus/2026-10-25T02-00-00-000Z.json', content: realText }]);
    expect(r.index.sets['dynasty-2qb-12tm-ppr1-teplus']).toMatchObject({
      lastAttemptAt: '2026-10-25T02:00:00.000Z',
      lastAttemptOk: true,
      lastError: null,
      previous: null,
      latest: { params: P12, fetchedAt: '2026-10-25T02:00:00.000Z', httpStatus: 200, playerCount: 48, pickCount: 3 },
    });
    expect(r.changed).toBe(true);
  });

  it('keeps the previous snapshot when a new one arrives', async () => {
    const { d, advance } = deps();
    const first = await runRefresh(emptyIndex(), [P12], d);
    advance(3 * HOUR);
    const second = await runRefresh(first.index, [P12], d);
    const set = second.index.sets['dynasty-2qb-12tm-ppr1-teplus']!;
    expect(set.previous).toEqual(first.index.sets['dynasty-2qb-12tm-ppr1-teplus']!.latest);
    expect(set.latest!.fetchedAt).toBe('2026-10-25T05:00:00.000Z');
  });

  it.each([
    ['network failure', async () => Promise.reject(new Error('getaddrinfo ENOTFOUND')), /Network error: getaddrinfo ENOTFOUND/],
    ['HTTP error', async () => ({ status: 503, text: 'Service Unavailable' }), /HTTP 503/],
    ['rate limit', async () => ({ status: 429, text: '' }), /HTTP 429/],
    ['non-JSON body', async () => ({ status: 200, text: '<html>maintenance</html>' }), /not valid JSON/],
    ['empty list', async () => ({ status: 200, text: '[]' }), /empty/],
    ['messy data', async () => ({ status: 200, text: JSON.stringify(messy) }), /readable player values|unreadable/],
  ])('a failed fetch (%s) keeps the good snapshot and records the error', async (_, get, message) => {
    const ok = deps();
    const good = await runRefresh(emptyIndex(), [P12], ok.d);
    const goodLatest = good.index.sets['dynasty-2qb-12tm-ppr1-teplus']!.latest;

    const bad = deps({ get: vi.fn(get) as RefreshDeps['get'] });
    bad.advance(3 * HOUR);
    const r = await runRefresh(good.index, [P12], bad.d);
    const set = r.index.sets['dynasty-2qb-12tm-ppr1-teplus']!;
    expect(r.writes).toEqual([]);
    expect(set.latest).toEqual(goodLatest);
    expect(set.lastAttemptOk).toBe(false);
    expect(set.lastError).toMatch(message);
    expect(set.lastAttemptAt).toBe('2026-10-25T05:00:00.000Z');
  });

  it('reports no change when nothing was due', async () => {
    const { d } = deps();
    const first = await runRefresh(emptyIndex(), [P12], d);
    const again = await runRefresh(first.index, [P12], d);
    expect(again.changed).toBe(false);
    expect(again.index).toEqual(first.index);
  });
});

describe('simulated failure (test switch)', () => {
  it('records a failure, keeps snapshots, makes no request and does not use up the 3-hour allowance', async () => {
    const ok = deps();
    const good = await runRefresh(emptyIndex(), [P12], ok.d);
    const before = good.index.sets['dynasty-2qb-12tm-ppr1-teplus']!;

    const sim = deps({ simulateFailure: true });
    sim.advance(HOUR);
    const r = await runRefresh(good.index, [P12, P10], sim.d);
    expect(sim.get).not.toHaveBeenCalled();
    expect(r.calls).toEqual([]);
    expect(r.writes).toEqual([]);
    expect(r.changed).toBe(true);
    const after = r.index.sets['dynasty-2qb-12tm-ppr1-teplus']!;
    expect(after).toMatchObject({ latest: before.latest, previous: before.previous, lastAttemptAt: before.lastAttemptAt, lastAttemptOk: false, lastError: SIMULATED_FAILURE_ERROR });

    // A run before a refresh is due skips the format, so the simulated failure stays recorded.
    const early = deps();
    early.advance(2 * HOUR);
    const skipped = await runRefresh(r.index, [P12], early.d);
    expect(early.get).not.toHaveBeenCalled();
    expect(skipped.index.sets['dynasty-2qb-12tm-ppr1-teplus']).toMatchObject({ lastAttemptOk: false, lastError: SIMULATED_FAILURE_ERROR });

    // It clears only when a due refresh succeeds (3 hours after the last REAL attempt).
    const real = deps();
    real.advance(3 * HOUR);
    const next = await runRefresh(r.index, [P12], real.d);
    expect(next.calls).toHaveLength(1);
    expect(next.index.sets['dynasty-2qb-12tm-ppr1-teplus']).toMatchObject({ lastAttemptOk: true, lastError: null });
  });
});
