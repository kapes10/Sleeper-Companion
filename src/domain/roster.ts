import type { SleeperLeagueUser, SleeperRoster } from '../api/types';
import type { PlayerIndex } from './players';

// ---------- Owner-to-roster mapping ----------

export type OwnerRosterResult =
  | { kind: 'found'; roster: SleeperRoster; role: 'owner' | 'co-owner' }
  | { kind: 'not_found' }
  | { kind: 'ambiguous'; rosterIds: number[] };

/**
 * Finds the roster belonging to `userId` using the stable Sleeper user ID.
 * Never guesses: if no roster or more than one roster matches, the caller must show that.
 */
export function findOwnerRoster(rosters: SleeperRoster[], userId: string): OwnerRosterResult {
  const owned = rosters.filter((r) => r.owner_id === userId);
  const coOwned = rosters.filter((r) => r.owner_id !== userId && (r.co_owners ?? []).includes(userId));
  const matches = [...owned, ...coOwned];
  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length > 1) return { kind: 'ambiguous', rosterIds: matches.map((r) => r.roster_id) };
  const roster = matches[0]!;
  return { kind: 'found', roster, role: owned.length ? 'owner' : 'co-owner' };
}

export function teamName(users: SleeperLeagueUser[], ownerId: string | null): string | null {
  const user = users.find((u) => u.user_id === ownerId);
  if (!user) return null;
  return user.metadata?.team_name?.trim() || user.display_name || null;
}

// ---------- Roster view ----------

export interface RosterEntry {
  playerId: string;
  /** Player name, or a clear placeholder when the ID isn't in the player dataset. */
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  /** True when the ID was not found in the cached player dataset. */
  unknown: boolean;
}

export interface StarterEntry {
  slot: string;
  /** null = the slot is empty in Sleeper. */
  player: RosterEntry | null;
}

export interface RosterView {
  starters: StarterEntry[];
  bench: RosterEntry[];
  reserve: RosterEntry[];
  taxi: RosterEntry[];
  unknownPlayerIds: string[];
}

const SLOT_LABELS: Record<string, string> = {
  SUPER_FLEX: 'SF',
  FLEX: 'FLEX',
  REC_FLEX: 'W/T',
  WRRB_FLEX: 'W/R',
  IDP_FLEX: 'IDP',
};

export function slotLabel(slot: string): string {
  return SLOT_LABELS[slot] ?? slot;
}

function entry(id: string, players: PlayerIndex): RosterEntry {
  const p = players[id];
  if (!p) {
    return { playerId: id, name: `Unknown player (ID ${id})`, position: null, team: null, injuryStatus: null, unknown: true };
  }
  return { playerId: id, name: p.name, position: p.position, team: p.team, injuryStatus: p.injuryStatus, unknown: false };
}

/**
 * Splits a roster into starters (labelled by lineup slot), bench, IR and taxi.
 * Sleeper's `starters` array lines up with the non-bench `roster_positions`; "0" = empty slot.
 * Bench = all players not starting, not on IR, not on taxi.
 */
export function buildRosterView(roster: SleeperRoster, rosterPositions: string[], players: PlayerIndex): RosterView {
  const slots = rosterPositions.filter((p) => p !== 'BN');
  const starterIds = roster.starters ?? [];
  const reserveIds = roster.reserve ?? [];
  const taxiIds = roster.taxi ?? [];

  const starters: StarterEntry[] = slots.map((slot, i) => {
    const id = starterIds[i];
    return { slot: slotLabel(slot), player: id && id !== '0' ? entry(id, players) : null };
  });

  const notBench = new Set([...starterIds, ...reserveIds, ...taxiIds]);
  const benchIds = (roster.players ?? []).filter((id) => !notBench.has(id));

  const view: RosterView = {
    starters,
    bench: benchIds.map((id) => entry(id, players)),
    reserve: reserveIds.map((id) => entry(id, players)),
    taxi: taxiIds.map((id) => entry(id, players)),
    unknownPlayerIds: [],
  };
  const all = [...view.starters.map((s) => s.player), ...view.bench, ...view.reserve, ...view.taxi];
  view.unknownPlayerIds = all.filter((e): e is RosterEntry => !!e && e.unknown).map((e) => e.playerId);
  return view;
}
