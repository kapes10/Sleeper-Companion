import { useCallback, type ReactNode } from 'react';
import { LeagueNav } from '../../components/LeagueNav';
import { Button, ErrorMessage, Loading, Notice, Screen, formatTime } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { describeError } from '../../api/client';
import { summarizeLeague } from '../../domain/league';
import { buildRosterView, findOwnerRoster, slotLabel, teamName, type RosterEntry } from '../../domain/roster';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';
import type { SleeperLeague, SleeperLeagueUser, SleeperRoster } from '../../api/types';
import type { PlayersResult } from '../../data/playerCache';
import { formatScaled } from '../../valuations/scale';
import type { PlayerValue } from '../../valuations/match';
import { useLeagueValues, useValueSource, ValuesPanel } from './ValuesPanel';
import { fillEmptySlots, groupByPosition, type GapFill } from '../../analysis/rosterDisplay';
import { leagueTypeOf, loadLeagueTypes } from '../../storage/lineup';

export function RosterScreen({ account, leagueId }: { account: SavedAccount; leagueId: string }) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean): Promise<Loaded> => {
      const [league, rosters, users, players] = await Promise.all([
        services.cached(`league:${leagueId}`, () => services.api.getLeague(leagueId), force),
        services.cached(`rosters:${leagueId}`, () => services.api.getRosters(leagueId), force),
        services.cached(`users:${leagueId}`, () => services.api.getLeagueUsers(leagueId), force),
        services.players(),
      ]);
      if (!league.data) throw new Error('Sleeper has no league with this ID.');
      return { league: league.data, rosters: rosters.data, users: users.data, players, fetchedAt: rosters.fetchedAt };
    },
    [services, leagueId],
  );
  const { state, reload } = useAsync(`roster:${leagueId}`, load);
  const data = state.data;
  const summary = data && summarizeLeague(data.league);
  const values = useLeagueValues(data?.league, data?.players.players);
  const [source, setSource] = useValueSource();
  const refreshAll = () => {
    reload();
    values.reload();
  };

  return (
    <Screen
      title={summary?.name ?? 'League'}
      subtitle={summary && `${summary.format} · ${summary.scoring}`}
      actions={
        <Button onClick={refreshAll} disabled={state.status === 'loading'} aria-label="Refresh roster">
          Refresh
        </Button>
      }
    >
      <a href="#/" className="mb-4 inline-flex min-h-11 items-center text-sm text-emerald-400 hover:text-emerald-300">
        ← All leagues
      </a>
      <LeagueNav leagueId={leagueId} active="roster" />
      <div className="space-y-4">
        {state.status === 'loading' && <Loading label={data ? 'Refreshing…' : 'Loading roster and player names…'} />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load this league" onRetry={reload} />}
        {data && summary && (
          <RosterBody
            account={account}
            data={data}
            isBestBall={summary.isBestBall}
            unsupported={summary.unsupported}
            valuesPanel={(rosterIds) => <ValuesPanel state={values.state} reload={values.reload} source={source} onSourceChange={setSource} rosterIds={rosterIds} />}
            lookup={valueLookup(values.state, source)}
          />
        )}
      </div>
    </Screen>
  );
}

type ValuesState = ReturnType<typeof useLeagueValues>['state'];

/** null = values not loaded yet or failed to load (rows show nothing); otherwise unmatched players show "no value". */
function valueLookup(state: ValuesState, source: 'fantasycalc' | 'csv'): ((id: string) => PlayerValue | null) | null {
  const d = state.data;
  if (!d) return null;
  const map = source === 'csv' && d.csv ? d.csvValues : d.fcValues;
  // No set for this league's format: every player has "no value" (never zero or an estimate).
  return (id) => map?.get(id) ?? null;
}

interface Loaded {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  players: PlayersResult;
  fetchedAt: number;
}

