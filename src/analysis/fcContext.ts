// FantasyCalc context for the Team Analyzer: display only, never used in the tier logic.
import type { SleeperRoster } from '../api/types';
import type { FcPickValue } from '../valuations/fantasycalc/parse';
import type { PlayerValue } from '../valuations/match';
import type { FuturePick } from './signals';

export interface TeamFcContext {
  /** Sum of FantasyCalc values for this roster's matched players. */
  rosterValue: number;
  playersValued: number;
  playersTotal: number;
  /** Sum of FantasyCalc's plain per-round values (e.g. "2027 1st") for owned future picks; null if picks are unknown. */
  pickValue: number | null;
  picksValued: number;
  picksTotal: number;
}

const ORD: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };
export const fcPickName = (season: string, round: number) => `${season} ${ORD[round] ?? `${round}th`}`;

export function teamFcContext(
  roster: SleeperRoster,
  values: Map<string, PlayerValue>,
  futurePicks: FuturePick[] | null,
  fcPicks: FcPickValue[],
): TeamFcContext {
  const ids = roster.players ?? [];
  const matched = ids.map((id) => values.get(id)).filter((v): v is PlayerValue => !!v);
  // Approved: use the plain per-round value, not Early/Mid/Late (DECISIONS.md, 2026-10-25).
  const byName = new Map(fcPicks.map((p) => [p.name, p.value]));
  const pickVals = (futurePicks ?? []).map((p) => byName.get(fcPickName(p.season, p.round))).filter((v): v is number => v !== undefined);
  return {
    rosterValue: matched.reduce((s, v) => s + v.raw, 0),
    playersValued: matched.length,
    playersTotal: ids.length,
    pickValue: futurePicks ? pickVals.reduce((s, v) => s + v, 0) : null,
    picksValued: pickVals.length,
    picksTotal: futurePicks?.length ?? 0,
  };
}
