// Wires the API client, caches and storage together, and exposes them to screens via context
// so tests can substitute fixture-backed versions.
import { createContext, useContext, type ReactNode } from 'react';
import { createClient, type ClientOptions } from './api/client';
import { createSleeperApi, type SleeperApi } from './api/sleeper';
import { getPlayers, type PlayersResult } from './data/playerCache';
import { idbStore, memoryStore, type KeyValueStore } from './storage/idb';
import { loadFcIndex, loadFcSnapshot, type FcSnapshot } from './valuations/fantasycalc/load';
import type { SnapshotMeta, ValuesIndex } from './valuations/fantasycalc/refresh';

/** League/roster data is kept in memory for this long; the Refresh button bypasses it. */
export const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

export interface Services {
  api: SleeperApi;
  /** Memoised per key; pass `force` to re-download. `fetchedAt` = when the response was received (not when the request started). */
  cached<T>(key: string, load: () => Promise<T>, force?: boolean): Promise<{ data: T; fetchedAt: number }>;
  /** The 24-hour cached player list (one download shared by all screens). */
  players(): Promise<PlayersResult>;
  /** Published FantasyCalc index (null = nothing published yet). */
  fcIndex(force?: boolean): Promise<{ data: ValuesIndex | null; fetchedAt: number }>;
  /** A published FantasyCalc snapshot; snapshot files never change, so they are cached for the session. */
  fcSnapshot(meta: SnapshotMeta): Promise<FcSnapshot>;
  /** IndexedDB store (player cache, manual CSV sets). */
  store: KeyValueStore;
  now: () => number;
}

export function createServices(
  opts: { client?: ClientOptions; store?: KeyValueStore; now?: () => number; valuesFetch?: typeof fetch } = {},
): Services {
  const api = createSleeperApi(createClient(opts.client));
  const store = opts.store ?? (typeof indexedDB === 'undefined' ? memoryStore() : idbStore);
  const now = opts.now ?? Date.now;
  const session = new Map<string, { promise: Promise<unknown>; fetchedAt: number }>();
  let playersPromise: Promise<PlayersResult> | null = null;
  const valuesFetch = opts.valuesFetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const snapshots = new Map<string, Promise<FcSnapshot>>();

  const services: Services = {
    api,
    store,
    now,
    cached<T>(key: string, load: () => Promise<T>, force = false) {
      const hit = session.get(key);
      if (!force && hit && now() - hit.fetchedAt < SESSION_CACHE_TTL_MS) {
        return hit.promise.then((data) => ({ data: data as T, fetchedAt: hit.fetchedAt }));
      }
      // Until the answer arrives this holds the start time (only used for the 5-minute reuse window).
      const entry: { promise: Promise<unknown>; fetchedAt: number } = { promise: Promise.resolve(), fetchedAt: now() };
      const promise = load().then((data) => {
        entry.fetchedAt = now();
        return data;
      });
      entry.promise = promise;
      session.set(key, entry);
      // Don't keep failures around; the next attempt should try again.
      promise.catch(() => {
        if (session.get(key)?.promise === promise) session.delete(key);
      });
      return promise.then((data) => ({ data, fetchedAt: entry.fetchedAt }));
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
    fcIndex(force = false) {
      return services.cached('fc:index', () => loadFcIndex(valuesFetch), force);
    },
    fcSnapshot(meta) {
      let p = snapshots.get(meta.file);
      if (!p) {
        p = loadFcSnapshot(meta, valuesFetch);
        snapshots.set(meta.file, p);
        p.catch(() => snapshots.delete(meta.file));
      }
      return p;
    },
  };
  return services;
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
