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
    // Observed in live data but not documented by Sleeper:
    playoff_teams?: number;
    playoff_week_start?: number;
    start_week?: number;
    /** 1 = each week also counts a win/loss against the league median. */
    league_average_match?: number;
    /** Last week trades are allowed; 99 appears to mean "no deadline". */
    trade_deadline?: number;
    draft_rounds?: number;
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
  /** Documented record fields; points are split into whole and hundredths parts. */
  settings?: {
    wins?: number;
    losses?: number;
    ties?: number;
    fpts?: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
  } | null;
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
  /** Shown in Sleeper's docs example; how it's calculated isn't documented. */
  age?: number | null;
  /** Place on the NFL team's depth chart (1 = first); in Sleeper's documented player example. */
  depth_chart_order?: number | null;
}

/** GET /league/<id>/traded_picks. All IDs are roster IDs. */
export interface SleeperTradedPick {
  season: string;
  round: number;
  /** Roster ID of the ORIGINAL owner. */
  roster_id: number;
  previous_owner_id: number;
  /** Roster ID of the current owner. */
  owner_id: number;
}

/** GET /league/<id>/transactions/<week>. Only the fields the app reads. */
export interface SleeperTransaction {
  transaction_id: string;
  type: string;
  status: string;
  roster_ids: number[] | null;
  leg?: number;
  created?: number;
}

/** `/players/nfl` returns an object keyed by player ID. */
export type SleeperPlayerMap = Record<string, SleeperPlayer>;
