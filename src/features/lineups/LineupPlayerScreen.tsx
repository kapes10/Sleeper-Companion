// Cross-league view for one player: placement in every league where the owner rosters him,
// replacement candidates in Managed leagues where he starts, selection, review and saving.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { describeError } from '../../api/client';
import type { SleeperLeague } from '../../api/types';
import { confirmProposal, injuryNote, LOCK_CAVEAT, placementText, scanLeague, slotName, type LeagueRow } from '../../analysis/lineup/placement';
import { itemKey, latestCheckText, newItem, CACHE_NOTE, type LineupItem } from '../../analysis/lineup/verify';
import { Button, ErrorMessage, formatTime, Loading, Notice, Screen } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { useServices } from '../../services';
import { addItems, leagueTypeOf, loadItems, loadLeagueTypes } from '../../storage/lineup';
import type { SavedAccount } from '../../storage/prefs';
import { freshRead, loadLineupContext, readRosters, type LineupContext, type RosterRead } from './loadLineups';
import { DeviceOnlyNote, FindingBadge, NothingChangedNote, WorkflowBadge } from './LineupUi';
import { useItems } from './useItems';

type ReviewEntry = { leagueId: string; leagueName: string } & ({ ok: true; item: LineupItem; receivedAt: number } | { ok: false; reason: string });
type Review = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; entries: ReviewEntry[] };

