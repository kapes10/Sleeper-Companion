// Wires the API client, caches and storage together, and exposes them to screens via context
// so tests can substitute fixture-backed versions.
import { createContext, useContext, type ReactNode } from 'react';
import { createClient, type ClientOptions } from './api/client';
import { createSleeperApi, type SleeperApi } from './api/sleeper';
import { getPlayers, type PlayersResult } from './data/playerCache';
import { idbStore, memoryStore, type KeyValueStore } from './storage/idb';

/** League/roster data is kept in memory for this long; the Refresh button bypasses it. */
export const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

export interface Services {
  api: SleeperApi;
  /** Memoised per key; pass `force` to re-download. Returns data plus when it was fetched. */
  cached<T>(key: string, load: () => Promise<T>, force?: boolean): Promise<{ data: T; fetchedAt: number }>;
  /** The 24-hour cached player list (one download shared by all screens). */
  players(): Promise<PlayersResult>;
}

export function createServices(opts: { client?: ClientOptions; store?: KeyValueStore; now?: () => number } = {}): Services {
  const api = createSleeperApi(createClient(opts.client));
  const store = opts.store ?? (typeof indexedDB === 'undefined' ? memoryStore() : idbStore);
  const now = opts.now ?? Date.now;
  const session = new Map<string, { promise: Promise<unknown>; fetchedAt: number }>();
  let playersPromise: Promise<PlayersResult> | null = null;

  return {
    api,
    cached<T>(key: string, load: () => Promise<T>, force = false) {
      const hit = session.get(key);
      if (!force && hit && now() - hit.fetchedAt < SESSION_CACHE_TTL_MS) {
        return hit.promise.then((data) => ({ data: data as T, fetchedAt: hit.fetchedAt }));
      }
      const fetchedAt = now();
      const promise = load();
      session.set(key, { promise, fetchedAt });
      // Don't keep failures around; the next attempt should try again.
      promise.catch(() => {
        if (session.get(key)?.promise === promise) session.delete(key);
      });
      return promise.then((data) => ({ data, fetchedAt }));
    },
    players() {
      if (!playersPromise) {
        playersPromise = getPlayers({ api, store, now });
        playersPromise.catch(() => {
          playersPromise = null;
        });
      }
      return playersPromise;
    },
  };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('ServicesProvider missing');
  return s;
}
