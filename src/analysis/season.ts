// Where a league is in its season, from its Sleeper settings and records. Pure functions.
// Playoff/start-week/median/deadline settings are present in Sleeper's league data but not
// documented, so anything missing is reported rather than guessed.
import type { SleeperLeague, SleeperRoster } from '../api/types';

export type Phase = 'not_started' | 'regular' | 'over' | 'unknown';

export interface SeasonInfo {
  phase: Phase;
  playoffTeams: number | null;
  playoffWeekStart: number | null;
  startWeek: number;
  /** Regular-season weeks in total (null if the playoff start week is unknown). */
  regularWeeks: number | null;
  /** 2 when each week also counts a game against the league median. */
  gamesPerWeek: 1 | 2;
  weeksScored: number;
  weeksRemaining: number;
  gamesRemaining: number;
  /** null = no deadline (99) or not provided. */
  tradeDeadline: number | null;
  deadlinePassed: boolean;
  /** Settings Sleeper didn't provide. */
  missing: string[];
}

const games = (r: SleeperRoster) => (r.settings?.wins ?? 0) + (r.settings?.losses ?? 0) + (r.settings?.ties ?? 0);

export function seasonInfo(league: SleeperLeague, rosters: SleeperRoster[], currentWeek: number): SeasonInfo {
  const s = league.settings ?? {};
  const missing: string[] = [];
  const playoffTeams = typeof s.playoff_teams === 'number' && s.playoff_teams > 0 ? s.playoff_teams : null;
  const playoffWeekStart = typeof s.playoff_week_start === 'number' && s.playoff_week_start > 1 ? s.playoff_week_start : null;
  if (playoffTeams === null) missing.push('number of playoff teams');
  if (playoffWeekStart === null) missing.push('playoff start week');
  const startWeek = typeof s.start_week === 'number' && s.start_week >= 1 ? s.start_week : 1;
  const gamesPerWeek: 1 | 2 = s.league_average_match === 1 ? 2 : 1;

  const maxGames = rosters.reduce((m, r) => Math.max(m, games(r)), 0);
  const weeksScored = Math.round(maxGames / gamesPerWeek);
  const regularWeeks = playoffWeekStart === null ? null : playoffWeekStart - startWeek;
  const weeksRemaining = regularWeeks === null ? 0 : Math.max(0, regularWeeks - weeksScored);

  const deadline = typeof s.trade_deadline === 'number' && s.trade_deadline < 99 ? s.trade_deadline : null;

  let phase: Phase;
  if (league.status === 'pre_draft' || league.status === 'drafting') phase = 'not_started';
  else if (league.status === 'complete' || league.status === 'post_season') phase = 'over';
  else if (missing.length) phase = 'unknown';
  else if (weeksScored === 0) phase = 'not_started';
  else if (weeksRemaining === 0) phase = 'over';
  else phase = 'regular';

  return {
    phase,
    playoffTeams,
    playoffWeekStart,
    startWeek,
    regularWeeks,
    gamesPerWeek,
    weeksScored,
    weeksRemaining,
    gamesRemaining: weeksRemaining * gamesPerWeek,
    tradeDeadline: deadline,
    deadlinePassed: deadline !== null && currentWeek > deadline,
    missing,
  };
}
