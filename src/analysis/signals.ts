// Roster age, draft-pick holdings and recent trades. Pure functions over Sleeper data.
import type { SleeperRoster, SleeperTradedPick, SleeperTransaction } from '../api/types';
import type { PlayerIndex } from '../domain/players';

/** Below this share of players with a known age, the age signal is treated as unavailable. */
export const MIN_AGE_COVERAGE = 0.8;

export interface RosterAge {
  median: number | null;
  known: number;
  total: number;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function rosterAge(roster: SleeperRoster, players: PlayerIndex): RosterAge {
  const ids = roster.players ?? [];
  const ages = ids.map((id) => players[id]?.age).filter((a): a is number => typeof a === 'number');
  const enough = ids.length > 0 && ages.length / ids.length >= MIN_AGE_COVERAGE;
  return { median: enough ? median(ages) : null, known: ages.length, total: ids.length };
}

export interface FuturePick {
  season: string;
  round: number;
  /** Roster that originally owned the pick. */
  originalRosterId: number;
}

export interface PickBalance {
  /** Future 1st/2nd-round picks received minus given away through trades. */
  net12: number;
  /** Future picks this roster currently owns, within the seasons listed in `seasons`. Null if the number of draft rounds is unknown. */
  owned: FuturePick[] | null;
}

/**
 * Sleeper only lists picks that have been traded, so each roster's holdings are its own picks,
 * plus picks received, minus picks traded away. "Future" = seasons after the league's season.
 * The seasons covered are the next season through the latest season seen in any trade.
 */
export function pickBalances(
  tradedPicks: SleeperTradedPick[],
  rosterIds: number[],
  leagueSeason: string,
  draftRounds: number | null,
): { seasons: string[]; byRoster: Map<number, PickBalance> } {
  const current = Number(leagueSeason);
  const future = tradedPicks.filter((p) => Number(p.season) > current);
  const lastSeason = Math.max(current + 1, ...future.map((p) => Number(p.season)));
  const seasons = Array.from({ length: lastSeason - current }, (_, i) => String(current + 1 + i));

  const byRoster = new Map<number, PickBalance>();
  for (const id of rosterIds) {
    const received = future.filter((p) => p.owner_id === id && p.roster_id !== id && p.round <= 2).length;
    const given = future.filter((p) => p.roster_id === id && p.owner_id !== id && p.round <= 2).length;
    byRoster.set(id, { net12: received - given, owned: draftRounds ? [] : null });
  }
  if (draftRounds) {
    for (const season of seasons) {
      for (let round = 1; round <= draftRounds; round++) {
        for (const original of rosterIds) {
          const traded = future.find((p) => p.season === season && p.round === round && p.roster_id === original);
          const owner = traded ? traded.owner_id : original;
          byRoster.get(owner)?.owned!.push({ season, round, originalRosterId: original });
        }
      }
    }
  }
  return { seasons, byRoster };
}

/** Completed trades per roster in the given transactions. */
export function tradeCounts(transactions: SleeperTransaction[]): Map<number, number> {
  const counts = new Map<number, number>();
  const seen = new Set<string>();
  for (const t of transactions) {
    if (t.type !== 'trade' || t.status !== 'complete' || seen.has(t.transaction_id)) continue;
    seen.add(t.transaction_id);
    for (const id of t.roster_ids ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
