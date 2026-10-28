// Stage 6: saved lineup plans ("items") and how a fresh read of Sleeper's roster data moves them
// between workflow states (DECISIONS.md, 2026-10-28). Pure functions, no UI.
// Three separate dimensions: workflow (saved), latest check (never overwrites workflow) and the
// finding (computed elsewhere from the latest successful read).
import type { SleeperErrorKind } from '../../api/client';
import type { SleeperLeague, SleeperNflState, SleeperRoster } from '../../api/types';
import type { PlayerIndex } from '../../domain/players';
import { findOwnerRoster } from '../../domain/roster';
import { lineupSlotList, placementText, placementOf, rosterIssues, scanLeague, slotName, type Finding, type LeagueType } from './placement';

export type Workflow = 'pending' | 'verified' | 'changed' | 'done_unverified' | 'expired';

export type LatestCheck =
  | { kind: 'none' }
  | { kind: 'ok'; receivedAt: number }
  | { kind: 'failed'; at: number; error: SleeperErrorKind | 'unknown' };

/** The finding from the latest successful read (or from the review read). */
export interface ItemFinding {
  kind: Finding['kind'];
  reason: string;
}

export interface LineupItem {
  /** leagueId:outgoingId:season:seasonType:week (one item per league, player and week). */
  key: string;
  leagueId: string;
  leagueName: string;
  season: string;
  seasonType: string;
  week: number;
  rosterId: number;
  outgoing: { id: string; name: string };
  replacement: { id: string; name: string };
  slot: string;
  slotIndex: number;
  /** The league's non-bench slots when the plan was saved. */
  slotLayout: string[];
  /** Sleeper's starters when the plan was saved. */
  baseline: string[];
  createdAt: number;
  /** When the data the plan was built from was received from Sleeper. */
  baselineReceivedAt: number;
  workflow: Workflow;
  workflowAt: number;
  /** Plain-English reason for the current workflow state, built from what the API returned. */
  workflowReason: string;
  /** Lineup facts Sleeper returned (for "changed, not as proposed"). */
  facts: string[];
  /** A note from the latest successful read that didn't change the workflow (e.g. other slots changed). */
  note: string | null;
  doneMarkedAt: number | null;
  /** Information only: when "Open in Sleeper" was last tapped. Never changes any status. */
  openedAt: number | null;
  latestCheck: LatestCheck;
  finding: ItemFinding | null;
}

export const itemKey = (leagueId: string, outgoingId: string, state: Pick<SleeperNflState, 'season' | 'season_type' | 'week'>) =>
  `${leagueId}:${outgoingId}:${state.season}:${state.season_type}:${state.week}`;

export interface NewItemInput {
  league: SleeperLeague;
  roster: SleeperRoster;
  state: SleeperNflState;
  outgoing: { id: string; name: string };
  replacement: { id: string; name: string };
  slot: string;
  slotIndex: number;
  receivedAt: number;
  now: number;
  finding: ItemFinding | null;
}

export function newItem(i: NewItemInput): LineupItem {
  return {
    key: itemKey(i.league.league_id, i.outgoing.id, i.state),
    leagueId: i.league.league_id,
    leagueName: i.league.name.trim(),
    season: i.state.season,
    seasonType: i.state.season_type,
    week: i.state.week,
    rosterId: i.roster.roster_id,
    outgoing: i.outgoing,
    replacement: i.replacement,
    slot: i.slot,
    slotIndex: i.slotIndex,
    slotLayout: lineupSlotList(i.league),
    baseline: [...(i.roster.starters ?? [])],
    createdAt: i.now,
    baselineReceivedAt: i.receivedAt,
    workflow: 'pending',
    workflowAt: i.now,
    workflowReason: `You planned: ${i.outgoing.name} out, ${i.replacement.name} in at ${slotName(i.slot)}. Sleeper's latest data still shows ${i.outgoing.name} starting.`,
    facts: [],
    note: null,
    doneMarkedAt: null,
    openedAt: null,
    latestCheck: { kind: 'none' },
    finding: i.finding,
  };
}

/** Workflow states a "Check again" can still move. Verified and Expired are final. */
export const checkable = (item: LineupItem) => item.workflow === 'pending' || item.workflow === 'done_unverified' || item.workflow === 'changed';

/** A failed read records the failure and changes nothing else (workflow and baseline preserved). */
export function recordFailure(item: LineupItem, error: unknown, at: number): LineupItem {
  const kind = (error as { kind?: SleeperErrorKind } | null)?.kind;
  return { ...item, latestCheck: { kind: 'failed', at, error: kind ?? 'unknown' } };
}

/** "Open in Sleeper" was tapped: information only. */
export const recordOpened = (item: LineupItem, at: number): LineupItem => ({ ...item, openedAt: at });

