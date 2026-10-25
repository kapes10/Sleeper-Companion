// Match report: for each published FantasyCalc snapshot and each manual CSV set, how many rows
// matched a Sleeper player by Sleeper ID, and every row that didn't.
import { useCallback } from 'react';
import { FantasyCalcAttribution } from '../../components/Attribution';
import { Button, ErrorMessage, Loading, Notice, Screen, formatTime } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';
import { describeCsvFormat, loadCsvLibrary, type CsvSet } from '../../valuations/csv/store';
import { describeParams, mapLeagueToFcParams } from '../../valuations/fantasycalc/params';
import type { SetState } from '../../valuations/fantasycalc/refresh';
import { countByReason, matchValues, UNMATCHED_LABELS, type MatchResult, type ValueRow } from '../../valuations/match';
import { fcFreshness, formatAge } from '../../valuations/staleness';

export function ValuesScreen({ account }: { account: SavedAccount }) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean) => {
      const state = await services.cached('state:nfl', () => services.api.getNflState(), force);
      const season = state.data.league_season || state.data.season;
      const [index, players, leagues, library] = await Promise.all([
        services.fcIndex(force),
        services.players(),
        services.cached(`leagues:${account.userId}:${season}`, () => services.api.getUserLeagues(account.userId, season), force),
        loadCsvLibrary(services.store).catch(() => ({})),
      ]);
      const usage = new Map<string, string[]>();
      const unsupported: { name: string; reasons: string[] }[] = [];
      for (const l of leagues.data) {
        const m = mapLeagueToFcParams(l);
        if (m.ok) usage.set(m.key, [...(usage.get(m.key) ?? []), l.name]);
        else unsupported.push({ name: l.name, reasons: m.reasons });
      }
      const sets = await Promise.all(
        Object.values(index.data?.sets ?? {}).map(async (set) => {
          const snap = set.latest ? await services.fcSnapshot(set.latest) : null;
          return { set, snap, match: snap ? matchValues(snap.rows, players.players) : null };
        }),
      );
      const csvSets = Object.values(library)
        .flatMap((slot) => [slot.latest, slot.previous])
        .filter((s): s is CsvSet => !!s)
        .map((csv) => ({ csv, match: matchValues(csv.rows, players.players) }));
      return { published: index.data !== null, sets, usage, unsupported, csvSets };
    },
    [services, account.userId],
  );
  const { state, reload } = useAsync(`values-report:${account.userId}`, load);
  const data = state.data;

  return (
    <Screen
      title="Player values"
      subtitle="Match report: values are matched to Sleeper players by Sleeper ID only."
      actions={
        <Button onClick={reload} disabled={state.status === 'loading'} aria-label="Refresh values">
          Refresh
        </Button>
      }
    >
      <nav className="mb-4 flex flex-wrap gap-4 text-sm">
        <a href="#/" className="inline-flex min-h-11 items-center text-emerald-400 hover:text-emerald-300">
          ← All leagues
        </a>
        <a href="#/import" className="inline-flex min-h-11 items-center text-emerald-400 hover:text-emerald-300">
          Import a CSV →
        </a>
      </nav>
      <div className="space-y-4">
        {state.status === 'loading' && <Loading label={data ? 'Refreshing…' : 'Loading values…'} />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load the match report" onRetry={reload} />}
        {data && (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">FantasyCalc (automatic)</h2>
            <FantasyCalcAttribution />
            {!data.published && <Notice tone="warn">No FantasyCalc values have been published yet. The scheduled job hasn't run on the hosted site.</Notice>}
            {data.sets.map(({ set, match, snap }) => (
              <FcSetReport key={set.key} set={set} match={match} unreadable={snap?.unreadableCount ?? 0} leagues={data.usage.get(set.key) ?? []} now={services.now()} />
            ))}
            {[...data.usage.keys()]
              .filter((k) => !data.sets.some((s) => s.set.key === k))
              .map((k) => (
                <Notice key={k} tone="warn">
                  No FantasyCalc values exist yet for {data.usage.get(k)!.length} of your leagues (format {k}).
                </Notice>
              ))}
            {data.unsupported.length > 0 && (
              <Notice tone="warn">
                <p className="font-medium">Leagues that can't use FantasyCalc values:</p>
                <ul className="mt-1 list-disc pl-5">
                  {data.unsupported.map((u) => (
                    <li key={u.name}>
                      {u.name}: {u.reasons.join(' ')}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}

            <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Manual CSV (this device only)</h2>
            {data.csvSets.length === 0 && <Notice>No CSV imports on this device.</Notice>}
            {data.csvSets.map(({ csv, match }) => (
              <article key={csv.id} className="space-y-2 rounded-xl bg-slate-900 p-4" aria-label={`CSV ${csv.name}`}>
                <h3 className="font-medium text-slate-50">
                  {csv.name} <span className="text-sm font-normal text-slate-400">· {describeCsvFormat(csv)}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Source: {csv.source} · exported {csv.exportDate} · imported {formatTime(Date.parse(csv.importedAt))} · {csv.skippedRows} row(s) skipped at import
                </p>
                <MatchCounts match={match} total={csv.rows.length} />
                <UnmatchedList match={match} />
              </article>
            ))}
          </>
        )}
      </div>
    </Screen>
  );
}

function FcSetReport({ set, match, unreadable, leagues, now }: { set: SetState; match: MatchResult | null; unreadable: number; leagues: string[]; now: number }) {
  const fresh = fcFreshness(set, now);
  return (
    <article className="space-y-2 rounded-xl bg-slate-900 p-4" aria-label={`FantasyCalc ${set.key}`}>
      <h3 className="font-medium text-slate-50">{describeParams(set.params)}</h3>
      <p className="text-xs text-slate-400">
        Used by {leagues.length} of your leagues · request: <code className="break-all">{set.latest?.url ?? set.key}</code>
      </p>
      {fresh.kind === 'missing' ? (
        <Notice tone="warn">No snapshot yet.{set.lastError && ` Last attempt failed: ${set.lastError}`}</Notice>
      ) : (
        <>
          <p className="text-sm text-slate-300">
            Snapshot from {formatTime(fresh.fetchedAt)} ({formatAge(fresh.ageMs)} ago)
            {set.previous && ` · previous snapshot ${formatTime(Date.parse(set.previous.fetchedAt))}`}
          </p>
          {fresh.kind === 'stale' && (
            <Notice tone="warn">
              These values are {formatAge(fresh.ageMs)} old.{fresh.lastAttemptFailed && fresh.lastError && ` The latest refresh failed: ${fresh.lastError}`}
            </Notice>
          )}
          {fresh.kind === 'fresh' && fresh.lastAttemptFailed && <Notice tone="warn">The latest refresh failed ({fresh.lastError}); showing the previous good snapshot.</Notice>}
        </>
      )}
      {match && set.latest && (
        <>
          <MatchCounts match={match} total={set.latest.playerCount} />
          <p className="text-xs text-slate-500">
            {set.latest.pickCount} draft-pick values stored, not used yet.{unreadable > 0 && ` ${unreadable} unreadable row(s) ignored.`}
          </p>
          <UnmatchedList match={match} />
        </>
      )}
    </article>
  );
}

function MatchCounts({ match, total }: { match: MatchResult; total: number }) {
  const reasons = countByReason(match.unmatched);
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      <Stat label="Player rows" value={total} />
      <Stat label="Matched" value={match.bySleeperId.size} />
      <Stat label="Unmatched" value={match.unmatched.length} />
      {(Object.keys(reasons) as (keyof typeof reasons)[])
        .filter((r) => reasons[r] > 0)
        .map((r) => (
          <Stat key={r} label={UNMATCHED_LABELS[r]} value={reasons[r]} />
        ))}
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-950 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-slate-50">{value}</dd>
    </div>
  );
}

function UnmatchedList({ match }: { match: MatchResult }) {
  if (match.unmatched.length === 0) return <p className="text-sm text-emerald-300">Every row matched a Sleeper player.</p>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer py-1 text-slate-300">Show {match.unmatched.length} unmatched row(s)</summary>
      <ul className="mt-2 divide-y divide-slate-800 rounded-lg bg-slate-950">
        {match.unmatched.map(({ row, reason }: { row: ValueRow; reason: keyof typeof UNMATCHED_LABELS }, i) => (
          <li key={`${row.sleeperId}-${i}`} className="px-3 py-2">
            <p className="text-slate-100">
              {row.name} <span className="text-xs text-slate-400">{[row.position, row.team].filter(Boolean).join(' · ')}</span>
            </p>
            <p className="text-xs text-slate-500">
              {UNMATCHED_LABELS[reason]}
              {row.sleeperId && ` (Sleeper ID ${row.sleeperId})`} · value {row.value.toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
