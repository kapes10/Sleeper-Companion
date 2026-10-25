// Shapes of the documented Sleeper public API responses (https://docs.sleeper.com/).
// Only fields this app reads are typed; Sleeper may send more. Fields are marked optional
// or nullable wherever live responses have shown them to be missing or null.

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperNflState {
  week: number;
  season: string;
  season_type: string;
  /** The season Sleeper uses for leagues; can differ from `season` around the offseason. */
  league_season: string;
  display_week: number;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  sport: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number | undefined>;
  settings: {
    /** 0 = redraft, 1 = keeper, 2 = dynasty (observed in live data). */
    type?: number;
    best_ball?: number;
    reserve_slots?: number;
    taxi_slots?: number;
    [key: string]: unknown;
  };
}

export interface SleeperRoster {
  roster_id: number;
  league_id: string;
  owner_id: string | null;
  co_owners?: string[] | null;
  /** Player IDs aligned with the non-bench `roster_positions`; "0" marks an empty slot. */
  starters: string[] | null;
  players: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string } | null;
}

export interface SleeperPlayer {
  player_id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  status?: string | null;
  injury_status?: string | null;
}

/** `/players/nfl` returns an object keyed by player ID. */
export type SleeperPlayerMap = Record<string, SleeperPlayer>;
