// Browser-side reading of the snapshots published by the scheduled job. The browser never
// calls FantasyCalc itself (CLAUDE.md); it only reads static files from this app's own site.
import type { ValueRow } from '../match';
import { parseFcResponse, type FcPickValue } from './parse.ts';
import type { SnapshotMeta, ValuesIndex } from './refresh.ts';

export interface FcSnapshot {
  meta: SnapshotMeta;
  rows: ValueRow[];
  /** Draft-pick values (display context only). */
  picks: FcPickValue[];
  unreadableCount: number;
}

export class ValuesLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValuesLoadError';
  }
}

function dataUrl(path: string): string {
  return new URL(`data/fantasycalc/${path}`, document.baseURI).href;
}

async function get(path: string, fetchImpl: typeof fetch): Promise<Response> {
  try {
    return await fetchImpl(dataUrl(path), { cache: 'no-cache' });
  } catch {
    throw new ValuesLoadError("Couldn't load player values. Check your internet connection and try again.");
  }
}

/** Returns null when nothing has been published yet. */
export async function loadFcIndex(fetchImpl: typeof fetch): Promise<ValuesIndex | null> {
  const res = await get('index.json', fetchImpl);
  if (res.status === 404) return null;
  if (!res.ok) throw new ValuesLoadError(`Couldn't load the player values index (HTTP ${res.status}).`);
  try {
    const index = (await res.json()) as ValuesIndex;
    if (index?.schemaVersion !== 1 || typeof index.sets !== 'object') throw new Error();
    return index;
  } catch {
    throw new ValuesLoadError('The player values index is unreadable.');
  }
}

export async function loadFcSnapshot(meta: SnapshotMeta, fetchImpl: typeof fetch): Promise<FcSnapshot> {
  const res = await get(meta.file, fetchImpl);
  if (!res.ok) throw new ValuesLoadError(`Couldn't load the FantasyCalc snapshot (HTTP ${res.status}).`);
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new ValuesLoadError('The FantasyCalc snapshot is unreadable.');
  }
  // The job already validated this snapshot; accept whatever readable rows it has.
  const parsed = parseFcResponse(raw, { minPlayers: 1, maxUnreadableShare: 1 });
  if (!parsed.ok) throw new ValuesLoadError(`The FantasyCalc snapshot is unusable: ${parsed.error}`);
  return {
    meta,
    rows: parsed.players.map((p) => ({ sleeperId: p.sleeperId, name: p.name, position: p.position, team: p.team, value: p.value })),
    picks: parsed.picks,
    unreadableCount: parsed.unreadable.length,
  };
}
