// Positional MARKET-VALUE analysis (Stage 4; rules approved in DECISIONS.md, 2026-10-26).
// FantasyCalc values are trade-market prices, not projected production. Nothing here feeds the
// tier, confidence or stance logic. Deterministic and UI-free.
import type { SleeperLeague, SleeperRoster } from '../../api/types';
import type { PlayerIndex } from '../../domain/players';
import type { PlayerValue } from '../../valuations/match';
import { bestLineup, type Candidate } from './assign';
import { ANALYZED_POSITIONS, countedPosition, eligiblePositions, lineupSlots, slotAccepts, type Position } from './slots';

/** Approved thresholds. */
export const POSITIONAL_RULES = {
  /** Most valuable bench players kept as useful depth at each position. */
  usefulDepth: { QB: 1, RB: 2, WR: 2, TE: 1 } as Record<Position, number>,
  /** A further bench player is a surplus player at or above this 0–100 scaled value. */
  surplusMinScaled: 10,
  /** Position is low confidence when more than this share of its active players is unvalued. */
  lowCoverageShare: 1 / 3,
} as const;

export type PositionLabel = 'strong' | 'adequate' | 'need' | 'surplus' | 'withheld';

export interface PlayerRef {
  id: string;
  name: string;
  /** Position the value counts under (null = not analyzed, e.g. kickers). */
  position: Position | null;
  /** Sleeper's own position label. */
  sleeperPosition: string | null;
  team: string | null;
  /** FantasyCalc market value; null = unvalued (never treated as zero). */
  value: number | null;
  scaled: number | null;
  injury: string | null;
}

export interface LineupEntry {
  slot: string;
  player: PlayerRef | null;
}

export interface PositionResult {
  /** Sum of matched market values of the market-value lineup's players at this position. */
  value: number;
  /** 1 = most market value at this position among active teams (ties share a rank). */
  rank: number;
  label: PositionLabel;
  lowConfidence: boolean;
  /** Why the label is withheld or low confidence. */
  note: string | null;
  lineupPlayers: PlayerRef[];
  depth: PlayerRef[];
  surplus: PlayerRef[];
  /** Active (not IR/taxi) rostered players at this position, and how many have no value. */
  activeCount: number;
  unvaluedCount: number;
}

export interface TeamPositional {
  rosterId: number;
  sleeperStarters: LineupEntry[];
  marketLineup: LineupEntry[];
  positions: Record<Position, PositionResult>;
  /** Active players not in the market-value lineup. */
  bench: PlayerRef[];
  /** Roster assets that never fill lineup slots. */
  stashed: { ir: PlayerRef[]; taxi: PlayerRef[] };
  /** Rostered players that fill no analyzed position (e.g. kickers). */
  notAnalyzed: PlayerRef[];
  /** Rostered players with no FantasyCalc value (all groups). */
  unvalued: PlayerRef[];
  rostered: number;
  injuries: PlayerRef[];
  /** Need positions, worst rank first. */
  needs: Position[];
  /** Surplus positions, most valuable surplus first. */
  surpluses: Position[];
  /** Total matched value of the market-value lineup. */
  lineupValue: number;
}

export type LeaguePositional =
  | {
      status: 'ok';
      teams: TeamPositional[];
      /** Ownerless rosters: not analyzed (existing rule). */
      excluded: { rosterId: number; reason: string }[];
      activeTeams: number;
      overview: Record<Position, { strongest: number[]; thinnest: number[] }>;
    }
  | { status: 'unavailable'; reason: string; unsupportedSlots: string[] };

export interface PositionalInput {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  players: PlayerIndex;
  /** Matched FantasyCalc values for this league's format (null = none available). */
  values: Map<string, PlayerValue> | null;
  /** Why values are missing, when `values` is null. */
  valuesMissingReason?: string;
}

/** How many teams the league overview lists as strongest / thinnest per position. */
export const OVERVIEW_COUNT = 3;

