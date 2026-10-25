// Recommended stance for the owner's team (approved 2026-10-25). Pure function.
import type { OwnerRosterResult } from '../domain/roster';
import type { LeagueAnalysis, TeamAnalysis, Tier } from './tiers';

export type Stance = 'buy' | 'hold' | 'sell';

export type StanceResult =
  | { kind: 'recommendation'; stance: Stance; team: TeamAnalysis; headline: string; reasons: string[] }
  /** Tiered, but the data doesn't support a confident call; the leaning is shown. */
  | { kind: 'insufficient'; leaning: Stance; team: TeamAnalysis; headline: string; reasons: string[] }
  /** No stance at all (team not identified, no tiers, trade deadline passed). */
  | { kind: 'unavailable'; team: TeamAnalysis | null; headline: string; reasons: string[] };

const STANCE: Record<Tier, Stance> = { contender: 'buy', bubble: 'hold', seller: 'sell', deep_rebuild: 'sell' };

export function stanceLabel(tier: Tier, stance: Stance): string {
  if (tier === 'deep_rebuild') return 'Sell veterans for youth and picks';
  return stance === 'buy' ? 'Buy' : stance === 'hold' ? 'Hold' : 'Sell';
}

export function recommendStance(analysis: LeagueAnalysis, mine: OwnerRosterResult): StanceResult {
  if (mine.kind === 'not_found') return { kind: 'unavailable', team: null, headline: "Your team wasn't found in this league.", reasons: [] };
  if (mine.kind === 'ambiguous') {
    return {
      kind: 'unavailable',
      team: null,
      headline: 'You appear on more than one roster in this league, so no team is treated as yours.',
      reasons: [`Rosters ${mine.rosterIds.join(', ')}.`],
    };
  }
  if (!analysis.teams) return { kind: 'unavailable', team: null, headline: 'No recommendation right now.', reasons: [analysis.noTiersReason ?? ''] };
  const team = analysis.teams.find((t) => t.rosterId === mine.roster.roster_id) ?? null;
  if (!team) {
    const ex = analysis.excluded.find((e) => e.rosterId === mine.roster.roster_id);
    return { kind: 'unavailable', team: null, headline: 'Your team could not be analyzed.', reasons: ex ? [ex.reason] : [] };
  }

  const stance = STANCE[team.tier];
  const reasons = [team.reason + '.', ...team.details];
  if (analysis.season.deadlinePassed) {
    return {
      kind: 'unavailable',
      team,
      headline: `The trade deadline (week ${analysis.season.tradeDeadline}) has passed, so trades are closed.`,
      reasons,
    };
  }
  if (analysis.season.tradeDeadline !== null) reasons.push(`Trade deadline: week ${analysis.season.tradeDeadline}.`);
  if (team.confidence === 'low') {
    return {
      kind: 'insufficient',
      leaning: stance,
      team,
      headline: `Not enough data for a confident recommendation. Leaning: ${stanceLabel(team.tier, stance)}.`,
      reasons,
    };
  }
  return { kind: 'recommendation', stance, team, headline: stanceLabel(team.tier, stance), reasons };
}
