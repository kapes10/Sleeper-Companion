// Lineup slot rules for positional market-value analysis (DECISIONS.md, 2026-10-26).
// Only slot types confirmed in the owner's leagues are supported; anything else is reported as
// unsupported and never treated as a FLEX.
import type { Player } from '../../domain/players';

export const ANALYZED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type Position = (typeof ANALYZED_POSITIONS)[number];

/** Which player positions each supported lineup slot accepts. */
export const SLOT_ACCEPTS: Record<string, readonly Position[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};

const isAnalyzed = (p: string): p is Position => (ANALYZED_POSITIONS as readonly string[]).includes(p);

/** Lineup slots in a league (bench excluded), and any slot types the model doesn't understand. */
export function lineupSlots(rosterPositions: string[]): { slots: string[]; unsupported: string[] } {
  const slots = rosterPositions.filter((p) => p !== 'BN');
  const unsupported = [...new Set(slots.filter((s) => !(s in SLOT_ACCEPTS)))];
  return { slots, unsupported };
}

/** Sleeper's eligible positions for a player, limited to the analyzed positions. */
export function eligiblePositions(player: Pick<Player, 'position' | 'fantasyPositions'>): Position[] {
  const list = player.fantasyPositions.length ? player.fantasyPositions : player.position ? [player.position] : [];
  return [...new Set(list.filter(isAnalyzed))];
}

export function slotAccepts(slot: string, eligible: Position[]): boolean {
  const accepts = SLOT_ACCEPTS[slot];
  return !!accepts && eligible.some((p) => accepts.includes(p));
}

/**
 * The position a player's value is counted under: their Sleeper position if it is analyzed,
 * otherwise the first analyzed position they're eligible for (e.g. Travis Hunter, DB eligible
 * at DB/WR → WR). Null = not analyzed (e.g. kickers).
 */
export function countedPosition(player: Pick<Player, 'position' | 'fantasyPositions'>): Position | null {
  if (player.position && isAnalyzed(player.position)) return player.position;
  return eligiblePositions(player)[0] ?? null;
}
