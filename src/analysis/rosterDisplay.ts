// Roster screen display rules (owner approved 2026-10-29). Pure functions, no UI.
// - Best-ball gap fill: an empty lineup slot is shown filled with the eligible bench player who has
//   the highest market value (the value source the screen shows). Market value, not projected
//   points; nothing is changed in Sleeper.
// - Bench, IR and taxi lists: grouped by position (QB, RB, WR, TE, then others), highest value first.
import type { SleeperRoster } from '../api/types';
import type { PlayerIndex } from '../domain/players';
import type { RosterEntry } from '../domain/roster';
import type { PlayerValue } from '../valuations/match';
import { benchIds } from './lineup/placement';
import { eligiblePositions, slotAccepts, SLOT_ACCEPTS } from './positional/slots';

export type ValueOf = (playerId: string) => PlayerValue | null;

export interface GapFill {
  slotIndex: number;
  slot: string;
  /** null = no bench player with a value can fill this slot (left empty). */
  playerId: string | null;
  reason: string;
}

/**
 * Fills empty ("0") lineup slots in Sleeper's slot order. For each, the eligible bench player
 * (under the supported slot rules) with the highest market value who isn't already used.
 * Players without a value are never used; unsupported slot types are never filled.
 */
export function fillEmptySlots(roster: SleeperRoster, rosterPositions: string[], players: PlayerIndex, valueOf: ValueOf): GapFill[] {
  const slots = rosterPositions.filter((p) => p !== 'BN');
  const starters = roster.starters ?? [];
  const used = new Set<string>();
  const bench = benchIds(roster);
  const fills: GapFill[] = [];
  slots.forEach((slot, i) => {
    const id = starters[i];
    if (id && id !== '0') return;
    if (!(slot in SLOT_ACCEPTS)) {
      fills.push({ slotIndex: i, slot, playerId: null, reason: `Empty in Sleeper. ${slot} is a slot type this app doesn't support, so it isn't filled.` });
      return;
    }
    const best = bench
      .filter((b) => !used.has(b) && players[b] && slotAccepts(slot, eligiblePositions(players[b]!)) && valueOf(b))
      .sort((a, b) => valueOf(b)!.raw - valueOf(a)!.raw || players[a]!.name.localeCompare(players[b]!.name) || a.localeCompare(b))[0];
    if (!best) {
      fills.push({ slotIndex: i, slot, playerId: null, reason: 'Empty in Sleeper. No bench player with a market value can fill this slot.' });
      return;
    }
    used.add(best);
    fills.push({ slotIndex: i, slot, playerId: best, reason: 'Empty in Sleeper. Shown: the eligible bench player with the highest market value (not projected points). Nothing is changed in Sleeper.' });
  });
  return fills;
}

const ORDER = ['QB', 'RB', 'WR', 'TE'];
const groupRank = (pos: string | null) => {
  const i = ORDER.indexOf(pos ?? '');
  return i >= 0 ? i : pos ? ORDER.length : ORDER.length + 1;
};

export interface PositionGroup {
  position: string;
  players: RosterEntry[];
}

/**
 * Groups players by Sleeper position (QB, RB, WR, TE, then other positions alphabetically, then
 * unknown), highest value first within each group; players without a value last, by name.
 */
export function groupByPosition(entries: RosterEntry[], valueOf: ValueOf | null): PositionGroup[] {
  const v = (e: RosterEntry) => valueOf?.(e.playerId)?.raw ?? null;
  const sorted = [...entries].sort((a, b) => {
    const g = groupRank(a.position) - groupRank(b.position) || (a.position ?? '').localeCompare(b.position ?? '');
    if (g) return g;
    const va = v(a);
    const vb = v(b);
    if (va !== null && vb !== null && va !== vb) return vb - va;
    if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
    return a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId);
  });
  const groups: PositionGroup[] = [];
  for (const e of sorted) {
    const pos = e.position ?? 'Unknown';
    const last = groups[groups.length - 1];
    if (last && last.position === pos) last.players.push(e);
    else groups.push({ position: pos, players: [e] });
  }
  return groups;
}
