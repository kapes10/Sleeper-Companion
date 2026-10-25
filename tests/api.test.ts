import { describe, expect, it, vi } from 'vitest';
import { createClient, describeError, SleeperApiError } from '../src/api/client';
import { createSleeperApi, normalizeUsername, UserNotFoundError } from '../src/api/sleeper';
import { fixtureFetch, fx, json, OWNER_ID } from './helpers';

const apiWith = (fetchImpl: typeof fetch, retries = 2) => createSleeperApi(createClient({ fetchImpl, backoffMs: 0, retries }));

describe('username lookup', () => {
  it('resolves a valid username to its stable user ID', async () => {
    const { impl, calls } = fixtureFetch();
    const user = await apiWith(impl).getUser('fixture_owner');
    expect(user.user_id).toBe(OWNER_ID);
    expect(calls).toEqual(['/user/fixture_owner']);
  });

  it('strips a leading @ and whitespace (Sleeper returns null for "@name")', async () => {
    expect(normalizeUsername('  @fixture_owner ')).toBe('fixture_owner');
    const { impl, calls } = fixtureFetch();
    await apiWith(impl).getUser('@fixture_owner');
    expect(calls).toEqual(['/user/fixture_owner']);
  });

  it('reports an unknown username clearly (Sleeper responds with null)', async () => {
    const { impl } = fixtureFetch();
    await expect(apiWith(impl).getUser('no_such_user_xyz')).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(apiWith(impl).getUser('no_such_user_xyz')).rejects.toThrow(/No Sleeper account found/);
  });

  it('rejects a blank username without calling the API', async () => {
    const { impl, calls } = fixtureFetch();
    await expect(apiWith(impl).getUser('  @ ')).rejects.toBeInstanceOf(UserNotFoundError);
    expect(calls).toEqual([]);
  });

  it('URL-encodes usernames', async () => {
    const { impl, calls } = fixtureFetch();
    await apiWith(impl).getUser('a b/c').catch(() => {});
    expect(calls[0]).toBe('/user/a%20b%2Fc');
  });
});

describe('league endpoints', () => {
  it('loads the current-season leagues for the stable user ID', async () => {
    const { impl } = fixtureFetch();
    const leagues = await apiWith(impl).getUserLeagues(OWNER_ID, fx.nflState.league_season);
    expect(leagues).toHaveLength(23);
  });

  it('treats a null league list as empty', async () => {
    const api = apiWith((async () => json(null)) as typeof fetch);
    expect(await api.getUserLeagues(OWNER_ID, '2026')).toEqual([]);
  });
});

describe('network failures', () => {
  it('retries a dropped connection, then reports a readable network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await apiWith(fetchImpl as unknown as typeof fetch).getNflState().catch((e) => e);
    expect(err).toBeInstanceOf(SleeperApiError);
    expect(err.kind).toBe('network');
    expect(fetchImpl).toHaveBeenCalledTimes(3); // first try + 2 retries
    expect(describeError(err)).toMatch(/Couldn't reach Sleeper/);
  });

  it('recovers when a retry succeeds', async () => {
    let n = 0;
    const fetchImpl = (async () => (++n < 2 ? json({}, 503) : json(fx.nflState))) as typeof fetch;
    expect((await apiWith(fetchImpl).getNflState()).week).toBe(fx.nflState.week);
  });

  it('backs off and retries on 429 Too Many Requests', async () => {
    const fetchImpl = vi.fn(async () => json({}, 429));
    const err = await apiWith(fetchImpl as unknown as typeof fetch, 1).getNflState().catch((e) => e);
    expect(err.kind).toBe('rate_limited');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(describeError(err)).toMatch(/slow down/);
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn(async () => json({}, 404));
    const err = await apiWith(fetchImpl as unknown as typeof fetch).getLeague('x').catch((e) => e);
    expect(err.kind).toBe('http');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a malformed response', async () => {
    const fetchImpl = (async () => new Response('<html>oops</html>', { status: 200 })) as typeof fetch;
    const err = await apiWith(fetchImpl).getNflState().catch((e) => e);
    expect(err.kind).toBe('bad_response');
  });

  it('times out a hung request', async () => {
    const fetchImpl = ((_: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    const api = createSleeperApi(createClient({ fetchImpl, timeoutMs: 10, retries: 0 }));
    const err = await api.getNflState().catch((e) => e);
    expect(err.kind).toBe('timeout');
  });
});
