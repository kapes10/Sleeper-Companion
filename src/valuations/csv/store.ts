// Manual CSV valuation sets, stored in this browser's IndexedDB (they do NOT sync to other
// devices). Kept completely separate from FantasyCalc snapshots and never blended with them.
// For each format (dynasty/redraft × 1QB/superflex) the latest and previous import are kept.
import type { ValueRow } from '../match';
import type { KeyValueStore } from '../../storage/idb';

export interface CsvSet {
  id: string;
  name: string;
  source: string;
  /** As stated by the owner (YYYY-MM-DD). */
  exportDate: string;
  importedAt: string;
  isDynasty: boolean;
  numQbs: 1 | 2;
  rows: ValueRow[];
  skippedRows: number;
}

export interface CsvFormatSlot {
  latest: CsvSet | null;
  previous: CsvSet | null;
}

export type CsvLibrary = Record<string, CsvFormatSlot>;

const KEY = 'valuations:csv:v1';

export const csvFormatKey = (isDynasty: boolean, numQbs: 1 | 2) => `${isDynasty ? 'dynasty' : 'redraft'}-${numQbs}qb`;

export function describeCsvFormat(isDynasty: boolean, numQbs: 1 | 2) {
  return `${isDynasty ? 'Dynasty' : 'Redraft'} · ${numQbs === 2 ? 'Superflex/2QB' : '1QB'}`;
}

export async function loadCsvLibrary(store: KeyValueStore): Promise<CsvLibrary> {
  return (await store.get<CsvLibrary>(KEY)) ?? {};
}

/** Saves a new import as the latest for its format; the old latest becomes previous. */
export async function saveCsvSet(store: KeyValueStore, set: CsvSet): Promise<CsvLibrary> {
  const library = await loadCsvLibrary(store);
  const key = csvFormatKey(set.isDynasty, set.numQbs);
  library[key] = { latest: set, previous: library[key]?.latest ?? null };
  await store.set(KEY, library);
  return library;
}