/** The owner marked the change done. Stays visibly unverified until a read confirms it. */
export function markDone(item: LineupItem, at: number): LineupItem {
  if (item.workflow !== 'pending') return item;
  return {
    ...item,
    workflow: 'done_unverified',
    workflowAt: at,
    doneMarkedAt: at,
    workflowReason: `You marked this done. The app hasn't seen ${item.replacement.name} at ${slotName(item.slot)} in Sleeper's data yet.`,
  };
}

export interface FreshRead {
  state: SleeperNflState;
  league: SleeperLeague;
  rosters: SleeperRoster[];
  ownerId: string;
  players: PlayerIndex;
  receivedAt: number;
}

export type CheckOutcome =
  | { kind: 'updated'; item: LineupItem }
  /** The read succeeded but the data can't be trusted; workflow unchanged, finding is Uncertain. */
  | { kind: 'uncertain'; item: LineupItem; reason: string };

/**
 * Applies a successful forced read to a saved item, in the approved order:
 * (1) context changed → Expired; (2) a player left the roster, or the replacement went to
 * reserve/taxi → Expired; (3) inconsistent data → unchanged (Uncertain); (4) replacement in a
 * slot of the intended type and outgoing player not starting → Verified as proposed;
 * (5) outgoing not starting, or starting in a different slot type → Changed, not as proposed;
 * (6) otherwise unchanged (Pending or Marked done), with a note if other slots changed.
 */
export function applyRead(item: LineupItem, read: FreshRead): CheckOutcome {
  const at = read.receivedAt;
  const checked = { ...item, latestCheck: { kind: 'ok', receivedAt: at } as LatestCheck };
  if (!checkable(item)) return { kind: 'updated', item: checked };
  const expire = (reason: string): CheckOutcome => ({ kind: 'updated', item: { ...checked, workflow: 'expired', workflowAt: at, workflowReason: reason, facts: [], note: null } });
  const { state, league, rosters, players } = read;
  const out = item.outgoing;
  const rep = item.replacement;

  // (1) Context.
  if (state.season !== item.season || state.season_type !== item.seasonType || state.week !== item.week) {
    return expire(`This was for week ${item.week} (${item.season} ${item.seasonType}); Sleeper now shows week ${state.week} (${state.season} ${state.season_type}).`);
  }
  const slots = lineupSlotList(league);
  if (slots.join(',') !== item.slotLayout.join(',')) return expire("This league's lineup slots changed since you saved the plan.");
  const owner = findOwnerRoster(rosters, read.ownerId);
  if (owner.kind !== 'found' || owner.roster.roster_id !== item.rosterId) return expire("Your roster in this league can't be identified the same way as when you saved the plan.");
  const roster = owner.roster;

  // (2) Players.
  const onRoster = new Set(roster.players ?? []);
  if (!onRoster.has(out.id)) return expire(`${out.name} is no longer on your roster.`);
  if (!onRoster.has(rep.id)) return expire(`${rep.name} is no longer on your roster.`);
  if ((roster.reserve ?? []).includes(rep.id)) return expire(`${rep.name} is now on your reserve (IR) list, so he can't take the slot.`);
  if ((roster.taxi ?? []).includes(rep.id)) return expire(`${rep.name} is now on your taxi squad, so he can't take the slot.`);

  // (3) Consistency.
  const issues = rosterIssues(roster, slots, players);
  if (issues.length) return { kind: 'uncertain', item: checked, reason: `Sleeper's roster data doesn't add up: ${issues[0]}` };

  const starters = roster.starters ?? [];
  const outIdx = starters.indexOf(out.id);
  const repIdx = starters.indexOf(rep.id);
  const nameOf = (id: string) => (id && id !== '0' ? (players[id]?.name ?? `Player ${id}`) : 'empty');
  const facts = () => {
    const sameType = slots.map((s, i) => [s, i] as const).filter(([s]) => s === item.slot);
    return [
      `${out.name}: ${placementText(placementOf(roster, slots, out.id))}.`,
      `${rep.name}: ${placementText(placementOf(roster, slots, rep.id))}.`,
      ...sameType.map(([s, i]) => `${slotName(s)} (lineup slot ${i + 1}): ${nameOf(starters[i]!)}.`),
    ];
  };

  // (4) Verified as proposed.
  if (outIdx < 0 && repIdx >= 0 && slots[repIdx] === item.slot) {
    return {
      kind: 'updated',
      item: { ...checked, workflow: 'verified', workflowAt: at, facts: [], note: null, workflowReason: `Sleeper's data shows ${rep.name} at ${slotName(item.slot)} and ${out.name} not starting.` },
    };
  }
  // (5) Changed, not as proposed.
  if (outIdx < 0 || slots[outIdx] !== item.slot) {
    const why = outIdx < 0 ? `${out.name} isn't starting, but ${rep.name} isn't at ${slotName(item.slot)}.` : `${out.name} is still starting, but now at ${slotName(slots[outIdx]!)}.`;
    return { kind: 'updated', item: { ...checked, workflow: 'changed', workflowAt: at, facts: facts(), note: null, workflowReason: `${why} Here is what Sleeper's data shows:` } };
  }
  // (6) Unchanged for this plan.
  const changed = slots.flatMap((s, i) => ((starters[i] ?? '0') !== (item.baseline[i] ?? '0') ? [`${slotName(s)} (lineup slot ${i + 1}) now ${nameOf(starters[i] ?? '0')}`] : []));
  const note = changed.length ? `${out.name} still starts at ${slotName(item.slot)}. Other slots changed since you saved this: ${changed.join('; ')}.` : null;
  const workflowReason =
    item.workflow === 'done_unverified'
      ? `You marked this done, but Sleeper's latest data still shows ${out.name} at ${slotName(item.slot)}. Sleeper's data may lag by a few minutes.`
      : item.workflow === 'changed'
        ? `Sleeper's latest data shows ${out.name} starting at ${slotName(item.slot)} again; your plan isn't in place.`
        : `You planned: ${out.name} out, ${rep.name} in at ${slotName(item.slot)}. Sleeper's latest data still shows ${out.name} starting.`;
  return { kind: 'updated', item: { ...checked, workflowReason, note, facts: [] } };
}

