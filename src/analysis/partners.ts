// Within-league trade PARTNER MATCHING (Stage 5; rules approved in DECISIONS.md, 2026-10-26).
//
// Suggests which teams to approach and which assets to consider, using market value (FantasyCalc
// trade prices), never projected production. It is not a trade builder: it never assembles a
// trade, judges fairness or predicts acceptance. It reads tiers, the owner's stance and Stage 4
// positional results and never changes them. Deterministic and UI-free.
import type { SleeperLeague } from '../api/types';
import type { PlayerIndex } from '../domain/players';
import type { OwnerRosterResult } from '../domain/roster';
import type { FcPickValue } from '../valuations/fantasycalc/parse';
import { fcPickName } from './fcContext';
import type { LeaguePositional, PlayerRef, TeamPositional } from './positional/positional';
import { ANALYZED_POSITIONS, type Position } from './positional/slots';
import type { StanceResult } from './stance';
import type { Confidence, LeagueAnalysis, Tier } from './tiers';

/** Approved rules. */
export const PARTNER_RULES = {
  /** Stance-compatibility grade per partner tier (1 = natural partner). */
  grade: {
    buy: { seller: 1, deep_rebuild: 1, bubble: 2, contender: 3 },
    sell: { contender: 1, bubble: 2, seller: 3, deep_rebuild: 3 },
  } as Record<'buy' | 'sell', Record<Tier, 1 | 2 | 3>>,
  /** Targets / offers shown per position, and picks shown per list. */
  assetsPerPosition: 3,
  picksPerList: 3,
  /** Every suggested player or pick is worth at least this on the 0–100 scale. */
  minScaled: 10,
  /** "Young" = this age or under; "veteran" = this age or over; buying targets must be this age or over. */
  youngMaxAge: 24,
  veteranMinAge: 27,
  buyTargetMinAge: 26,
  /** Sleeper injury statuses treated as unavailable (listed after available players). */
  unavailableStatuses: ['IR', 'Out', 'PUP', 'Sus', 'DNR'] as readonly string[],
  /** Below this share of rostered players with a FantasyCalc value, a partner's label is Low. */
  minCoverage: 0.75,
} as const;

export const GRADE_TEXT: Record<1 | 2 | 3, string> = {
  1: 'Natural partner for your stance',
  2: 'Possible partner for your stance',
  3: "Stances don't line up; listed only for a two-way positional fit",
};

export const INFERRED_STANCE: Record<Tier, string> = {
  contender: 'Likely buying',
  bubble: 'Likely holding',
  seller: 'Likely selling',
  deep_rebuild: 'Likely selling veterans',
};

export type Fit = 'two-way' | 'one-way';

export interface Coverage {
  valued: number;
  rostered: number;
}

export interface PickLine {
  season: string;
  round: number;
  originalRosterId: number;
  /** FantasyCalc's plain per-round value for this exact season and round; null = no exact mapping. */
  value: number | null;
}

/** Why an asset is suggested (shown on screen). */
export type AssetWhy = 'upgrade' | 'surplus' | 'young' | 'veteran';

export interface Candidate {
  player: PlayerRef;
  why: AssetWhy;
  age: number | null;
  /** Listed after available players; values are never adjusted. */
  unavailable: boolean;
}

export interface AssetGroup {
  position: Position;
  players: Candidate[];
}

export interface Partner {
  rosterId: number;
  /** Position in the list; tied partners share it. */
  rank: number;
  tied: boolean;
  grade: 1 | 2 | 3;
  tier: Tier;
  tierConfidence: Confidence;
  fit: Fit;
  /** Their surplus positions that you need. */
  theyHave: Position[];
  /** Their need positions where you have (unprotected) surplus. */
  theyNeed: Position[];
  targets: AssetGroup[];
  offers: AssetGroup[];
  /** Picks to consider: theirs when you're selling, yours when you're buying. */
  targetPicks: PickLine[];
  offerPicks: PickLine[];
  recentTrades: number;
  confidence: Confidence;
  confidenceNotes: string[];
  /** Plain-English reasons for the fit. */
  reasons: string[];
  coverage: { mine: Coverage; theirs: Coverage; positions: { position: Position; mine: Coverage; theirs: Coverage }[] };
  picks: { mine: PickLine[] | null; theirs: PickLine[] | null };
}