function RosterBody({
  account,
  data,
  isBestBall,
  unsupported,
  valuesPanel,
  lookup,
}: {
  account: SavedAccount;
  data: Loaded;
  isBestBall: boolean;
  unsupported: string[];
  valuesPanel: (rosterIds: string[]) => ReactNode;
  lookup: ((id: string) => PlayerValue | null) | null;
}) {
  const match = findOwnerRoster(data.rosters, account.userId);
  const players = data.players;

  const freshness = (
    <p className="text-xs text-slate-500">
      Rosters updated {formatTime(data.fetchedAt)} · Player names from Sleeper, downloaded {formatTime(players.fetchedAt)}{' '}
      ({players.source === 'cache' ? 'cached copy, refreshed every 24 h' : 'fresh download'})
    </p>
  );

  if (match.kind === 'not_found') {
    return (
      <>
        <Notice tone="warn">None of the rosters in this league belong to {account.displayName}. This app won't guess which team is yours.</Notice>
        {freshness}
      </>
    );
  }
  if (match.kind === 'ambiguous') {
    return (
      <>
        <Notice tone="warn">
          You appear on more than one roster in this league (rosters {match.rosterIds.join(', ')}). Rather than guess, no roster is shown.
        </Notice>
        {freshness}
      </>
    );
  }

  const view = buildRosterView(match.roster, data.league.roster_positions, players.players);
  const name = teamName(data.users, match.roster.owner_id);
  const hasEmpty = view.starters.some((s) => !s.player);
  // Best-ball gap fill uses the owner's league type (Lineups → League types), never a guess.
  const markedBestBall = leagueTypeOf(loadLeagueTypes(), data.league.league_id) === 'bestball';
  const fills: GapFill[] = markedBestBall && lookup ? fillEmptySlots(match.roster, data.league.roster_positions, players.players, lookup) : [];
  const fillAt = new Map(fills.map((f) => [f.slotIndex, f]));
  const filledIds = new Set(fills.flatMap((f) => (f.playerId ? [f.playerId] : [])));
  const bench = view.bench.filter((p) => !filledIds.has(p.playerId));
  const entryFor = (id: string): RosterEntry => {
    const p = players.players[id]!;
    return { playerId: id, name: p.name, position: p.position, team: p.team, injuryStatus: p.injuryStatus, unknown: false };
  };

  return (
    <>
      {name && (
        <p className="text-sm text-slate-300">
          Team: <span className="text-slate-100">{name}</span>
          {match.role === 'co-owner' && ' (you are a co-owner)'}
        </p>
      )}
      {freshness}
      {players.stale && (
        <Notice tone="warn">
          Player names may be out of date: the saved list is more than 24 hours old and refreshing it failed ({describeError(players.refreshError)}).
        </Notice>
      )}
      {unsupported.length > 0 && <Notice tone="warn">This league has settings the app doesn't support yet: {unsupported.join(', ')}.</Notice>}
      {isBestBall && (
        <Notice>
          Best ball league: Sleeper picks the highest-scoring lineup automatically each week. Starters below are the lineup Sleeper currently has stored for this roster.
        </Notice>
      )}
      {valuesPanel(match.roster.players ?? [])}
      {view.unknownPlayerIds.length > 0 && (
        <Notice tone="warn">
          {view.unknownPlayerIds.length} player ID(s) on this roster aren't in Sleeper's player list ({view.unknownPlayerIds.join(', ')}).
        </Notice>
      )}

      {hasEmpty && isBestBall && !markedBestBall && (
        <Notice>
          This lineup has empty slots in Sleeper. To show them filled with your highest-value eligible bench players, mark this league as Best ball under{' '}
          <a href="#/lineups/types" className="underline">
            Lineups → League types
          </a>
          .
        </Notice>
      )}
      {hasEmpty && markedBestBall && !lookup && <Notice tone="warn">This lineup has empty slots in Sleeper. Player values aren't available, so they can't be filled here.</Notice>}
      {filledIds.size > 0 && (
        <Notice tone="warn">
          {filledIds.size} empty lineup slot{filledIds.size === 1 ? ' is' : 's are'} shown filled with your highest market-value eligible bench player{filledIds.size === 1 ? '' : 's'} (market value, not projected points).
          Sleeper still has {filledIds.size === 1 ? 'it' : 'them'} empty; nothing is changed in Sleeper.
        </Notice>
      )}

      <Section title="Starters" count={view.starters.length}>
        {view.starters.map((s, i) => {
          const fill = fillAt.get(i);
          if (fill?.playerId) return <PlayerRow key={`${s.slot}-${i}`} slot={slotLabel(fill.slot)} entry={entryFor(fill.playerId)} lookup={lookup} note={fill.reason} />;
          return <PlayerRow key={`${s.slot}-${i}`} slot={s.slot} entry={s.player} lookup={lookup} note={fill?.reason} />;
        })}
      </Section>
      <Section title="Bench" count={bench.length}>
        {bench.length === 0 ? <EmptyRow text={filledIds.size ? 'No other bench players' : 'No bench players'} /> : <Grouped entries={bench} slot="BN" lookup={lookup} />}
      </Section>
      {view.reserve.length > 0 && (
        <Section title="Injured reserve" count={view.reserve.length}>
          <Grouped entries={view.reserve} slot="IR" lookup={lookup} />
        </Section>
      )}
      {view.taxi.length > 0 && (
        <Section title="Taxi squad" count={view.taxi.length}>
          <Grouped entries={view.taxi} slot="TX" lookup={lookup} />
        </Section>
      )}
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title} <span className="text-slate-600">({count})</span>
      </h2>
      <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl bg-slate-900">{children}</ul>
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <li className="px-3 py-3 text-sm text-slate-500">{text}</li>;
}

/** Bench / IR / taxi: grouped by position, highest value first (owner approved 2026-10-29). */
function Grouped({ entries, slot, lookup }: { entries: RosterEntry[]; slot: string; lookup: ((id: string) => PlayerValue | null) | null }) {
  return (
    <>
      {groupByPosition(entries, lookup).map((g) => (
        <li key={g.position} role="group" aria-label={`${g.position} group`}>
          <p className="bg-slate-950/50 px-3 py-1 text-xs font-semibold text-slate-400">
            {g.position} ({g.players.length})
          </p>
          <ul className="divide-y divide-slate-800">
            {g.players.map((p) => (
              <PlayerRow key={p.playerId} slot={slot} entry={p} lookup={lookup} />
            ))}
          </ul>
        </li>
      ))}
    </>
  );
}

function PlayerRow({ slot, entry, lookup, note }: { slot: string; entry: RosterEntry | null; lookup: ((id: string) => PlayerValue | null) | null; note?: string }) {
  const value = entry && lookup ? lookup(entry.playerId) : null;
  if (note) {
    return (
      <li className="border-l-4 border-amber-500 bg-amber-950/20" data-testid="filled-slot">
        <PlayerRowBody slot={slot} entry={entry} lookup={lookup} value={value} />
        <p className="px-3 pb-2 text-xs text-amber-200">{note}</p>
      </li>
    );
  }
  return (
    <li>
      <PlayerRowBody slot={slot} entry={entry} lookup={lookup} value={value} />
    </li>
  );
}

function PlayerRowBody({ slot, entry, lookup, value }: { slot: string; entry: RosterEntry | null; lookup: ((id: string) => PlayerValue | null) | null; value: PlayerValue | null }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-3 py-2">
      <span className="w-12 shrink-0 rounded bg-slate-800 py-1 text-center text-xs font-semibold text-slate-300">{slot}</span>
      {entry ? (
        <div className="min-w-0 flex-1">
          <p className={`truncate ${entry.unknown ? 'text-amber-300' : 'text-slate-50'}`}>{entry.name}</p>
          <p className="text-xs text-slate-400">
            {entry.position ?? '—'} · {entry.team ?? 'Free agent'}
            {entry.injuryStatus && <span className="ml-2 text-amber-300">{entry.injuryStatus}</span>}
          </p>
        </div>
      ) : (
        <p className="flex-1 text-sm italic text-slate-500">Empty</p>
      )}
      {entry && lookup && (
        <div className="shrink-0 text-right" data-testid="player-value">
          {value ? (
            <>
              <p className="font-semibold tabular-nums text-slate-50">{formatScaled(value.scaled)}</p>
              <p className="text-xs tabular-nums text-slate-500">{value.raw.toLocaleString()}</p>
            </>
          ) : (
            <p className="text-xs italic text-slate-500">no value</p>
          )}
        </div>
      )}
    </div>
  );
}
