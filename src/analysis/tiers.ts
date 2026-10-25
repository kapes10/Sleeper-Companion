// Team Analyzer tiers and confidence, exactly as approved in TRADE_LOGIC.md ("Team Analyzer",
// 2026-10-25). Deterministic and UI-free: every team's result carries the reasons behind it.
import type { SleeperLeague, SleeperRoster, SleeperTradedPick, SleeperTransaction } from '../api/types';
import type { PlayerIndex } from '../domain/players';
import { seasonInfo, type SeasonInfo } from './season';
import { pickBalances, rosterAge, median, tradeCounts, type FuturePick } from './signals';
import { buildStandings, formatRecord, gamesBack, type TeamRecord } from './standings';

export type Tier = 'contender' | 'bubble' | 'seller' | 'deep_rebuild';
export type Confidence = 'high' | 'medium' | 'low';
export type Logic = 'dynasty' | 'keeper' | 'redraft';

export const TIER_ORDER: Tier[] = ['contender', 'bubble', 'seller', 'deep_rebuild'];

/** Approved thresholds. */
export const RULES = {
  contenderMinGamesClear: 1,
  reachMinGames: 1,
  reachShareOfRemaining: 0.25,
  farOutShareOfRemaining: 0.5,
  youngYearsBelowLeague: 1,
  deepRebuildMinNetPicks: 2,
  highMarginGames: 1,
  mediumMarginGames: 0.5,
  lowCapMaxWeeks: 2,
  mediumCapMaxWeeks: 4,
} as const;

export interface AnalyzerInput {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  tradedPicks: SleeperTradedPick[];
  /** Transactions from the recent weeks only (used for "recent trades" context). */
  recentTransactions: SleeperTransaction[];
  players: PlayerIndex;
  /** NFL week from Sleeper's /state/nfl. */
  currentWeek: number;
}

export interface TeamAnalysis {
  rosterId: number;
  record: TeamRecord;
  tier: Tier;
  confidence: Confidence;
  /** Games past the line that decided the tier (Infinity when no line applies). */
  marginGames: number;
  /** True when a tiebreaker decides which side of the playoff line the team is on. */
  tiebreak: boolean;
  inPlayoffSpot: boolean;
  /** Games ahead of the first team out (teams in a playoff spot). */
  gamesClear: number | null;
  /** Games behind the last playoff seed (teams out of a spot). */
  gamesBack: number | null;
  ageMedian: number | null;
  /** Future 1st/2nd-round picks gained minus given; null in redraft. */
  netPicks12: number | null;
  futurePicks: FuturePick[] | null;
  recentTrades: number;
  /** One-line plain-English reason. */
  reason: string;
  /** Fuller explanation, including what decided the confidence. */
  details: string[];
}

export interface Excluded {
  rosterId: number;
  record: TeamRecord;
  reason: string;
}

export interface LeagueAnalysis {
  logic: Logic | null;
  season: SeasonInfo;
  standings: TeamRecord[];
  /** Null when tiers aren't calculated; `noTiersReason` says why. */
  teams: TeamAnalysis[] | null;
  noTiersReason: string | null;
  excluded: Excluded[];
  leagueMedianAge: number | null;
  pickSeasons: string[];
  reach: number;
  farOut: number;
  lastInRosterId: number | null;
  firstOutRosterId: number | null;
  /** Assumptions the user should know about. */
  assumptions: string[];
}

const LOGIC_BY_TYPE: Record<number, Logic> = { 0: 'redraft', 1: 'keeper', 2: 'dynasty' };

