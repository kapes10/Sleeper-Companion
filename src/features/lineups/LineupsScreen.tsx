import { useCallback, useMemo, useState } from 'react';
import { searchPlayers, SEARCH_LIMIT } from '../../analysis/lineup/search';
import { checkable } from '../../analysis/lineup/verify';
import { MainTabs } from '../../components/MainTabs';
import { Button, ErrorMessage, Loading, Notice, Screen } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { useServices } from '../../services';
import { leagueTypeOf, loadLeagueTypes } from '../../storage/lineup';
import type { SavedAccount } from '../../storage/prefs';
import { loadLineupContext } from './loadLineups';
import { DeviceOnlyNote, ItemCard, LinkNote } from './LineupUi';
import { useItems } from './useItems';

export function LineupsScreen({ account }: { account: SavedAccount }) {
  const services = useServices();
  const load = useCallback((force: boolean) => loadLineupContext(services, account, force), [services, account]);
  const { state, reload } = useAsync(`lineups:${account.userId}`, load);
  const ctx = state.data;
  const [query, setQuery] = useState('');
  const results = useMemo(() => (ctx ? searchPlayers(ctx.players, query, new Set()) : []), [ctx, query]);
  const types = useMemo(() => loadLeagueTypes(), []);
  const unknown = ctx ? ctx.leagues.filter((l) => leagueTypeOf(types, l.league_id) === 'unknown').length : 0;
  const { items, busy, check, done, opened, remove, clearAll } = useItems(services, account);
  const [confirmClear, setConfirmClear] = useState(false);
  const pending = items.filter(checkable);
  const pendingLeagues = new Set(pending.map((i) => i.leagueId)).size;

  return (
    <Screen title="Lineup Manager" subtitle="Find where a player sits across your leagues and who on your bench could take his slot.">
      <MainTabs active="lineups" />
      <div className="space-y-4">
        <Notice>
          Read-only helper: this app never changes your lineup. You make every change yourself in Sleeper, and the app checks Sleeper's data only when you ask. No projections, rankings or start/sit advice.
        </Notice>
        {state.status === 'loading' && !ctx && <Loading label="Loading your leagues and the player list…" />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load your leagues" onRetry={reload} />}
        {ctx && unknown > 0 && (
          <Notice tone="warn">
            {unknown} of your {ctx.leagues.length} leagues have no type set, so they're shown for information only.{' '}
            <a href="#/lineups/types" className="font-medium text-amber-200 underline">
              Set league types →
            </a>
          </Notice>
        )}
        <p className="text-sm">
          <a href="#/lineups/types" className="text-emerald-400 underline">
            League types (Managed, Best ball, Unknown)
          </a>
        </p>

        <section aria-label="Player search" className="space-y-2">
          <label htmlFor="player-search" className="block text-sm font-medium text-slate-200">
            Find a player
          </label>
          <input
            id="player-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a name, e.g. Kirk Cousins"
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            disabled={!ctx}
          />
          {ctx && query.trim().length >= 2 && results.length === 0 && <p className="text-sm text-slate-400">No QB, RB, WR or TE in Sleeper's player list matches "{query.trim()}".</p>}
          {results.length > 0 && (
            <ul aria-label="Search results" className="space-y-1">
              {results.map((p) => (
                <li key={p.id}>
                  <a
                    href={`#/lineups/player/${p.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <span className="min-w-0 break-words text-slate-100">{p.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {p.position ?? '?'} · {p.team ?? 'no NFL team'}
                      {p.injuryStatus ? ` · ${p.injuryStatus}` : ''}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {results.length === SEARCH_LIMIT && <p className="text-xs text-slate-500">Showing the first {SEARCH_LIMIT} matches; type more of the name to narrow it.</p>}
        </section>

        <section aria-label="Your checklist" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-50">Your checklist</h2>
          <DeviceOnlyNote />
          {items.length === 0 && <p className="text-sm text-slate-400">No saved plans. Search for a player, pick replacements, and review them to start a checklist.</p>}
          {items.length > 0 && (
            <>
              <p className="text-sm text-slate-400">Each league is separate: make each change in Sleeper, then check it. Nothing here changes Sleeper.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={!pending.length || busy.size > 0} onClick={() => check(pending.map((i) => i.key))}>
                  Check all pending ({pendingLeagues} league{pendingLeagues === 1 ? '' : 's'})
                </Button>
                {!confirmClear && <Button onClick={() => setConfirmClear(true)}>Clear all</Button>}
              </div>
              {confirmClear && (
                <div role="group" aria-label="Confirm clear all" className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 p-3 text-sm text-slate-200">
                  Remove all {items.length} saved plan{items.length === 1 ? '' : 's'} from this device?
                  <Button
                    onClick={() => {
                      clearAll();
                      setConfirmClear(false);
                    }}
                  >
                    Yes, clear all
                  </Button>
                  <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
                </div>
              )}
              <LinkNote />
              <ul className="space-y-3">
                {items.map((i) => (
                  <ItemCard key={i.key} item={i} busy={busy.has(i.key)} onCheck={() => check([i.key])} onDone={() => done(i.key)} onOpen={() => opened(i.key)} onRemove={() => remove(i.key)} />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </Screen>
  );
}
