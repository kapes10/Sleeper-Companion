// Manual CSV valuation sets, stored in this browser's IndexedDB (they do NOT sync to other
// devices). Kept completely separate from FantasyCalc snapshots and never blended with them.
//
// Each set records the full format it was built for — the same five settings FantasyCalc uses
// (dynasty/redraft, QB count, teams, PPR, TE premium tier) — and is only used for leagues whose
// settings match all five. For each format the latest and previous import are kept.
import type { ValueRow } from '../match';
import type { KeyValueStore } from '../../storage/idb';
import { describeParams, paramKey, type FcParams } from '../fantasycalc/params.ts';

export interface CsvSet {
  id: string;
  name: string;
  source: string;
  /** As stated by the owner (YYYY-MM-DD). */
  exportDate: string;
  importedAt: string;
  isDynasty: boolean;
  numQbs: 1 | 2;
  /**
   * The scoring format the owner says these values assume. Missing on sets imported before
   * 2026-10-25, whose scoring was never recorded; those are never used for a league.
   */
  params?: FcParams;
  rows: ValueRow[];
  skippedRows: number;
}

export interface CsvFormatSlot {
  latest: CsvSet | null;
  previous: CsvSet | null;
}

export type CsvLibrary = Record<string, CsvFormatSlot>;

const KEY = 'valuations:csv:v1';

/** Storage key for a set's format. Sets without recorded scoring keep their old, separate key. */
export function csvFormatKey(set: Pick<CsvSet, 'params' | 'isDynasty' | 'numQbs'>): string {
  return set.params ? paramKey(set.params) : `${set.isDynasty ? 'dynasty' : 'redraft'}-${set.numQbs}qb`;
}

export function describeCsvFormat(set: Pick<CsvSet, 'params' | 'isDynasty' | 'numQbs'>): string {
  if (set.params) return describeParams(set.params);
  return `${set.isDynasty ? 'Dynasty' : 'Redraft'} · ${set.numQbs === 2 ? 'Superflex/2QB' : '1QB'} · scoring not recorded`;
}

export async function loadCsvLibrary(store: KeyValueStore): Promise<CsvLibrary> {
  return (await store.get<CsvLibrary>(KEY)) ?? {};
}

/** Saves a new import as the latest for its format; the old latest becomes previous. */
export async function saveCsvSet(store: KeyValueStore, set: CsvSet): Promise<CsvLibrary> {
  const library = await loadCsvLibrary(store);
  const key = csvFormatKey(set);
  library[key] = { latest: set, previous: library[key]?.latest ?? null };
  await store.set(KEY, library);
  return library;
}