export function analyzePositions(input: PositionalInput): LeaguePositional {
  const { league, rosters, players, values } = input;
  const { slots, unsupported } = lineupSlots(league.roster_positions ?? []);
  if (unsupported.length) {
    return { status: 'unavailable', unsupportedSlots: unsupported, reason: `This league uses lineup slot types the analysis doesn't support (${unsupported.join(', ')}), so positional market value is withheld rather than guessed.` };
  }
  if (league.settings?.type !== 2) {
    return { status: 'unavailable', unsupportedSlots: [], reason: 'Positional market-value analysis is available for dynasty leagues only.' };
  }
  if (!values) {
    return { status: 'unavailable', unsupportedSlots: [], reason: input.valuesMissingReason ?? "No FantasyCalc values are available for this league's format." };
  }

  const ref = (id: string): PlayerRef => {
    const p = players[id];
    const v = values.get(id) ?? null;
    return {
      id,
      name: p?.name ?? `Unknown player (ID ${id})`,
      position: p ? countedPosition(p) : null,
      sleeperPosition: p?.position ?? null,
      team: p?.team ?? null,
      value: v ? v.raw : null,
      scaled: v ? v.scaled : null,
      injury: p?.injuryStatus ?? null,
    };
  };

  const active = rosters.filter((r) => r.owner_id);
  const excluded = rosters.filter((r) => !r.owner_id).map((r) => ({ rosterId: r.roster_id, reason: 'No owner (abandoned roster), so it is not analyzed.' }));

  // Per-team lineups and groups
  const teams = active.map((r) => {
    const reserve = r.reserve ?? [];
    const taxi = r.taxi ?? [];
    const held = new Set([...reserve, ...taxi]);
    const all = (r.players ?? []).map(ref);
    const activeRefs = all.filter((x) => !held.has(x.id));
    const candidates: (Candidate & { ref: PlayerRef })[] = activeRefs.map((x) => {
      const elig = players[x.id] ? eligiblePositions(players[x.id]!) : [];
      return { id: x.id, value: x.value, ref: x, canFill: (slot: string) => slotAccepts(slot, elig) };
    });
    const picked = bestLineup(slots, candidates);
    const marketLineup: LineupEntry[] = slots.map((slot, i) => ({ slot, player: picked[i]?.ref ?? null }));
    const inLineup = new Set(marketLineup.flatMap((e) => (e.player ? [e.player.id] : [])));
    const starterIds = r.starters ?? [];
    const sleeperStarters: LineupEntry[] = slots.map((slot, i) => {
      const id = starterIds[i];
      return { slot, player: id && id !== '0' ? ref(id) : null };
    });
    return {
      r,
      marketLineup,
      sleeperStarters,
      activeRefs,
      bench: activeRefs.filter((x) => !inLineup.has(x.id)),
      stashed: { ir: reserve.map(ref), taxi: taxi.map(ref) },
      all,
    };
  });

  // Position values and ranks among active teams
  const valueAt = (t: (typeof teams)[number], pos: Position) =>
    t.marketLineup.reduce((s, e) => s + (e.player && e.player.position === pos && e.player.value !== null ? e.player.value : 0), 0);
  const rankOf = (pos: Position, v: number) => 1 + teams.filter((t) => valueAt(t, pos) > v).length;
  const n = teams.length;

  const results: TeamPositional[] = teams.map((t) => {
    const positions = {} as Record<Position, PositionResult>;
    for (const pos of ANALYZED_POSITIONS) {
      const value = valueAt(t, pos);
      const rank = rankOf(pos, value);
      const lineupPlayers = t.marketLineup.flatMap((e) => (e.player && e.player.position === pos ? [e.player] : []));
      const benchValued = t.bench.filter((x) => x.position === pos && x.value !== null).sort((a, b) => b.value! - a.value!);
      const depth = benchValued.slice(0, POSITIONAL_RULES.usefulDepth[pos]);
      const surplus = benchValued.slice(POSITIONAL_RULES.usefulDepth[pos]).filter((x) => x.scaled! >= POSITIONAL_RULES.surplusMinScaled);
      const activeAtPos = t.activeRefs.filter((x) => x.position === pos);
      const unvaluedCount = activeAtPos.filter((x) => x.value === null).length;

      let label: PositionLabel = rank <= n / 3 ? 'strong' : rank > (2 * n) / 3 ? 'need' : 'adequate';
      if (surplus.length && label !== 'need') label = 'surplus';
      let note: string | null = null;
      const unvaluedLineup = lineupPlayers.filter((x) => x.value === null);
      const unvaluedStarters = t.sleeperStarters.flatMap((e) => (e.player && e.player.position === pos && e.player.value === null ? [e.player] : []));
      if (unvaluedStarters.length || unvaluedLineup.length) {
        label = 'withheld';
        const who = [...new Map([...unvaluedStarters, ...unvaluedLineup].map((x) => [x.id, x.name])).values()].join(', ');
        note = `Not enough data: ${who} ${unvaluedStarters.length ? 'starts in Sleeper' : 'is needed in the lineup'} but has no FantasyCalc value.`;
      }
      const lowConfidence = label !== 'withheld' && activeAtPos.length > 0 && unvaluedCount / activeAtPos.length > POSITIONAL_RULES.lowCoverageShare;
      if (lowConfidence) note = `Low confidence: ${unvaluedCount} of ${activeAtPos.length} active ${pos}s have no FantasyCalc value.`;

      positions[pos] = { value, rank, label, lowConfidence, note, lineupPlayers, depth, surplus, activeCount: activeAtPos.length, unvaluedCount };
    }
    const needs = ANALYZED_POSITIONS.filter((p) => positions[p].label === 'need').sort((a, b) => positions[b].rank - positions[a].rank);
    const surpluses = ANALYZED_POSITIONS.filter((p) => positions[p].label === 'surplus').sort(
      (a, b) => positions[b].surplus.reduce((s, x) => s + x.value!, 0) - positions[a].surplus.reduce((s, x) => s + x.value!, 0),
    );
    return {
      rosterId: t.r.roster_id,
      sleeperStarters: t.sleeperStarters,
      marketLineup: t.marketLineup,
      positions,
      bench: t.bench,
      stashed: t.stashed,
      notAnalyzed: t.all.filter((x) => x.position === null),
      unvalued: t.all.filter((x) => x.value === null),
      rostered: t.all.length,
      injuries: t.all.filter((x) => x.injury),
      needs,
      surpluses,
      lineupValue: t.marketLineup.reduce((s, e) => s + (e.player?.value ?? 0), 0),
    };
  });

  const overview = {} as Record<Position, { strongest: number[]; thinnest: number[] }>;
  for (const pos of ANALYZED_POSITIONS) {
    const sorted = [...results].sort((a, b) => a.positions[pos].rank - b.positions[pos].rank || a.rosterId - b.rosterId);
    overview[pos] = {
      strongest: sorted.slice(0, OVERVIEW_COUNT).map((t) => t.rosterId),
      thinnest: sorted.slice(-OVERVIEW_COUNT).reverse().map((t) => t.rosterId),
    };
  }

  return { status: 'ok', teams: results, excluded, activeTeams: n, overview };
}

/** Short market-value summary for reason lines, e.g. "thin at RB, TE · surplus at WR". */
export function positionalSummary(t: TeamPositional): string | null {
  const parts = [t.needs.length ? `thin at ${t.needs.join(', ')}` : null, t.surpluses.length ? `surplus at ${t.surpluses.join(', ')}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
