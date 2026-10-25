import { useCallback, type ReactNode } from 'react';
import { Button, ErrorMessage, Loading, Notice, Screen, formatTime } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { describeError } from '../../api/client';
import { summarizeLeague } from '../../domain/league';
import { buildRosterView, findOwnerRoster, teamName, type RosterEntry } from '../../domain/roster';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';
import type { SleeperLeague, SleeperLeagueUser, SleeperRoster } from '../../api/types';
import type { PlayersResult } from '../../data/playerCache';

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

  return (
    <Screen
      title={summary?.name ?? 'League'}
      subtitle={summary && `${summary.format} · ${summary.scoring}`}
      actions={
        <Button onClick={reload} disabled={state.status === 'loading'} aria-label="Refresh roster">
          Refresh
        </Button>
      }
    >
      <a href="#/" className="mb-4 inline-flex min-h-11 items-center text-sm text-emerald-400 hover:text-emerald-300">
        ← All leagues
      </a>
      <div className="space-y-4">
        {state.status === 'loading' && <Loading label={data ? 'Refreshing…' : 'Loading roster and player names…'} />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load this league" onRetry={reload} />}
        {data && summary && <RosterBody account={account} data={data} isBestBall={summary.isBestBall} unsupported={summary.unsupported} />}
      </div>
    </Screen>
  );
}

interface Loaded {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  players: PlayersResult;
  fetchedAt: number;
}

function RosterBody({ account, data, isBestBall, unsupported }: { account: SavedAccount; data: Loaded; isBestBall: boolean; unsupported: string[] }) {
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
      {view.unknownPlayerIds.length > 0 && (
        <Notice tone="warn">
          {view.unknownPlayerIds.length} player ID(s) on this roster aren't in Sleeper's player list ({view.unknownPlayerIds.join(', ')}).
        </Notice>
      )}

      <Section title="Starters" count={view.starters.length}>
        {view.starters.map((s, i) => (
          <PlayerRow key={`${s.slot}-${i}`} slot={s.slot} entry={s.player} />
        ))}
      </Section>
      <Section title="Bench" count={view.bench.length}>
        {view.bench.length === 0 ? <EmptyRow text="No bench players" /> : view.bench.map((p) => <PlayerRow key={p.playerId} slot="BN" entry={p} />)}
      </Section>
      {view.reserve.length > 0 && (
        <Section title="Injured reserve" count={view.reserve.length}>
          {view.reserve.map((p) => (
            <PlayerRow key={p.playerId} slot="IR" entry={p} />
          ))}
        </Section>
      )}
      {view.taxi.length > 0 && (
        <Section title="Taxi squad" count={view.taxi.length}>
          {view.taxi.map((p) => (
            <PlayerRow key={p.playerId} slot="TX" entry={p} />
          ))}
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

function PlayerRow({ slot, entry }: { slot: string; entry: RosterEntry | null }) {
  return (
    <li className="flex min-h-12 items-center gap-3 px-3 py-2">
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
    </li>
  );
}
