// Stage 6 lineup manager: where a player sits in each league, and which bench players could take
// his slot (DECISIONS.md, 2026-10-28). Pure functions, no UI. Roster data is the only lineup source.
// "Eligible" always means eligible under this app's supported slot rules, never "legal" or "unlocked".
import type { SleeperLeague, SleeperNflState, SleeperRoster } from '../../api/types';
import type { PlayerIndex } from '../../domain/players';
import { findOwnerRoster } from '../../domain/roster';
import { countedPosition, eligiblePositions, slotAccepts, SLOT_ACCEPTS } from '../positional/slots';

export type LeagueType = 'managed' | 'bestball' | 'unknown';

export const LOCK_CAVEAT =
  "Before changing anything, confirm in Sleeper that neither player's game has started (locked) and that neither is on a bye. This app can't see game times, locks or byes.";

export type Placement =
  | { kind: 'starting'; slot: string; slotIndex: number }
  | { kind: 'bench' }
  | { kind: 'reserve' }
  | { kind: 'taxi' };

export interface Candidate {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
}

export type Finding =
  | { kind: 'available'; slot: string; slotIndex: number; candidates: Candidate[]; reason: string; check: string }
  | { kind: 'none'; slot: string; slotIndex: number; reason: string; check: string }
  | { kind: 'info'; code: 'bench' | 'reserve' | 'taxi' | 'bestball' | 'unknown_type' | 'league_complete' | 'league_drafting'; reason: string; check: string }
  | { kind: 'uncertain'; code: 'unsupported_slot' | 'ambiguous' | 'inconsistent'; reason: string; check: string };

export interface LeagueRow {
  leagueId: string;
  leagueName: string;
  leagueType: LeagueType;
  /** null when the roster can't be read reliably (ambiguous ownership or inconsistent data). */
  placement: Placement | null;
  finding: Finding;
  /** The owner's roster, when exactly one was found. */
  roster: SleeperRoster | null;
  /** Context notes (playoff week, preseason), never a status. */
  notes: string[];
}

/** Non-bench lineup slots, in Sleeper's order (roster `starters` lines up with these). */
export const lineupSlotList = (league: SleeperLeague) => (league.roster_positions ?? []).filter((p) => p !== 'BN');

const SLOT_NAMES: Record<string, string> = { SUPER_FLEX: 'SUPER_FLEX (SF)' };
export const slotName = (slot: string) => SLOT_NAMES[slot] ?? slot;

/** Bench = on the roster, not starting, not on reserve, not on taxi. */
export function benchIds(roster: SleeperRoster): string[] {
  const out = new Set([...(roster.starters ?? []), ...(roster.reserve ?? []), ...(roster.taxi ?? [])]);
  return (roster.players ?? []).filter((id) => !out.has(id));
}

/** Problems that make a roster's lineup unreadable. Empty list = consistent. */
export function rosterIssues(roster: SleeperRoster, slots: string[], players: PlayerIndex): string[] {
  const issues: string[] = [];
  const starters = roster.starters ?? [];
  const onRoster = new Set(roster.players ?? []);
  const held = new Set([...(roster.reserve ?? []), ...(roster.taxi ?? [])]);
  if (starters.length !== slots.length) issues.push(`Sleeper lists ${starters.length} starters, but the league has ${slots.length} lineup slots.`);
  const filled = starters.filter((id) => id && id !== '0');
  if (new Set(filled).size !== filled.length) issues.push('The same player is listed in two lineup slots.');
  for (const id of filled) {
    if (!onRoster.has(id)) issues.push(`A starter (ID ${id}) isn't on the roster's player list.`);
    else if (!players[id]) issues.push(`A starter (ID ${id}) isn't in Sleeper's player list.`);
    if (held.has(id)) issues.push(`A starter (ID ${id}) is also listed on reserve or taxi.`);
  }
  for (const id of held) if (!onRoster.has(id)) issues.push(`A reserve or taxi player (ID ${id}) isn't on the roster's player list.`);
  return issues;
}

export function placementOf(roster: SleeperRoster, slots: string[], playerId: string): Placement | null {
  if (!(roster.players ?? []).includes(playerId)) return null;
  const i = (roster.starters ?? []).indexOf(playerId);
  if (i >= 0) return { kind: 'starting', slot: slots[i]!, slotIndex: i };
  if ((roster.reserve ?? []).includes(playerId)) return { kind: 'reserve' };
  if ((roster.taxi ?? []).includes(playerId)) return { kind: 'taxi' };
  return { kind: 'bench' };
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
/** Last name for alphabetical order: the last word, skipping suffixes like "Jr.". */
export function sortName(name: string): string {
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && SUFFIX.test(words[words.length - 1]!)) words.pop();
  const last = words.pop() ?? '';
  return `${last} ${words.join(' ')}`.toLowerCase();
}

