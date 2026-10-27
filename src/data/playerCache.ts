// 24-hour cache for the full NFL player list. Sleeper asks that /players/nfl be called at
// most once per day, so a repeat visit within 24 hours reads from IndexedDB instead.

import type { SleeperApi } from '../api/sleeper';
import { toPlayerIndex, type PlayerIndex } from '../domain/players';
import type { KeyValueStore } from '../storage/idb';

/** v3 adds NFL depth-chart order (v2 added ages); an older cache is ignored, causing one fresh download. */
export const PLAYER_CACHE_KEY = 'players:nfl:v3';
export const PLAYER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedPlayers {
  fetchedAt: number;
  players: PlayerIndex;
}

export interface PlayersResult {
  players: PlayerIndex;
  /** When the data was downloaded from Sleeper (ms since epoch). */
  fetchedAt: number;
  source: 'cache' | 'network';
  /** True when the cache is older than 24 h and a refresh failed, so old data is being shown. */
  stale: boolean;
  /** Present when stale: why the refresh failed. */
  refreshError?: unknown;
}

export interface PlayerCacheDeps {
  api: Pick<SleeperApi, 'getAllPlayers'>;
  store: KeyValueStore;
  now?: () => number;
}

async function readCache(store: KeyValueStore): Promise<CachedPlayers | undefined> {
  try {
    const cached = await store.get<CachedPlayers>(PLAYER_CACHE_KEY);
    if (cached && typeof cached.fetchedAt === 'number' && cached.players) return cached;
  } catch {
    // Unreadable cache behaves like an empty cache.
  }
  return undefined;
}

export async function getPlayers({ api, store, now = Date.now }: PlayerCacheDeps): Promise<PlayersResult> {
  const cached = await readCache(store);
  if (cached && now() - cached.fetchedAt < PLAYER_CACHE_TTL_MS) {
    return { players: cached.players, fetchedAt: cached.fetchedAt, source: 'cache', stale: false };
  }

  try {
    const players = toPlayerIndex(await api.getAllPlayers());
    const fetchedAt = now();
    try {
      await store.set<CachedPlayers>(PLAYER_CACHE_KEY, { fetchedAt, players });
    } catch {
      // Saving failed (e.g. storage full); still usable for this session.
    }
    return { players, fetchedAt, source: 'network', stale: false };
  } catch (err) {
    // Prefer old names over no names, but say so.
    if (cached) return { players: cached.players, fetchedAt: cached.fetchedAt, source: 'cache', stale: true, refreshError: err };
    throw err;
  }
}
