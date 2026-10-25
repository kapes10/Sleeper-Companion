// Matches valuation rows to Sleeper players by Sleeper ID only. Never by name.
import type { PlayerIndex } from '../domain/players';
import { scaleValue, topValue } from './scale';

/** The fields every valuation source provides (FantasyCalc and manual CSV alike). */
export interface ValueRow {
  sleeperId: string | null;
  name: string;
  position: string | null;
  team: string | null;
  value: number;
}

export type UnmatchedReason = 'no_sleeper_id' | 'sleeper_id_not_found' | 'duplicate_sleeper_id';

export interface PlayerValue {
  raw: number;
  scaled: number;
  row: ValueRow;
}

export interface MatchResult {
  /** Keyed by Sleeper player ID. */
  bySleeperId: Map<string, PlayerValue>;
  unmatched: { row: ValueRow; reason: UnmatchedReason }[];
  /** Highest player value in the set (the denominator for the 0–100 scale). */
  top: number | null;
}

export const UNMATCHED_LABELS: Record<UnmatchedReason, string> = {
  no_sleeper_id: 'No Sleeper ID in the source',
  sleeper_id_not_found: "Sleeper ID isn't in Sleeper's player list",
  duplicate_sleeper_id: 'Same Sleeper ID appears more than once',
};

export function matchValues(rows: ValueRow[], players: PlayerIndex): MatchResult {
  const top = topValue(rows.map((r) => r.value));
  const counts = new Map<string, number>();
  for (const r of rows) if (r.sleeperId) counts.set(r.sleeperId, (counts.get(r.sleeperId) ?? 0) + 1);

  const bySleeperId = new Map<string, PlayerValue>();
  const unmatched: MatchResult['unmatched'] = [];
  for (const row of rows) {
    if (!row.sleeperId) unmatched.push({ row, reason: 'no_sleeper_id' });
    else if (counts.get(row.sleeperId)! > 1) unmatched.push({ row, reason: 'duplicate_sleeper_id' });
    else if (!players[row.sleeperId]) unmatched.push({ row, reason: 'sleeper_id_not_found' });
    else bySleeperId.set(row.sleeperId, { raw: row.value, scaled: top ? scaleValue(row.value, top) : 0, row });
  }
  return { bySleeperId, unmatched, top };
}

export function countByReason(unmatched: MatchResult['unmatched']): Record<UnmatchedReason, number> {
  const out: Record<UnmatchedReason, number> = { no_sleeper_id: 0, sleeper_id_not_found: 0, duplicate_sleeper_id: 0 };
  for (const u of unmatched) out[u.reason]++;
  return out;
}