const GROUP = ['QB', 'RB', 'WR', 'TE'];

/**
 * Bench players eligible for `slot` under the app's supported slot rules, in a neutral, stable
 * order (QB, RB, WR, TE groups, then alphabetical by last name). Never ranked.
 * Reserve and taxi players are never candidates. Unknown slot types return [].
 */
export function eligibleReplacements(roster: SleeperRoster, slot: string, players: PlayerIndex): Candidate[] {
  if (!(slot in SLOT_ACCEPTS)) return [];
  return benchIds(roster)
    .flatMap((id) => {
      const p = players[id];
      if (!p || !slotAccepts(slot, eligiblePositions(p))) return [];
      return [{ id, name: p.name, position: p.position, team: p.team, injuryStatus: p.injuryStatus, group: GROUP.indexOf(countedPosition(p) ?? '') }];
    })
    .sort((a, b) => a.group - b.group || sortName(a.name).localeCompare(sortName(b.name)) || a.id.localeCompare(b.id))
    .map(({ group: _g, ...c }) => c);
}

/** Injury label shown next to a candidate: a note only, never proof of reserve placement. */
export function injuryNote(c: Pick<Candidate, 'injuryStatus'>): string | null {
  if (!c.injuryStatus) return null;
  if (c.injuryStatus === 'IR') return "Sleeper injury status: IR. This is a note only; he's on your bench, not your reserve list.";
  return `Sleeper injury status: ${c.injuryStatus} (a note only).`;
}

export function placementText(p: Placement | null): string {
  if (!p) return "Placement can't be read reliably.";
  switch (p.kind) {
    case 'starting':
      return `Starting at ${slotName(p.slot)} (lineup slot ${p.slotIndex + 1})`;
    case 'bench':
      return 'On your bench';
    case 'reserve':
      return 'On your reserve (IR) list';
    case 'taxi':
      return 'On your taxi squad';
  }
}

/** Context notes for the current week (never statuses). */
export function weekNotes(league: SleeperLeague, state: SleeperNflState): string[] {
  const notes: string[] = [];
  const start = league.settings?.playoff_week_start;
  if (state.season_type === 'regular' && typeof start === 'number' && start > 0 && state.week >= start) {
    notes.push(`Week ${state.week} is a playoff week in this league. The app can't tell whether your team is still playing; check in Sleeper.`);
  }
  if (state.season_type === 'pre') notes.push("NFL preseason: Sleeper's current lineup is shown as is.");
  if (state.season_type === 'off') notes.push("NFL offseason: lineups don't score until the season starts.");
  if (state.season_type === 'post') notes.push("NFL postseason: fantasy seasons are usually over; check in Sleeper.");
  return notes;
}

export interface ScanInput {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  ownerId: string;
  players: PlayerIndex;
  playerId: string;
  leagueType: LeagueType;
  state: SleeperNflState;
}

