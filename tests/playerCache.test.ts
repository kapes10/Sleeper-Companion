import { describe, expect, it, vi } from 'vitest';
import { SleeperApiError } from '../src/api/client';
import { getPlayers, PLAYER_CACHE_TTL_MS } from '../src/data/playerCache';
import { memoryStore } from '../src/storage/idb';
import { fx } from './helpers';

const HOUR = 60 * 60 * 1000;

function setup() {
  let time = Date.UTC(2026, 9, 23, 12);
  const api = { getAllPlayers: vi.fn(async () => fx.players) };
  const store = memoryStore();
  const deps = { api, store, now: () => time };
  return { api, store, deps, advance: (ms: number) => (time += ms) };
}

describe('24-hour player cache', () => {
  it('downloads once, then serves repeat loads from the cache', async () => {
    const { api, deps, advance } = setup();
    const first = await getPlayers(deps);
    expect(first.source).toBe('network');
    expect(first.players['6904']!.name).toBe('Jalen Hurts');

    advance(23 * HOUR);
    const second = await getPlayers(deps);
    expect(second.source).toBe('cache');
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(api.getAllPlayers).toHaveBeenCalledTimes(1);
  });

  it('re-downloads after 24 hours', async () => {
    const { api, deps, advance } = setup();
    await getPlayers(deps);
    advance(PLAYER_CACHE_TTL_MS);
    expect((await getPlayers(deps)).source).toBe('network');
    expect(api.getAllPlayers).toHaveBeenCalledTimes(2);
  });

  it('falls back to the old cached list, marked stale, if the refresh fails', async () => {
    const { api, deps, advance } = setup();
    const first = await getPlayers(deps);
    advance(25 * HOUR);
    api.getAllPlayers.mockRejectedValueOnce(new SleeperApiError('network', 'Failed to fetch'));
    const result = await getPlayers(deps);
    expect(result).toMatchObject({ source: 'cache', stale: true, fetchedAt: first.fetchedAt });
    expect(result.refreshError).toBeInstanceOf(SleeperApiError);
  });

  it('surfaces the error when there is no cache and the download fails', async () => {
    const { api, deps } = setup();
    api.getAllPlayers.mockRejectedValueOnce(new SleeperApiError('network', 'Failed to fetch'));
    await expect(getPlayers(deps)).rejects.toMatchObject({ kind: 'network' });
  });

  it('treats an unreadable cache as empty', async () => {
    const { api, deps } = setup();
    deps.store.get = async () => {
      throw new Error('IndexedDB broken');
    };
    expect((await getPlayers(deps)).source).toBe('network');
    expect(api.getAllPlayers).toHaveBeenCalledTimes(1);
  });
});
