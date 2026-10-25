import { useCallback, useState } from 'react';
import type { SleeperLeague } from '../../api/types';
import { FantasyCalcAttribution } from '../../components/Attribution';
import { ErrorMessage, Loading, Notice, formatTime } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import type { PlayerIndex } from '../../domain/players';
import { useServices } from '../../services';
import { describeCsvFormat, loadCsvLibrary, type CsvSet } from '../../valuations/csv/store';
import { describeParams } from '../../valuations/fantasycalc/params';
import { selectCsvSet, selectFcSet, type CsvSelection, type FcSelection } from '../../valuations/leagueValues';
import { matchValues, type PlayerValue } from '../../valuations/match';
import { fcFreshness, formatAge } from '../../valuations/staleness';

interface Loaded {
  fc: FcSelection;
  fcValues: Map<string, PlayerValue> | null;
  /** Only set when a CSV set matches this league's full format. */
  csv: CsvSet | null;
  csvSelection: CsvSelection;
  csvValues: Map<string, PlayerValue> | null;
}

/**
 * Loads the valuation set that fits this league and reports which one is used.
 * Calls `onLookup` with the active source's lookup (or null when no values are available).
 */
export function useLeagueValues(league: SleeperLeague | undefined, players: PlayerIndex | undefined) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean): Promise<Loaded> => {
      const [{ data: index }, library] = await Promise.all([services.fcIndex(force), loadCsvLibrary(services.store).catch(() => ({}))]);
      const fc = selectFcSet(league!, index);
      const fcValues = fc.kind === 'available' ? matchValues((await services.fcSnapshot(fc.state.latest!)).rows, players!).bySleeperId : null;
      const csvSelection = selectCsvSet(league!, library);
      const csv = csvSelection.kind === 'match' ? csvSelection.set : null;
      const csvValues = csv ? matchValues(csv.rows, players!).bySleeperId : null;
      return { fc, fcValues, csv, csvSelection, csvValues };
    },
    [services, league, players],
  );
  return useAsync(league && players ? `values:${league.league_id}` : 'values:none', (force) =>
    league && players ? load(force) : new Promise<Loaded>(() => {}),
  );
}

export function ValuesPanel({
  state,
  reload,
  source,
  onSourceChange,
  rosterIds,
}: {
  state: ReturnType<typeof useLeagueValues>['state'];
  reload: () => void;
  source: 'fantasycalc' | 'csv';
  onSourceChange: (s: 'fantasycalc' | 'csv') => void;
  rosterIds: string[];
}) {
  const services = useServices();
  if (state.status === 'loading' && !state.data) return <Loading label="Loading player values…" />;
  if (state.status === 'error' && !state.data) return <ErrorMessage error={state.error} title="Couldn't load player values" onRetry={reload} />;
  const { fc, fcValues, csv, csvSelection, csvValues } = state.data!;
  const active = source === 'csv' && csv ? csvValues : fcValues;
  const withValue = active ? rosterIds.filter((id) => active.has(id)).length : 0;

  return (
    <section aria-label="Player values" className="space-y-2 rounded-xl bg-slate-900 p-3">
      {csv && (
        <div role="group" aria-label="Value source" className="flex gap-2">
          {(['fantasycalc', 'csv'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={() => onSourceChange(s)}
              className={`min-h-11 flex-1 rounded-lg px-3 text-sm ${source === s ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-200'}`}
            >
              {s === 'fantasycalc' ? 'FantasyCalc' : 'Manual CSV'}
            </button>
          ))}
        </div>
      )}

      {source === 'csv' && csv ? (
        <>
          <p className="text-sm text-slate-200">
            Using <strong>manual CSV</strong> “{csv.name}” · {describeCsvFormat(csv)}
          </p>
          <p className="text-xs text-slate-400">
            Source: {csv.source} · exported {csv.exportDate} · imported {formatTime(Date.parse(csv.importedAt))} · stored on this device only
          </p>
        </>
      ) : (
        <FcDetails fc={fc} now={services.now()} />
      )}

      {csvSelection.kind === 'mismatch' && <CsvMismatch others={csvSelection.others} />}

      {active && (
        <p className="text-xs text-slate-400">
          {withValue} of {rosterIds.length} players on this roster have a value. Scale: 100 = highest-valued player in the set.
        </p>
      )}
    </section>
  );
}

function CsvMismatch({ others }: { others: CsvSet[] }) {
  return (
    <details className="text-xs text-slate-400">
      <summary className="cursor-pointer py-1 text-slate-300">
        {others.length} manual CSV set{others.length === 1 ? '' : 's'} not used here (different format)
      </summary>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {others.map((o) => (
          <li key={o.id}>
            “{o.name}” ({describeCsvFormat(o)}){' '}
            {o.params ? "doesn't match this league's settings." : 'was imported before scoring details were recorded. Re-import it to use it.'}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FcDetails({ fc, now }: { fc: FcSelection; now: number }) {
  if (fc.kind === 'unsupported') {
    return (
      <Notice tone="warn">
        This league's settings can't be matched to FantasyCalc values: {fc.reasons.join(' ')} No values are shown.
      </Notice>
    );
  }
  if (fc.kind === 'missing') {
    return (
      <>
        <Notice tone="warn">
          No FantasyCalc values exist yet for this league's format ({describeParams(fc.params)}). Players show “no value”.
          {fc.state?.lastError && ` Last attempt failed: ${fc.state.lastError}`}
        </Notice>
        <FantasyCalcAttribution />
      </>
    );
  }
  const fresh = fcFreshness(fc.state, now);
  return (
    <>
      <p className="text-sm text-slate-200">
        Using <strong>FantasyCalc market value</strong> · {describeParams(fc.params)}
      </p>
      {fresh.kind !== 'missing' && (
        <p className="text-xs text-slate-400">
          Snapshot from {formatTime(fresh.fetchedAt)} ({formatAge(fresh.ageMs)} ago). Trade-market values, not projections.
        </p>
      )}
      {fresh.kind === 'stale' && (
        <Notice tone="warn">
          These values are {formatAge(fresh.ageMs)} old (refreshes normally happen every 3–4 hours).
          {fresh.lastAttemptFailed && fresh.lastError && ` The latest refresh failed: ${fresh.lastError}`}
        </Notice>
      )}
      <FantasyCalcAttribution />
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer py-1 text-slate-300">What these values don't account for</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {fc.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </>
  );
}

export function useValueSource() {
  return useState<'fantasycalc' | 'csv'>('fantasycalc');
}