// ---------- Wording (approved 2026-10-28) ----------

export const WORKFLOW_BADGE: Record<Workflow, string> = {
  pending: 'Pending, not confirmed',
  verified: 'Verified as proposed',
  changed: 'Changed, not as proposed',
  done_unverified: 'Marked done by you, not confirmed',
  expired: 'Expired',
};

export function workflowCheck(item: LineupItem): string {
  switch (item.workflow) {
    case 'pending':
      return `Make the change in ${item.leagueName} if you haven't, then tap Check again. Sleeper's data can be a few minutes behind.`;
    case 'verified':
      return "This reflects Sleeper's data only. It doesn't confirm lock or bye status.";
    case 'changed':
      return 'Open your lineup in Sleeper and confirm it is what you want.';
    case 'done_unverified':
      return "Sleeper's data can lag. Confirm in Sleeper, then tap Check again.";
    case 'expired':
      return 'Search for the player again to see current options.';
  }
}

const ERROR_TEXT: Record<SleeperErrorKind | 'unknown', string> = {
  network: "couldn't reach Sleeper",
  timeout: 'Sleeper took too long to respond',
  rate_limited: 'Sleeper asked the app to slow down (rate limited)',
  server: "Sleeper's servers returned an error",
  bad_response: 'Sleeper sent a reply the app could not read',
  http: 'Sleeper returned an unexpected error',
  unknown: 'something went wrong',
};

export function latestCheckText(check: LatestCheck, fmt: (ms: number) => string): string {
  if (check.kind === 'none') return 'Not checked yet.';
  if (check.kind === 'ok') return `Checked: Sleeper data received at ${fmt(check.receivedAt)}.`;
  return `Check failed at ${fmt(check.at)}: ${ERROR_TEXT[check.error]}. Your saved status hasn't changed.`;
}

/** Sleeper's shared cache note, shown next to every received-at time. */
export const CACHE_NOTE = "Sleeper's servers can hand out a copy a few minutes old (up to about 10), so a very recent change may not show yet.";

/** A successful read: new workflow state (per the rules above) plus the finding from that read. */
export function checkItem(item: LineupItem, read: FreshRead, leagueType: LeagueType): LineupItem {
  const o = applyRead(item, read);
  if (o.kind === 'uncertain') return { ...o.item, finding: { kind: 'uncertain', reason: o.reason } };
  const row = scanLeague({ league: read.league, rosters: read.rosters, ownerId: read.ownerId, players: read.players, playerId: item.outgoing.id, leagueType, state: read.state });
  return { ...o.item, finding: row ? { kind: row.finding.kind, reason: row.finding.reason } : { kind: 'info', reason: `${item.outgoing.name} isn't on your roster in this league.` } };
}

/** The league no longer appears in the owner's league list (a successful read): Expired. */
export function expireMissingLeague(item: LineupItem, at: number): LineupItem {
  if (!checkable(item)) return { ...item, latestCheck: { kind: 'ok', receivedAt: at } };
  return { ...item, latestCheck: { kind: 'ok', receivedAt: at }, workflow: 'expired', workflowAt: at, workflowReason: 'This league no longer appears in your league list for this season.', facts: [], note: null, finding: null };
}
