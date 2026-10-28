// Stage 6 local state, saved in THIS browser's localStorage only. It does not sync to other
// devices and is never sent anywhere. Nothing here is ever written to Sleeper.
import type { LeagueType } from '../analysis/lineup/placement';
import type { LineupItem } from '../analysis/lineup/verify';

const TYPES_KEY = 'sleeper-companion:league-types';
const ITEMS_KEY = 'sleeper-companion:lineup-items';

/** League type per league ID. Leagues not listed are Unknown. */
export function loadLeagueTypes(): Record<string, LeagueType> {
  try {
    const raw = JSON.parse(localStorage.getItem(TYPES_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => v === 'managed' || v === 'bestball')) as Record<string, LeagueType>;
  } catch {
    return {};
  }
}

export function saveLeagueTypes(types: Record<string, LeagueType>): void {
  try {
    const kept = Object.fromEntries(Object.entries(types).filter(([, v]) => v !== 'unknown'));
    localStorage.setItem(TYPES_KEY, JSON.stringify(kept));
  } catch {
    // Storage blocked or full: the choice still applies for this visit.
  }
}

export const leagueTypeOf = (types: Record<string, LeagueType>, leagueId: string): LeagueType => types[leagueId] ?? 'unknown';

export function loadItems(): LineupItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ITEMS_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is LineupItem => !!x && typeof x === 'object' && typeof (x as LineupItem).key === 'string') : [];
  } catch {
    return [];
  }
}

export function saveItems(items: LineupItem[]): void {
  try {
    if (items.length) localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    else localStorage.removeItem(ITEMS_KEY);
  } catch {
    // Storage blocked or full: the list still applies for this visit.
  }
}

/** Adds items, skipping any whose key (league, player, week) is already saved. */
export function addItems(existing: LineupItem[], added: LineupItem[]): { items: LineupItem[]; skipped: LineupItem[] } {
  const keys = new Set(existing.map((i) => i.key));
  const skipped = added.filter((i) => keys.has(i.key));
  return { items: [...existing, ...added.filter((i) => !keys.has(i.key))], skipped };
}