export type DeadlineInfo = { kind: 'week'; week: number; passed: boolean } | { kind: 'none_observed' } | { kind: 'unknown' };

export type ExplanationCode =
  | 'not_dynasty'
  | 'not_found'
  | 'ambiguous'
  | 'no_games'
  | 'not_started'
  | 'deadline_passed'
  | 'stance_unavailable'
  | 'hold'
  | 'positional_unavailable'
  | 'no_fit';

export type PartnerResult =
  | {
      kind: 'list';
      myStance: 'buy' | 'sell';
      /** Present when the owner's stance is only a low-confidence leaning. */
      caveat: string | null;
      partners: Partner[];
      notListed: { rosterId: number; reason: string }[];
      excluded: { rosterId: number; reason: string }[];
      deadline: DeadlineInfo;
      protectedCount: number;
    }
  | { kind: 'explanation'; code: ExplanationCode; reason: string; deadline: DeadlineInfo; excluded: { rosterId: number; reason: string }[] };

export interface PartnerInput {
  league: SleeperLeague;
  analysis: LeagueAnalysis;
  stance: StanceResult;
  mine: OwnerRosterResult;
  /** Stage 4 results; null when FantasyCalc values couldn't be loaded. */
  positional: LeaguePositional | null;
  /** FantasyCalc pick values from the same snapshot (empty if none). */
  fcPicks: FcPickValue[];
  /** Player IDs the owner protected in this league (device-local). */
  protectedIds: ReadonlySet<string>;
  /** Sleeper player list (ages, NFL depth chart) for choosing the type of player suggested. */
  players: PlayerIndex;
  /** Highest player value in the FantasyCalc snapshot (the 0–100 scale's 100), for the pick value floor. */
  topValue: number | null;
  /** Display name per roster, used only for the stable display order of tied partners. */
  nameOf: (rosterId: number) => string;
  currentWeek: number;
}

const ORDER: Confidence[] = ['low', 'medium', 'high'];
const lowest = (...c: Confidence[]): Confidence => ORDER[Math.min(...c.map((x) => ORDER.indexOf(x)))]!;
const oneLower = (c: Confidence): Confidence => ORDER[Math.max(0, ORDER.indexOf(c) - 1)]!;

export function deadlineInfo(league: SleeperLeague, currentWeek: number): DeadlineInfo {
  const d = league.settings?.trade_deadline;
  if (typeof d !== 'number') return { kind: 'unknown' };
  if (d >= 99) return { kind: 'none_observed' };
  return { kind: 'week', week: d, passed: currentWeek > d };
}

export function deadlineLabel(d: DeadlineInfo): string {
  if (d.kind === 'week') return `Trade deadline: week ${d.week}${d.passed ? ' (passed)' : ''}.`;
  if (d.kind === 'none_observed') return "No trade deadline. Sleeper sends 99, and reading 99 as 'no deadline' is an observed convention, not documented.";
  return 'Trade deadline: not provided by Sleeper.';
}

function coverage(t: TeamPositional): Coverage {
  return { valued: t.rostered - t.unvalued.length, rostered: t.rostered };
}

function pickLines(owned: { season: string; round: number; originalRosterId: number }[] | null, fcPicks: FcPickValue[]): PickLine[] | null {
  if (!owned) return null;
  // Exact season + round only ("2027 1st"); early/mid/late values are never used.
  const byName = new Map(fcPicks.map((p) => [p.name, p.value]));
  return owned.map((p) => ({ ...p, value: byName.get(fcPickName(p.season, p.round)) ?? null }));
}

/** Unprotected surplus players at a position (offers). */
function offerPlayers(t: TeamPositional, pos: Position, protectedIds: ReadonlySet<string>): PlayerRef[] {
  return t.positions[pos].surplus.filter((p) => !protectedIds.has(p.id));
}

const lineupPlayers = (t: TeamPositional) => t.marketLineup.flatMap((e) => (e.player ? [e.player] : []));

/**
 * Chooses the players and picks to show for one partner (approved 2026-10-27, DECISIONS.md).
 * Buying: targets = their 26+ NFL-starting upgrades at your needs; offers = your surplus at their
 * needs + your young non-lineup players + your picks. Selling: targets = their young non-lineup
 * players + their picks; offers = your surplus at their needs + your veterans.
 */