export function formatGames(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v} game${v === 1 ? '' : 's'}`;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

export function confidenceFromMargin(margin: number, tiebreak: boolean, weeksScored: number): Confidence {
  let c: Confidence = tiebreak ? 'low' : margin >= RULES.highMarginGames ? 'high' : margin >= RULES.mediumMarginGames ? 'medium' : 'low';
  if (weeksScored <= RULES.lowCapMaxWeeks) c = 'low';
  else if (weeksScored <= RULES.mediumCapMaxWeeks && c === 'high') c = 'medium';
  return c;
}

export function analyzeLeague(input: AnalyzerInput): LeagueAnalysis {
  const { league, rosters, players } = input;
  const season = seasonInfo(league, rosters, input.currentWeek);
  const standings = buildStandings(rosters);
  const logic = LOGIC_BY_TYPE[league.settings?.type ?? -1] ?? null;
  const usesFuture = logic === 'dynasty' || logic === 'keeper';

  const assumptions = [
    'Standings are ordered by win percentage, then points for. Sleeper does not publish its tiebreakers.',
    "Playoff spots, playoff start week, median games and trade deadline come from league settings Sleeper provides but doesn't document.",
  ];
  if (season.gamesPerWeek === 2) assumptions.push('This league also counts a game against the league median each week, so records and games remaining are doubled.');

  const base: Omit<LeagueAnalysis, 'teams' | 'noTiersReason' | 'excluded'> = {
    logic,
    season,
    standings,
    leagueMedianAge: null,
    pickSeasons: [],
    reach: 0,
    farOut: 0,
    lastInRosterId: null,
    firstOutRosterId: null,
    assumptions,
  };
  if (logic === null) {
    const reason = 'This league type is not recognised, so no tiers are calculated.';
    return { ...base, teams: null, noTiersReason: reason, excluded: [] };
  }
  if (season.phase !== 'regular') {
    const reason =
      season.phase === 'not_started'
        ? "The season hasn't started (no games scored yet), so there is nothing to base tiers on."
        : season.phase === 'over'
          ? 'The regular season is over (playoffs or offseason). Tiers describe the race for a playoff spot, so they are not calculated now. Final standings are shown.'
          : `Sleeper didn't provide the ${season.missing.join(' and ')}, so the playoff line can't be worked out.`;
    return { ...base, teams: null, noTiersReason: reason, excluded: [] };
  }

  // Signals
  const ages = new Map(rosters.map((r) => [r.roster_id, rosterAge(r, players)]));
  const leagueMedianAge = usesFuture ? median([...ages.values()].map((a) => a.median).filter((m): m is number => m !== null)) : null;
  const draftRounds = typeof league.settings?.draft_rounds === 'number' ? league.settings.draft_rounds : null;
  const picks = usesFuture ? pickBalances(input.tradedPicks, rosters.map((r) => r.roster_id), league.season, draftRounds) : null;
  const trades = tradeCounts(input.recentTransactions);
  if (usesFuture) assumptions.push(`Future picks cover ${picks!.seasons.join('–')}: Sleeper only lists traded picks, so holdings are each team's own picks plus picks received minus picks traded away.`);

  // Playoff line (ownerless rosters stay in the standings)
  const P = Math.min(season.playoffTeams!, standings.length);
  const lastIn = standings[P - 1]!;
  const firstOut = standings[P] ?? null;
  const reach = Math.max(RULES.reachMinGames, season.gamesRemaining * RULES.reachShareOfRemaining);
  const farOut = season.gamesRemaining * RULES.farOutShareOfRemaining;
  const pfTopHalfCut = standings.length / 2;

  const teams: TeamAnalysis[] = [];
  const excluded: Excluded[] = [];

  for (const rec of standings) {
    if (!rec.ownerId) {
      excluded.push({ rosterId: rec.rosterId, record: rec, reason: 'No owner (abandoned roster). It still counts in the standings but is not sorted into a tier.' });
      continue;
    }
    if (!rec.hasRecord) {
      excluded.push({ rosterId: rec.rosterId, record: rec, reason: 'Sleeper sent no win/loss record for this team.' });
      continue;
    }

    const inSpot = rec.rank <= P;
    const pfTop = rec.pfRank <= pfTopHalfCut;
    const gamesClear = inSpot ? (firstOut ? gamesBack(rec, firstOut) : Infinity) : null;
    const back = inSpot ? null : gamesBack(lastIn, rec);
    const tiebreak = (gamesClear !== null && gamesClear === 0) || (back !== null && back === 0);

    const age = ages.get(rec.rosterId)!;
    const young = usesFuture && age.median !== null && leagueMedianAge !== null && age.median <= leagueMedianAge - RULES.youngYearsBelowLeague;
    const balance = picks?.byRoster.get(rec.rosterId) ?? null;
    const pickHeavy = !!balance && balance.net12 >= RULES.deepRebuildMinNetPicks;

    let tier: Tier;
    let margin: number;
    const decided: string[] = [];
    if (inSpot) {
      if (gamesClear! >= RULES.contenderMinGamesClear && pfTop) {
        tier = 'contender';
        margin = gamesClear! - RULES.contenderMinGamesClear;
        decided.push(gamesClear === Infinity ? 'Every team in this league makes the playoffs.' : `${formatGames(gamesClear!)} clear of the first team out (needs at least 1).`);
      } else {
        tier = 'bubble';
        const toContender = pfTop ? RULES.contenderMinGamesClear - gamesClear! : Infinity;
        const toSeller = gamesClear! + reach;
        margin = Math.min(toContender, toSeller);
        decided.push(pfTop ? `In a playoff spot but only ${formatGames(gamesClear!)} clear of the first team out (Contenders need at least 1).` : `In a playoff spot, but ${ordinal(rec.pfRank)} in points for (Contenders need the top half).`);
      }
    } else if (back! <= reach) {
      tier = 'bubble';
      margin = reach - back!;
      decided.push(`${formatGames(back!)} back of the last playoff spot, within reach (${formatGames(reach)} with ${season.gamesRemaining} games left).`);
    } else {
      const isFarOut = back! >= farOut;
      if (usesFuture && isFarOut && (young || pickHeavy)) {
        tier = 'deep_rebuild';
        margin = back! - farOut;
        decided.push(`${formatGames(back!)} back with ${season.gamesRemaining} games left (far out means at least ${formatGames(farOut)}).`);
      } else {
        tier = 'seller';
        const toBubble = back! - reach;
        const toDeep = usesFuture && (young || pickHeavy) ? farOut - back! : Infinity;
        margin = Math.min(toBubble, toDeep);
        decided.push(`${formatGames(back!)} back of the last playoff spot, beyond reach (${formatGames(reach)} with ${season.gamesRemaining} games left).`);
      }
    }
    if (young) decided.push(`Young roster: median age ${age.median} vs league ${leagueMedianAge}.`);
    if (pickHeavy) decided.push(`Gained ${balance!.net12} future 1st/2nd-round picks through trades.`);

    const confidence = confidenceFromMargin(margin, tiebreak, season.weeksScored);
    const confNote =
      season.weeksScored <= RULES.lowCapMaxWeeks
        ? `Low confidence: only ${season.weeksScored} week${season.weeksScored === 1 ? '' : 's'} played.`
        : tiebreak
          ? 'Low confidence: a tiebreaker decides which side of the playoff line this team is on.'
          : season.weeksScored <= RULES.mediumCapMaxWeeks && confidence === 'medium' && margin >= RULES.highMarginGames
            ? `Medium confidence at most: only ${season.weeksScored} weeks played.`
            : `${confidence[0]!.toUpperCase()}${confidence.slice(1)} confidence: ${margin === Infinity ? 'no line nearby' : `${formatGames(Math.max(0, margin))} past the line that decided this tier`}.`;

    const position = inSpot
      ? gamesClear === Infinity
        ? 'in a playoff spot'
        : gamesClear === 0
          ? 'tied with the first team out'
          : `${formatGames(gamesClear!)} clear of the cutoff`
      : back === 0
        ? 'tied with the last playoff seed'
        : `${formatGames(back!)} back of the cutoff`;
    const extras = [tier === 'deep_rebuild' && young ? 'young roster' : null, tier === 'deep_rebuild' && pickHeavy ? `+${balance!.net12} future 1st/2nds` : null].filter(Boolean);
    const reason = [formatRecord(rec), `${ordinal(rec.pfRank)} in points`, position, ...extras].join(', ');

    teams.push({
      rosterId: rec.rosterId,
      record: rec,
      tier,
      confidence,
      marginGames: margin,
      tiebreak,
      inPlayoffSpot: inSpot,
      gamesClear,
      gamesBack: back,
      ageMedian: usesFuture ? age.median : null,
      netPicks12: balance ? balance.net12 : null,
      futurePicks: balance?.owned ?? null,
      recentTrades: trades.get(rec.rosterId) ?? 0,
      reason,
      details: [...decided, confNote],
    });
  }

  return {
    ...base,
    teams,
    noTiersReason: null,
    excluded,
    leagueMedianAge,
    pickSeasons: picks?.seasons ?? [],
    reach,
    farOut,
    lastInRosterId: lastIn.rosterId,
    firstOutRosterId: firstOut?.rosterId ?? null,
  };
}