/** One league's row for the selected player, or null if the owner doesn't roster him there. */
export function scanLeague(input: ScanInput): LeagueRow | null {
  const { league, rosters, ownerId, players, playerId, leagueType, state } = input;
  const base = { leagueId: league.league_id, leagueName: league.name.trim(), leagueType, notes: weekNotes(league, state) };
  const name = players[playerId]?.name ?? `Player ${playerId}`;
  const owner = findOwnerRoster(rosters, ownerId);
  if (owner.kind === 'not_found') return null;
  if (owner.kind === 'ambiguous') {
    const mine = rosters.filter((r) => owner.rosterIds.includes(r.roster_id));
    if (!mine.some((r) => (r.players ?? []).includes(playerId))) return null;
    return {
      ...base,
      placement: null,
      roster: null,
      finding: {
        kind: 'uncertain',
        code: 'ambiguous',
        reason: `You appear on ${mine.length} rosters in this league (as owner or co-owner), so the app can't tell which lineup is yours. No replacements are shown.`,
        check: 'Check this league\'s lineup directly in Sleeper.',
      },
    };
  }
  const roster = owner.roster;
  if (!(roster.players ?? []).includes(playerId)) return null;
  const slots = lineupSlotList(league);
  const issues = rosterIssues(roster, slots, players);
  if (issues.length) {
    return {
      ...base,
      placement: null,
      roster,
      finding: { kind: 'uncertain', code: 'inconsistent', reason: `Sleeper's roster data doesn't add up: ${issues[0]} No replacements are shown.`, check: "Check this league's lineup directly in Sleeper." },
    };
  }
  const placement = placementOf(roster, slots, playerId)!;
  const row = (finding: Finding): LeagueRow => ({ ...base, placement, roster, finding });

  if (leagueType === 'bestball') {
    return row({ kind: 'info', code: 'bestball', reason: 'Best-ball league: lineups in best-ball leagues are generally set automatically. No replacements are shown.', check: 'Confirm in Sleeper if you want to be sure.' });
  }
  if (leagueType === 'unknown') {
    return row({ kind: 'info', code: 'unknown_type', reason: "This league's type hasn't been set, so it's shown for information only.", check: 'Set it to Managed on the League types screen to see replacements.' });
  }
  if (league.status === 'complete') return row({ kind: 'info', code: 'league_complete', reason: "This league's season is complete.", check: 'Nothing to change.' });
  if (league.status === 'pre_draft' || league.status === 'drafting') {
    return row({ kind: 'info', code: 'league_drafting', reason: "This league's draft isn't finished.", check: 'Check the league in Sleeper.' });
  }
  if (placement.kind === 'bench') return row({ kind: 'info', code: 'bench', reason: `${name} is on your bench, not starting, so there's nothing to replace.`, check: 'Nothing to change here.' });
  if (placement.kind === 'reserve') return row({ kind: 'info', code: 'reserve', reason: `${name} is on your reserve (IR) list, not starting, so there's nothing to replace.`, check: 'Nothing to change here.' });
  if (placement.kind === 'taxi') return row({ kind: 'info', code: 'taxi', reason: `${name} is on your taxi squad, not starting, so there's nothing to replace.`, check: 'Nothing to change here.' });

  const { slot, slotIndex } = placement;
  if (!(slot in SLOT_ACCEPTS)) {
    return row({
      kind: 'uncertain',
      code: 'unsupported_slot',
      reason: `He starts in a ${slot} slot, a slot type this app doesn't support, so no replacements are shown.`,
      check: 'In Sleeper, check which players that slot accepts.',
    });
  }
  const candidates = eligibleReplacements(roster, slot, players);
  if (!candidates.length) {
    return row({
      kind: 'none',
      slot,
      slotIndex,
      reason: `Nobody on your bench can fill ${slotName(slot)} under this app's slot rules (${slotName(slot)} takes ${SLOT_ACCEPTS[slot]!.join('/')}; no such player on your bench). Reserve and taxi players aren't counted.`,
      check: 'In Sleeper, check free agents, or whether rearranging other starters works for you.',
    });
  }
  return row({
    kind: 'available',
    slot,
    slotIndex,
    candidates,
    reason: `Eligible on your bench for ${slotName(slot)} under this app's slot rules. Listed by position and name, not ranked.`,
    check: LOCK_CAVEAT,
  });
}

export type ProposalCheck = { ok: true; candidate: Candidate; row: LeagueRow } | { ok: false; reason: string };

/**
 * Review step: re-reads the league (fresh data) and keeps the proposal only if the player still
 * starts in the same slot and the chosen bench player is still eligible. Otherwise it's dropped
 * with the reason.
 */
export function confirmProposal(fresh: LeagueRow | null, expected: { slot: string; slotIndex: number }, chosenId: string, playerName: string): ProposalCheck {
  if (!fresh) return { ok: false, reason: `${playerName} is no longer on your roster in this league.` };
  const f = fresh.finding;
  if (f.kind !== 'available') return { ok: false, reason: `Sleeper's latest data changed: ${f.reason}` };
  if (f.slot !== expected.slot || f.slotIndex !== expected.slotIndex) {
    return { ok: false, reason: `Sleeper's latest data shows ${playerName} at ${slotName(f.slot)} (lineup slot ${f.slotIndex + 1}), not where he was. Pick again.` };
  }
  const candidate = f.candidates.find((c) => c.id === chosenId);
  if (!candidate) return { ok: false, reason: 'The player you picked is no longer eligible on your bench in Sleeper\'s latest data. Pick again.' };
  return { ok: true, candidate, row: fresh };
}