function chooseAssets(
  stance: 'buy' | 'sell',
  me: TeamPositional,
  them: TeamPositional,
  theyNeed: Position[],
  myPicks: PickLine[] | null,
  theirPicks: PickLine[] | null,
  input: PartnerInput,
) {
  const R = PARTNER_RULES;
  const ageOf = (p: PlayerRef) => input.players[p.id]?.age ?? null;
  const unavailable = (p: PlayerRef) => !!p.injury && R.unavailableStatuses.includes(p.injury);
  const valued = (p: PlayerRef) => p.value !== null && p.scaled !== null && p.scaled >= R.minScaled && p.position !== null;
  const cand = (p: PlayerRef, why: AssetWhy): Candidate => ({ player: p, why, age: ageOf(p), unavailable: unavailable(p) });
  const groups = (list: Candidate[]): AssetGroup[] => {
    const seen = new Set<string>();
    const unique = list.filter((c) => !seen.has(c.player.id) && !!seen.add(c.player.id));
    return ANALYZED_POSITIONS.map((position) => ({
      position,
      players: unique
        .filter((c) => c.player.position === position)
        .sort((a, b) => Number(a.unavailable) - Number(b.unavailable) || b.player.value! - a.player.value!)
        .slice(0, R.assetsPerPosition),
    })).filter((g) => g.players.length > 0);
  };
  const picks = (lines: PickLine[] | null) =>
    (lines ?? [])
      .filter((l) => l.value !== null && input.topValue !== null && (l.value / input.topValue) * 100 >= R.minScaled)
      .sort((a, b) => b.value! - a.value! || a.season.localeCompare(b.season) || a.round - b.round)
      .slice(0, R.picksPerList);

  const notProtected = (p: PlayerRef) => !input.protectedIds.has(p.id);
  const surplusOffers = theyNeed.flatMap((pos) => offerPlayers(me, pos, input.protectedIds).filter(valued).map((p) => cand(p, 'surplus')));
  const myNonLineup = [...me.bench, ...me.stashed.taxi, ...me.stashed.ir];

  if (stance === 'buy') {
    const weakest = (pos: Position) => {
      const vals = lineupPlayers(me).flatMap((p) => (p.position === pos && p.value !== null ? [p.value] : []));
      return vals.length ? Math.min(...vals) : 0;
    };
    const targets = [...lineupPlayers(them), ...them.bench, ...them.stashed.ir]
      .filter((p) => valued(p) && me.needs.includes(p.position!) && p.value! > weakest(p.position!))
      .filter((p) => (ageOf(p) ?? -1) >= R.buyTargetMinAge)
      .filter((p) => unavailable(p) || input.players[p.id]?.depthChartOrder === 1)
      .map((p) => cand(p, 'upgrade'));
    const young = myNonLineup.filter((p) => valued(p) && notProtected(p) && (ageOf(p) ?? Infinity) <= R.youngMaxAge).map((p) => cand(p, 'young'));
    return { targets: groups(targets), offers: groups([...surplusOffers, ...young]), targetPicks: [] as PickLine[], offerPicks: picks(myPicks) };
  }
  const youngTheirs = [...them.bench, ...them.stashed.taxi, ...them.stashed.ir]
    .filter((p) => valued(p) && (ageOf(p) ?? Infinity) <= R.youngMaxAge)
    .map((p) => cand(p, 'young'));
  const veterans = [...lineupPlayers(me), ...me.bench, ...me.stashed.ir]
    .filter((p) => valued(p) && notProtected(p) && (ageOf(p) ?? -1) >= R.veteranMinAge)
    .map((p) => cand(p, 'veteran'));
  return { targets: groups(youngTheirs), offers: groups([...surplusOffers, ...veterans]), targetPicks: picks(theirPicks), offerPicks: [] as PickLine[] };
}

