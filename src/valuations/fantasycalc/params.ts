// Maps a Sleeper league's real settings to FantasyCalc /values/current query parameters.
// Shared by the browser app and the scheduled job (Node), so value imports use ".ts" extensions.
//
// Allowed values come from https://fantasycalc.com/api-docs (checked 2026-10-25). The TE-premium
// tiers follow FantasyCalc's own site logic: 2+ TE starters or > +1.0 → te++; ≥ +0.5 → te+;
// ≤ +0.25 → none. Anything that doesn't fit is reported as unsupported — never rounded.
import type { SleeperLeague } from '../../api/types';

export type FcTep = 'none' | 'te+' | 'te++';

export interface FcParams {
  isDynasty: boolean;
  numQbs: 1 | 2;
  numTeams: 8 | 10 | 12 | 14;
  ppr: 0 | 0.5 | 1;
  tep: FcTep;
}

export type FcMapping =
  | { ok: true; params: FcParams; key: string; notes: string[] }
  | { ok: false; reasons: string[]; notes: string[] };

const TEAM_COUNTS = [8, 10, 12, 14] as const;
const PPR_VALUES = [0, 0.5, 1] as const;

const includes = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

export function paramKey(p: FcParams): string {
  const tep = p.tep === 'none' ? 'tenone' : p.tep === 'te+' ? 'teplus' : 'teplusplus';
  return `${p.isDynasty ? 'dynasty' : 'redraft'}-${p.numQbs}qb-${p.numTeams}tm-ppr${p.ppr}-${tep}`;
}

export function paramsQuery(p: FcParams): string {
  const q = new URLSearchParams({
    isDynasty: String(p.isDynasty),
    numQbs: String(p.numQbs),
    numTeams: String(p.numTeams),
    ppr: String(p.ppr),
    tep: p.tep,
  });
  return q.toString();
}

export function describeParams(p: FcParams): string {
  const tep = p.tep === 'none' ? 'no TE premium' : p.tep === 'te+' ? 'TE+' : 'TE++';
  return [p.isDynasty ? 'Dynasty' : 'Redraft', p.numQbs === 2 ? 'Superflex/2QB' : '1QB', `${p.numTeams} teams`, `PPR ${p.ppr}`, tep].join(' · ');
}

export function mapLeagueToFcParams(league: SleeperLeague): FcMapping {
  const positions = league.roster_positions ?? [];
  const scoring = league.scoring_settings ?? {};
  const settings = league.settings ?? {};
  const reasons: string[] = [];
  const notes: string[] = [];

  let isDynasty: boolean | null = null;
  if (settings.type === 2) isDynasty = true;
  else if (settings.type === 0) isDynasty = false;
  else if (settings.type === 1) reasons.push('Keeper league: FantasyCalc only offers dynasty or redraft values.');
  else reasons.push('Unknown league type.');

  const qbSlots = positions.filter((p) => p === 'QB').length;
  const numQbs: 1 | 2 = positions.includes('SUPER_FLEX') || qbSlots >= 2 ? 2 : 1;

  const numTeams = league.total_rosters;
  if (!includes(TEAM_COUNTS, numTeams)) reasons.push(`${numTeams}-team league: FantasyCalc supports 8, 10, 12 or 14 teams.`);

  const rec = scoring.rec ?? 0;
  if (!includes(PPR_VALUES, rec)) reasons.push(`${rec} points per reception: FantasyCalc supports 0, 0.5 or 1.`);

  const teBonus = scoring.bonus_rec_te ?? 0;
  const teStarters = positions.filter((p) => p === 'TE').length;
  let tep: FcTep | null;
  if (teStarters >= 2 || teBonus > 1) {
    tep = 'te++';
    notes.push(`TE premium (+${teBonus}/catch, ${teStarters} TE slot${teStarters === 1 ? '' : 's'}) uses FantasyCalc's te++ tier (2+ TE starters or more than +1.0).`);
  } else if (teBonus >= 0.5) {
    tep = 'te+';
    notes.push(`TE premium +${teBonus}/catch uses FantasyCalc's te+ tier, which covers +0.5 to +1.0.`);
  } else if (teBonus <= 0.25) {
    tep = 'none';
    if (teBonus > 0) notes.push(`TE premium +${teBonus}/catch is treated as none (FantasyCalc: +0.25 or less).`);
  } else {
    tep = null;
    reasons.push(`TE premium +${teBonus}/catch falls between FantasyCalc's tiers (none ≤ +0.25, te+ ≥ +0.5).`);
  }

  // Settings FantasyCalc has no parameter for. Accepted with visible notes (DECISIONS.md, 2026-10-25).
  if (settings.best_ball === 1) notes.push('Best ball league: FantasyCalc values assume managed lineups.');
  if (scoring.pass_td !== undefined) notes.push(`Passing TDs are worth ${scoring.pass_td} pts here; FantasyCalc has no passing-TD setting.`);
  const hasBonuses = Object.entries(scoring).some(
    ([k, v]) => !!v && ((k.startsWith('bonus_') && k !== 'bonus_rec_te') || k === 'rush_fd' || k === 'rec_fd' || k === 'pass_fd'),
  );
  if (hasBonuses) notes.push("Yardage and first-down bonuses aren't modeled by FantasyCalc.");
  const starters = positions.filter((p) => p !== 'BN').length;
  notes.push(`Lineup size (${starters} starters) isn't a FantasyCalc setting.`);

  if (reasons.length || isDynasty === null || tep === null || !includes(TEAM_COUNTS, numTeams) || !includes(PPR_VALUES, rec)) {
    return { ok: false, reasons, notes };
  }
  const params: FcParams = { isDynasty, numQbs, numTeams, ppr: rec, tep };
  return { ok: true, params, key: paramKey(params), notes };
}
