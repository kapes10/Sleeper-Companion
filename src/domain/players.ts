import type { SleeperPlayer, SleeperPlayerMap } from '../api/types';

/** The slim player record we keep in the 24-hour cache (the full dataset is ~15 MB). */
export interface Player {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  fantasyPositions: string[];
  status: string | null;
  injuryStatus: string | null;
}

export type PlayerIndex = Record<string, Player>;

export function playerName(p: SleeperPlayer): string {
  const full = p.full_name?.trim();
  if (full) return full;
  // Team defenses have no full_name: "Philadelphia" + "Eagles".
  const joined = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return joined || `Unknown player (${p.player_id})`;
}

export function toPlayerIndex(raw: SleeperPlayerMap): PlayerIndex {
  const out: PlayerIndex = {};
  for (const [id, p] of Object.entries(raw)) {
    if (!p) continue;
    out[id] = {
      id,
      name: playerName({ ...p, player_id: p.player_id ?? id }),
      position: p.position ?? null,
      team: p.team ?? null,
      fantasyPositions: p.fantasy_positions ?? [],
      status: p.status ?? null,
      injuryStatus: p.injury_status ?? null,
    };
  }
  return out;
}