export function matchPartners(input: PartnerInput): PartnerResult {
  const { league, analysis, stance, mine, positional } = input;
  const deadline = deadlineInfo(league, input.currentWeek);
  const excluded = analysis.excluded.map((e) => ({ rosterId: e.rosterId, reason: e.reason }));
  const explain = (code: ExplanationCode, reason: string): PartnerResult => ({ kind: 'explanation', code, reason, deadline, excluded });

  if (league.settings?.type !== 2) return explain('not_dynasty', 'Partner matching is available for dynasty leagues only.');
  if (mine.kind === 'not_found') return explain('not_found', "Your team wasn't found in this league, so no partners are suggested.");
  if (mine.kind === 'ambiguous') return explain('ambiguous', 'You appear on more than one roster in this league, so no team is treated as yours and no partners are suggested.');
  if (!analysis.teams) {
    if (analysis.season.phase === 'over') return explain('no_games', "No regular-season games remain (playoffs or offseason). Tiers aren't calculated outside the regular season, so there are no partners to suggest.");
    if (analysis.season.phase === 'not_started') return explain('not_started', "The season hasn't started, so there are no tiers or partners yet.");
    return explain('stance_unavailable', `Your stance isn't available: ${analysis.noTiersReason ?? 'no tiers were calculated.'}`);
  }
  if (deadline.kind === 'week' && deadline.passed) return explain('deadline_passed', `Trades closed after week ${deadline.week}, so no partners are suggested.`);
  if (stance.kind === 'unavailable' || !stance.team) return explain('stance_unavailable', `Your stance isn't available: ${stance.headline}`);

  const lean = stance.kind === 'recommendation' ? stance.stance : stance.leaning;
  if (lean === 'hold') {
    return explain('hold', `Your stance is ${stance.kind === 'insufficient' ? 'leaning Hold' : 'Hold'}, so no partners are suggested. No tier is assumed to be a better fit for a team that is holding.`);
  }
  const myStance = lean;
  const caveat =
    stance.kind === 'insufficient'
      ? `Your stance is only a low-confidence leaning toward ${myStance === 'buy' ? 'buying' : 'selling'}, so every suggestion below is Low confidence. Treat this list with extra caution.`
      : null;

  if (!positional) return explain('positional_unavailable', "Positional market value isn't available (FantasyCalc values could not be loaded), so there are no needs or surpluses to match.");
  if (positional.status !== 'ok') return explain('positional_unavailable', `Positional market value isn't available: ${positional.reason} So there are no needs or surpluses to match.`);
  const myPos = positional.teams.find((t) => t.rosterId === stance.team!.rosterId);
  if (!myPos) return explain('positional_unavailable', "Your team's positional market value couldn't be analyzed, so there are no needs or surpluses to match.");

  const myConfidence: Confidence = stance.kind === 'insufficient' ? 'low' : stance.team.confidence;
  const myCoverage = coverage(myPos);
  const myOfferPositions = (need: Position[]) => myPos.surpluses.filter((p) => need.includes(p) && offerPlayers(myPos, p, input.protectedIds).length > 0);
  for (const e of positional.excluded) if (!excluded.some((x) => x.rosterId === e.rosterId)) excluded.push({ rosterId: e.rosterId, reason: e.reason });

  const candidates: Omit<Partner, 'rank' | 'tied'>[] = [];
  const notListed: { rosterId: number; reason: string }[] = [];
  for (const team of analysis.teams) {
    if (team.rosterId === myPos.rosterId) continue;
    const theirPos = positional.teams.find((t) => t.rosterId === team.rosterId);
    if (!theirPos) {
      notListed.push({ rosterId: team.rosterId, reason: 'No positional market value for this team.' });
      continue;
    }
    const grade = PARTNER_RULES.grade[myStance][team.tier];
    const theyHave = theirPos.surpluses.filter((p) => myPos.needs.includes(p));
    const theyNeed = myOfferPositions(theirPos.needs);
    const fit: Fit | null = theyHave.length && theyNeed.length ? 'two-way' : theyHave.length || theyNeed.length ? 'one-way' : null;
    if (!fit) {
      notListed.push({ rosterId: team.rosterId, reason: 'No positional fit: none of their surpluses match your needs, and they need nothing you have in surplus.' });
      continue;
    }
    if (grade === 3 && fit !== 'two-way') {
      notListed.push({ rosterId: team.rosterId, reason: "Stances don't line up and the fit is only one-way." });
      continue;
    }

    // Confidence label (never changes rank).
    const notes: string[] = [];
    let confidence = lowest(myConfidence, team.confidence);
    if (stance.kind === 'insufficient') notes.push('Your stance is only a low-confidence leaning.');
    if (team.confidence !== 'high') notes.push(`Their tier is ${team.confidence} confidence.`);
    const fitPositions = [...new Set([...theyHave, ...theyNeed])];
    const lowPositions = fitPositions.filter((p) => myPos.positions[p].lowConfidence || theirPos.positions[p].lowConfidence);
    if (lowPositions.length) {
      confidence = oneLower(confidence);
      notes.push(`Low-confidence market value at ${lowPositions.join(', ')}.`);
    }
    const theirCoverage = coverage(theirPos);
    for (const [who, c] of [
      ['Your', myCoverage],
      ['Their', theirCoverage],
    ] as const) {
      if (c.rostered && c.valued / c.rostered < PARTNER_RULES.minCoverage) {
        confidence = 'low';
        notes.push(`${who} roster has only ${c.valued} of ${c.rostered} players with a FantasyCalc value.`);
      }
    }

    const myPickLines = pickLines(analysis.teams.find((t) => t.rosterId === myPos.rosterId)?.futurePicks ?? null, input.fcPicks);
    const theirPickLines = pickLines(team.futurePicks, input.fcPicks);
    const assets = chooseAssets(myStance, myPos, theirPos, theyNeed, myPickLines, theirPickLines, input);

    const reasons = [
      `${GRADE_TEXT[grade]} (you: ${myStance === 'buy' ? 'buying' : 'selling'}; them: ${INFERRED_STANCE[team.tier].toLowerCase()}, inferred from their tier).`,
      fit === 'two-way' ? 'Two-way positional fit:' : 'One-way positional fit:',
      ...theyHave.map((p) => `They have surplus market value at ${p}, where you have a need.`),
      ...theyNeed.map((p) => `They have a need at ${p}, where you have surplus market value.`),
    ];
    if (team.recentTrades) reasons.push(`${team.recentTrades} completed trade${team.recentTrades === 1 ? '' : 's'} in the last 3 weeks (context only, not a sign they'd trade with you).`);

    candidates.push({
      rosterId: team.rosterId,
      grade,
      tier: team.tier,
      tierConfidence: team.confidence,
      fit,
      theyHave,
      theyNeed,
      targets: assets.targets,
      offers: assets.offers,
      targetPicks: assets.targetPicks,
      offerPicks: assets.offerPicks,
      recentTrades: team.recentTrades,
      confidence,
      confidenceNotes: notes,
      reasons,
      coverage: {
        mine: myCoverage,
        theirs: theirCoverage,
        positions: fitPositions.map((position) => ({
          position,
          mine: { valued: myPos.positions[position].activeCount - myPos.positions[position].unvaluedCount, rostered: myPos.positions[position].activeCount },
          theirs: { valued: theirPos.positions[position].activeCount - theirPos.positions[position].unvaluedCount, rostered: theirPos.positions[position].activeCount },
        })),
      },
      picks: { mine: myPickLines, theirs: theirPickLines },
    });
  }

  if (!candidates.length) {
    return explain('no_fit', "No reasonable fit: no team's surpluses match your needs, and no team needs what you have in surplus (protected players excluded).");
  }

  // Lexicographic order: grade, then fit (two-way first), then recent trades (more first).
  // Teams equal on all three are TIED: they share a position number and are displayed
  // alphabetically, which doesn't rank them.
  const key = (p: (typeof candidates)[number]) => [p.grade, p.fit === 'two-way' ? 0 : 1, -p.recentTrades] as const;
  const cmpKey = (a: (typeof candidates)[number], b: (typeof candidates)[number]) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return 0;
  };
  const sorted = [...candidates].sort((a, b) => cmpKey(a, b) || input.nameOf(a.rosterId).localeCompare(input.nameOf(b.rosterId)) || a.rosterId - b.rosterId);
  const partners: Partner[] = sorted.map((p) => {
    const ahead = sorted.filter((o) => cmpKey(o, p) < 0).length;
    const tied = sorted.filter((o) => o !== p && cmpKey(o, p) === 0).length > 0;
    return { ...p, rank: ahead + 1, tied };
  });

  const protectedCount = [...lineupPlayers(myPos), ...myPos.bench, ...myPos.stashed.ir, ...myPos.stashed.taxi].filter((x) => input.protectedIds.has(x.id)).length;
  return { kind: 'list', myStance, caveat, partners, notListed, excluded, deadline, protectedCount };
}
