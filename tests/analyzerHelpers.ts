// Test-only: REDACTED real Sleeper data from four of the owner's leagues, captured 2026-10-25
// (week 7) by scripts/capture-analyzer-fixtures.mjs.
//   A = standard-lineup dynasty (owner 4-2)      B = best ball dynasty (owner 0-6)
//   C = best ball with median games (owner 12-0) D = 10-team dynasty (owner 4-2)
import { readFileSync } from 'node:fs';
import type { SleeperLeague, SleeperLeagueUser, SleeperPlayerMap, SleeperRoster, SleeperTradedPick, SleeperTransaction } from '../src/api/types';
import { toPlayerIndex } from '../src/domain/players';
import type { AnalyzerInput } from '../src/analysis/tiers';

export type Letter = 'A' | 'B' | 'C' | 'D';
const read = <T>(path: string): T => JSON.parse(readFileSync(`tests/fixtures/analyzer/${path}`, 'utf8')) as T;

export const AZ_OWNER = '100000000000000001';
export const azState = read<{ week: number; league_season: string; season: string }>('nfl_state.json');
export const azPlayersRaw = read<SleeperPlayerMap>('players.json');
export const azPlayers = toPlayerIndex(azPlayersRaw);

export function azLeague(letter: Letter) {
  return {
    league: read<SleeperLeague>(`league-${letter}/league.json`),
    rosters: read<SleeperRoster[]>(`league-${letter}/rosters.json`),
    users: read<SleeperLeagueUser[]>(`league-${letter}/users.json`),
    tradedPicks: read<SleeperTradedPick[]>(`league-${letter}/traded_picks.json`),
    transactions: read<SleeperTransaction[]>(`league-${letter}/transactions.json`),
  };
}

/** Analyzer input for a fixture league; `change` edits a deep copy (for derived edge cases). */
export function azInput(letter: Letter, change?: (d: ReturnType<typeof azLeague>) => void): AnalyzerInput {
  const d = structuredClone(azLeague(letter));
  change?.(d);
  return { league: d.league, rosters: d.rosters, tradedPicks: d.tradedPicks, recentTransactions: d.transactions, players: azPlayers, currentWeek: azState.week };
}

export const ownerRosterId = (letter: Letter) => azLeague(letter).rosters.find((r) => r.owner_id === AZ_OWNER)!.roster_id;

/** Sets every roster's record to `weeks` games (alternating wins/losses by roster), for early-season cases. */
export function setWeeksPlayed(rosters: SleeperRoster[], weeks: number) {
  rosters.forEach((r, i) => {
    const wins = Math.min(weeks, Math.floor((i * weeks) / rosters.length + (i % 2)));
    r.settings = { ...r.settings, wins, losses: weeks - wins, ties: 0 };
  });
}
