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

// ---------- Real FantasyCalc values for the analyzer fixture leagues (published 2026-10-26) ----------
import { parseFcResponse } from '../src/valuations/fantasycalc/parse';
import { matchValues, type PlayerValue } from '../src/valuations/match';

export const AZ_FC_KEY: Record<Letter, string> = {
  A: 'dynasty-2qb-12tm-ppr1-teplus',
  B: 'dynasty-2qb-12tm-ppr1-teplus',
  C: 'dynasty-2qb-12tm-ppr1-teplus',
  D: 'dynasty-2qb-10tm-ppr1-teplus',
};
export const azFcText = (key: string) => readFileSync(`tests/fixtures/analyzer/fantasycalc-${key}.trimmed.json`, 'utf8');

/** Matched values (Sleeper ID → value, scaled 0–100) for a fixture league's format. */
export function azValues(letter: Letter): Map<string, PlayerValue> {
  const parsed = parseFcResponse(JSON.parse(azFcText(AZ_FC_KEY[letter])));
  if (!parsed.ok) throw new Error(parsed.error);
  const rows = parsed.players.map((p) => ({ sleeperId: p.sleeperId, name: p.name, position: p.position, team: p.team, value: p.value }));
  return matchValues(rows, azPlayers).bySleeperId;
}

// ---------- Stage 5: full partner-matching input for a fixture league ----------
import { analyzeLeague as _analyzeLeague } from '../src/analysis/tiers';
import { recommendStance as _recommendStance } from '../src/analysis/stance';
import { analyzePositions as _analyzePositions } from '../src/analysis/positional/positional';
import { findOwnerRoster as _findOwnerRoster, teamName as _teamName } from '../src/domain/roster';
import type { PartnerInput } from '../src/analysis/partners';

/** Real FantasyCalc pick values from the fixture snapshot for a league's format. */
export function azFcPicks(letter: Letter) {
  const parsed = parseFcResponse(JSON.parse(azFcText(AZ_FC_KEY[letter])));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.picks;
}

/** Everything matchPartners needs for a fixture league (fresh objects each call, safe to modify). */
export function azPartnerInput(letter: Letter, change?: Parameters<typeof azInput>[1]): PartnerInput {
  const input = azInput(letter, change);
  const d = azLeague(letter);
  const analysis = _analyzeLeague(input);
  const mine = _findOwnerRoster(input.rosters, AZ_OWNER);
  return {
    league: input.league,
    analysis,
    stance: _recommendStance(analysis, mine),
    mine,
    positional: _analyzePositions({ league: input.league, rosters: input.rosters, players: azPlayers, values: azValues(letter) }),
    fcPicks: azFcPicks(letter),
    protectedIds: new Set(),
    nameOf: (rosterId) => _teamName(d.users, input.rosters.find((r) => r.roster_id === rosterId)?.owner_id ?? null) ?? `Team ${rosterId}`,
    currentWeek: input.currentWeek,
  };
}