export function LineupPlayerScreen({ account, playerId }: { account: SavedAccount; playerId: string }) {
  const services = useServices();
  const load = useCallback((force: boolean) => loadLineupContext(services, account, force), [services, account]);
  const { state: ctxState, reload } = useAsync(`lineups:${account.userId}`, load);
  const ctx = ctxState.data;
  const [reads, setReads] = useState<Map<string, RosterRead | 'loading'>>(new Map());
  const types = useMemo(() => loadLeagueTypes(), []);
  const { items, setItems } = useItems(services, account);
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set());
  const [review, setReview] = useState<Review | null>(null);

  const readLeague = useCallback(
    async (leagueId: string, force: boolean) => {
      setReads((m) => new Map(m).set(leagueId, 'loading'));
      const r = await readRosters(services, leagueId, force);
      setReads((m) => new Map(m).set(leagueId, r));
    },
    [services],
  );
  useEffect(() => {
    if (!ctx) return;
    for (const l of ctx.leagues) void readLeague(l.league_id, false);
  }, [ctx, readLeague]);

  if (!ctx) {
    return (
      <Shell>
        {ctxState.status === 'error' ? <ErrorMessage error={ctxState.error} title="Couldn't load your leagues" onRetry={reload} /> : <Loading label="Loading your leagues and the player list…" />}
      </Shell>
    );
  }
  const player = ctx.players[playerId];
  if (!player) {
    return (
      <Shell>
        <Notice tone="warn">This player isn't in Sleeper's player list on this device (ID {playerId}).</Notice>
      </Shell>
    );
  }

  const rowFor = (league: SleeperLeague, r: RosterRead & { ok: true }): LeagueRow | null =>
    scanLeague({ league, rosters: r.rosters, ownerId: account.userId, players: ctx.players, playerId, leagueType: leagueTypeOf(types, league.league_id), state: ctx.state });
  const done = ctx.leagues.filter((l) => {
    const r = reads.get(l.league_id);
    return r && r !== 'loading';
  }).length;
  const rows = ctx.leagues.map((l) => {
    const r = reads.get(l.league_id);
    return { league: l, read: r, row: r && r !== 'loading' && r.ok ? rowFor(l, r) : null };
  });
  const failed = rows.filter((x) => x.read && x.read !== 'loading' && !x.read.ok);
  // Leagues with a choice to make come first (Sleeper's league order kept within each group).
  const actionable = (x: (typeof rows)[number]) => (x.row!.finding.kind === 'available' || x.row!.finding.kind === 'none' ? 0 : 1);
  const shown = rows.filter((x) => x.row).sort((a, b) => actionable(a) - actionable(b));
  const notRostered = rows.filter((x) => x.read && x.read !== 'loading' && x.read.ok && !x.row).length;
  const savedItem = (leagueId: string) => items.find((i) => i.key === itemKey(leagueId, playerId, ctx.state));
  const selectable = (row: LeagueRow) => row.finding.kind === 'available' && !savedItem(row.leagueId);
  const selected = shown.filter((x) => included.has(x.league.league_id) && selectable(x.row!) && chosen.has(x.league.league_id));

  async function startReview() {
    setReview({ status: 'loading' });
    const ids = selected.map((x) => x.league.league_id);
    const res = await freshRead(services, account, ids);
    if (!res.ok) return setReview({ status: 'error', error: res.error });
    const freshCtx: LineupContext = { ...ctx!, state: res.state, leagues: res.leagues };
    const entries: ReviewEntry[] = selected.map(({ league, row }) => {
      const base = { leagueId: league.league_id, leagueName: league.name.trim() };
      const r = res.rosters.get(league.league_id)!;
      if (!r.ok) return { ...base, ok: false, reason: `Couldn't read this league just now (${errorText(r.error)}). Nothing was saved for it; try again.` };
      const freshLeague = freshCtx.leagues.find((l) => l.league_id === league.league_id);
      if (!freshLeague) return { ...base, ok: false, reason: 'This league no longer appears in your league list.' };
      const fresh = scanLeague({ league: freshLeague, rosters: r.rosters, ownerId: account.userId, players: ctx!.players, playerId, leagueType: leagueTypeOf(types, league.league_id), state: res.state });
      const f = row!.finding as Extract<LeagueRow['finding'], { kind: 'available' }>;
      const c = confirmProposal(fresh, { slot: f.slot, slotIndex: f.slotIndex }, chosen.get(league.league_id)!, player!.name);
      if (!c.ok) return { ...base, ok: false, reason: c.reason };
      const item = newItem({
        league: freshLeague,
        roster: c.row.roster!,
        state: res.state,
        outgoing: { id: playerId, name: player!.name },
        replacement: { id: c.candidate.id, name: c.candidate.name },
        slot: f.slot,
        slotIndex: f.slotIndex,
        receivedAt: r.receivedAt,
        now: services.now(),
        finding: { kind: c.row.finding.kind, reason: c.row.finding.reason },
      });
      return { ...base, ok: true, item, receivedAt: r.receivedAt };
    });
    setReview({ status: 'ready', entries });
  }

  function save(entries: ReviewEntry[]) {
    const added = entries.flatMap((e) => (e.ok ? [e.item] : []));
    setItems(addItems(loadItems(), added).items);
    location.hash = '#/lineups';
  }

  if (review) {
    return (
      <Shell name={player.name}>
        <section aria-label="Review" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-50">Review your planned changes</h2>
          <NothingChangedNote />
          {review.status === 'loading' && <Loading label="Reading Sleeper's latest data for the selected leagues…" />}
          {review.status === 'error' && <ErrorMessage error={review.error} title="Couldn't read Sleeper's latest data, so nothing was saved" onRetry={startReview} />}
          {review.status === 'ready' && (
            <>
              <ul className="space-y-2" aria-label="Planned changes">
                {review.entries.map((e) => (
                  <li key={e.leagueId} className="space-y-1 rounded-xl bg-slate-900 p-3 text-sm">
                    <p className="font-medium break-words text-slate-50">{e.leagueName}</p>
                    {e.ok ? (
                      <>
                        <p className="text-slate-200">
                          Out: <strong>{e.item.outgoing.name}</strong> · In: <strong>{e.item.replacement.name}</strong> · Slot: {slotName(e.item.slot)} (lineup slot {e.item.slotIndex + 1})
                        </p>
                        <p className="text-xs text-slate-400">
                          Sleeper data received at {formatTime(e.receivedAt)}. {CACHE_NOTE}
                        </p>
                      </>
                    ) : (
                      <p className="text-amber-100">Dropped from this review: {e.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
              <Notice tone="warn">{LOCK_CAVEAT}</Notice>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={!review.entries.some((e) => e.ok)} onClick={() => save(review.entries)}>
                  Save {review.entries.filter((e) => e.ok).length} to my checklist
                </Button>
                <Button onClick={() => setReview(null)}>Back</Button>
              </div>
              <p className="text-xs text-slate-500">Saving adds a to-do list on this device. It doesn't change anything in Sleeper.</p>
            </>
          )}
        </section>
      </Shell>
    );
  }

  return (
    <Shell name={player.name}>
      <div className="space-y-3">
        <p className="text-sm text-slate-300">
          {player.name} · {player.position ?? '?'} · {player.team ?? 'no NFL team'}
          {player.injuryStatus ? ` · Sleeper injury status: ${player.injuryStatus} (a note only)` : ''}
        </p>
        {done < ctx.leagues.length && <Loading label={`Checking your leagues… ${done} of ${ctx.leagues.length}`} />}
        {done === ctx.leagues.length && shown.length === 0 && failed.length === 0 && <Notice>You don't roster {player.name} in any of your {ctx.leagues.length} leagues.</Notice>}
        {notRostered > 0 && shown.length > 0 && (
          <p className="text-xs text-slate-500">
            Not on your roster in {notRostered} of {ctx.leagues.length} leagues.
          </p>
        )}
        <ul className="space-y-3" aria-label="Leagues where you roster him">
          {failed.map(({ league, read }) => (
            <li key={league.league_id} role="alert" className="space-y-2 rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm">
              <p className="font-medium break-words text-slate-50">{league.name.trim()}</p>
              <p className="text-red-100">
                <strong>Couldn't load this league:</strong> {errorText((read as { error: unknown }).error)}. The other leagues aren't affected.
              </p>
              <Button onClick={() => readLeague(league.league_id, true)}>Try again</Button>
            </li>
          ))}
          {shown.map(({ league, read, row }) => {
            const r = row!;
            const item = savedItem(r.leagueId);
            const sel = selectable(r);
            return (
              <li key={league.league_id} aria-label={`League ${r.leagueName}`} className="space-y-2 rounded-xl bg-slate-900 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words text-slate-50">{r.leagueName}</span>
                  {item ? <WorkflowBadge workflow={item.workflow} /> : <FindingBadge finding={r.finding} />}
                </div>
                <p className="text-slate-200">{placementText(r.placement)}</p>
                <p className="text-slate-300">
                  <span className="text-slate-400">Finding: </span>
                  {item && <FindingBadge finding={r.finding} />} {r.finding.reason}
                </p>
                {r.finding.kind !== 'available' && (
                  <p className="text-slate-300">
                    <span className="text-slate-400">What to check in Sleeper: </span>
                    {r.finding.check}
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  Latest check:{' '}
                  {item
                    ? `${latestCheckText(item.latestCheck, formatTime)} (saved plan: ${item.replacement.name} in at ${slotName(item.slot)}; see your checklist)`
                    : `Sleeper data received at ${formatTime((read as { receivedAt: number }).receivedAt)}.`}
                </p>
                {r.notes.map((n) => (
                  <p key={n} className="text-xs text-slate-400">
                    {n}
                  </p>
                ))}
                {r.finding.kind === 'available' && sel && (
                  <fieldset className="space-y-2 rounded-lg border border-slate-800 p-2">
                    <legend className="px-1 text-xs text-slate-400">Eligible on your bench (under this app's slot rules, not ranked)</legend>
                    <label className="flex min-h-11 items-center gap-2 font-medium text-slate-100">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-emerald-500"
                        checked={included.has(r.leagueId)}
                        onChange={(e) => {
                          const next = new Set(included);
                          if (e.target.checked) next.add(r.leagueId);
                          else next.delete(r.leagueId);
                          setIncluded(next);
                        }}
                      />
                      Include {r.leagueName} in my review
                    </label>
                    <ul className="space-y-1">
                      {r.finding.candidates.map((c) => {
                        const note = injuryNote(c);
                        return (
                          <li key={c.id}>
                            <label className="flex min-h-11 items-start gap-2 text-slate-200">
                              <input
                                type="radio"
                                className="mt-1 h-5 w-5 shrink-0 accent-emerald-500"
                                name={`cand-${r.leagueId}`}
                                checked={chosen.get(r.leagueId) === c.id}
                                onChange={() => {
                                  setChosen(new Map(chosen).set(r.leagueId, c.id));
                                  setIncluded(new Set(included).add(r.leagueId));
                                }}
                              />
                              <span>
                                {c.name} <span className="text-slate-400">({c.position ?? '?'}, {c.team ?? 'no NFL team'})</span>
                                {note && <span className="block text-xs text-amber-200">{note}</span>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-amber-200">{LOCK_CAVEAT}</p>
                  </fieldset>
                )}
                {r.finding.kind === 'available' && !sel && <p className="text-xs text-slate-400">Already in your checklist for this week.</p>}
              </li>
            );
          })}
        </ul>
        {shown.some((x) => selectable(x.row!)) && (
          <div className="sticky bottom-2 space-y-2 rounded-xl border border-slate-700 bg-slate-950/95 p-3">
            <Button variant="primary" disabled={!selected.length} onClick={startReview}>
              Review {selected.length} change{selected.length === 1 ? '' : 's'}
            </Button>
            <p className="text-xs text-slate-400">Review reads Sleeper's latest data for the selected leagues first. Nothing is changed in Sleeper.</p>
          </div>
        )}
        <DeviceOnlyNote />
      </div>
    </Shell>
  );
}

function Shell({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <Screen title={name ? `Lineups: ${name}` : 'Lineup Manager'} subtitle="Read-only: you make any change yourself in Sleeper.">
      <p className="mb-3 text-sm">
        <a href="#/lineups" className="text-emerald-400 underline">
          ← Lineup Manager
        </a>
      </p>
      {children}
    </Screen>
  );
}

const errorText = (e: unknown) => describeError(e).replace(/\.$/, '');
