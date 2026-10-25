import type { SleeperLeague } from '../api/types';

// Descriptive labels only. These summarise the league's actual Sleeper settings; they are
// not used for any calculation.

export interface LeagueSummary {
  id: string;
  name: string;
  season: string;
  status: string;
  teams: number;
  /** e.g. "Dynasty · Best Ball · Superflex" */
  format: string;
  /** e.g. "PPR · TE +1.0/rec · 6pt pass TD" */
  scoring: string;
  starterSlots: number;
  benchSlots: number;
  reserveSlots: number;
  taxiSlots: number;
  /** Active roster size = starters + bench (IR and taxi listed separately). */
  rosterSize: number;
  isBestBall: boolean;
  /** Settings this app knows it does not support (e.g. IDP). Shown as warnings. */
  unsupported: string[];
}

const LEAGUE_TYPES: Record<number, string> = { 0: 'Redraft', 1: 'Keeper', 2: 'Dynasty' };
const IDP_SLOTS = new Set(['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'IDP_FLEX']);

export function receptionLabel(rec: number | undefined): string {
  if (rec === undefined || rec === 0) return 'Standard (no PPR)';
  if (rec === 1) return 'PPR';
  if (rec === 0.5) return 'Half PPR';
  return `${rec} pts/rec`;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function summarizeLeague(league: SleeperLeague): LeagueSummary {
  const positions = league.roster_positions ?? [];
  const scoring = league.scoring_settings ?? {};
  const settings = league.settings ?? {};
  const isBestBall = settings.best_ball === 1;
  const qbSlots = positions.filter((p) => p === 'QB').length;
  const superflex = positions.includes('SUPER_FLEX');

  const formatParts = [LEAGUE_TYPES[settings.type ?? -1] ?? 'Unknown league type'];
  if (isBestBall) formatParts.push('Best Ball');
  if (superflex) formatParts.push('Superflex');
  else if (qbSlots >= 2) formatParts.push(`${qbSlots}QB`);
  else if (qbSlots === 1) formatParts.push('1QB');

  const scoringParts = [receptionLabel(scoring.rec)];
  const tePremium = scoring.bonus_rec_te;
  if (tePremium) scoringParts.push(`TE +${formatNumber(tePremium)}/rec`);
  if (scoring.pass_td !== undefined) scoringParts.push(`${scoring.pass_td}pt pass TD`);

  const starterSlots = positions.filter((p) => p !== 'BN').length;
  const benchSlots = positions.filter((p) => p === 'BN').length;

  const unsupported: string[] = [];
  if (league.sport && league.sport !== 'nfl') unsupported.push(`Sport "${league.sport}"`);
  if (positions.some((p) => IDP_SLOTS.has(p))) unsupported.push('IDP lineup slots');
  if (settings.type === undefined || !(settings.type in LEAGUE_TYPES)) unsupported.push('Unknown league type');

  return {
    id: league.league_id,
    name: league.name,
    season: league.season,
    status: league.status,
    teams: league.total_rosters,
    format: formatParts.join(' · '),
    scoring: scoringParts.join(' · '),
    starterSlots,
    benchSlots,
    reserveSlots: settings.reserve_slots ?? 0,
    taxiSlots: settings.taxi_slots ?? 0,
    rosterSize: starterSlots + benchSlots,
    isBestBall,
    unsupported,
  };
}

const STATUS_LABELS: Record<string, string> = {
  pre_draft: 'Pre-draft',
  drafting: 'Drafting',
  in_season: 'In season',
  post_season: 'Postseason',
  complete: 'Complete',
};

export function leagueStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
