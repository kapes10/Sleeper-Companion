// Core of the scheduled FantasyCalc job, written as a pure function with injected I/O so the
// 3-hour rule and failure handling can be tested without the network.
//
// Published layout (served next to the app at ./data/fantasycalc/):
//   index.json                      — this file's ValuesIndex
//   <paramKey>/<timestamp>.json     — raw /values/current response bodies, byte-for-byte
import { paramsQuery, type FcParams, paramKey } from './params.ts';
import { parseFcResponse, type FcParseOptions } from './parse.ts';

export const FC_ENDPOINT = 'https://api.fantasycalc.com/values/current';
/** FantasyCalc terms: each unique parameter set may be refreshed no more than once every 3 hours. */
export const FC_MIN_REFRESH_MS = 3 * 60 * 60 * 1000;
export const SIMULATED_FAILURE_ERROR = 'Simulated failure (test run; FantasyCalc was not contacted)';

export interface SnapshotMeta {
  file: string;
  url: string;
  params: FcParams;
  fetchedAt: string;
  httpStatus: number;
  bytes: number;
  sha256: string;
  playerCount: number;
  pickCount: number;
  unreadableCount: number;
}

export interface SetState {
  key: string;
  params: FcParams;
  latest: SnapshotMeta | null;
  previous: SnapshotMeta | null;
  /** Every call counts toward the 3-hour limit, including failed ones. */
  lastAttemptAt: string | null;
  lastAttemptOk: boolean | null;
  lastError: string | null;
}

export interface ValuesIndex {
  schemaVersion: 1;
  source: 'fantasycalc';
  updatedAt: string | null;
  sets: Record<string, SetState>;
}

export const emptyIndex = (): ValuesIndex => ({ schemaVersion: 1, source: 'fantasycalc', updatedAt: null, sets: {} });

export function isDue(state: SetState | undefined, now: number): boolean {
  if (!state?.lastAttemptAt) return true;
  const last = Date.parse(state.lastAttemptAt);
  // An unreadable or future timestamp is treated as "just attempted" — never call early.
  if (!Number.isFinite(last) || last > now) return false;
  return now - last >= FC_MIN_REFRESH_MS;
}

export interface HttpResult {
  status: number;
  text: string;
}

export interface RefreshDeps {
  now: () => number;
  /** Performs the GET. May throw on network failure. */
  get: (url: string) => Promise<HttpResult>;
  sha256: (text: string) => Promise<string>;
  parseOptions?: FcParseOptions;
  /**
   * Test switch: record a failed attempt for every needed set WITHOUT contacting FantasyCalc.
   * Snapshots are kept, and the attempt time is left unchanged so it doesn't use up the
   * 3-hour allowance (no request was made). The failure stays recorded until the next
   * successful refresh, which only happens once a refresh is due; runs before then skip.
   */
  simulateFailure?: boolean;
}

export interface RefreshResult {
  index: ValuesIndex;
  /** Files to create, relative to the data directory. Existing files are never modified. */
  writes: { path: string; content: string }[];
  calls: string[];
  log: string[];
  changed: boolean;
}

function fileStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

/** Refreshes each needed parameter set that is due. Failures keep the existing snapshots. */
export async function runRefresh(previous: ValuesIndex, needed: FcParams[], deps: RefreshDeps): Promise<RefreshResult> {
  const index: ValuesIndex = structuredClone(previous);
  const writes: RefreshResult['writes'] = [];
  const calls: string[] = [];
  const log: string[] = [];
  let changed = false;

  const unique = new Map<string, FcParams>();
  for (const p of needed) unique.set(paramKey(p), p);

  for (const [key, params] of unique) {
    const state: SetState = index.sets[key] ?? { key, params, latest: null, previous: null, lastAttemptAt: null, lastAttemptOk: null, lastError: null };
    index.sets[key] = state;
    if (deps.simulateFailure) {
      state.lastAttemptOk = false;
      state.lastError = SIMULATED_FAILURE_ERROR;
      changed = true;
      log.push(`${key}: simulated failure recorded; kept previous snapshot; no request sent`);
      continue;
    }
    const now = deps.now();
    if (!isDue(state, now)) {
      log.push(`${key}: skipped, last attempt ${state.lastAttemptAt} is less than 3 hours ago`);
      continue;
    }

    const url = `${FC_ENDPOINT}?${paramsQuery(params)}`;
    state.lastAttemptAt = new Date(now).toISOString();
    changed = true;
    calls.push(url);

    let error: string | null = null;
    try {
      const res = await deps.get(url);
      if (res.status !== 200) {
        error = `FantasyCalc returned HTTP ${res.status}`;
      } else {
        let json: unknown;
        try {
          json = JSON.parse(res.text);
        } catch {
          json = undefined;
          error = 'FantasyCalc response was not valid JSON';
        }
        if (!error) {
          const parsed = parseFcResponse(json, deps.parseOptions);
          if (!parsed.ok) {
            error = parsed.error;
          } else {
            const file = `${key}/${fileStamp(now)}.json`;
            writes.push({ path: file, content: res.text });
            state.previous = state.latest;
            state.latest = {
              file,
              url,
              params,
              fetchedAt: state.lastAttemptAt,
              httpStatus: res.status,
              bytes: new TextEncoder().encode(res.text).length,
              sha256: await deps.sha256(res.text),
              playerCount: parsed.players.length,
              pickCount: parsed.picks.length,
              unreadableCount: parsed.unreadable.length,
            };
          }
        }
      }
    } catch (e) {
      error = `Network error: ${e instanceof Error ? e.message : String(e)}`;
    }

    state.lastAttemptOk = error === null;
    state.lastError = error;
    log.push(error ? `${key}: FAILED (${error}); kept previous snapshot` : `${key}: updated (${state.latest!.playerCount} players)`);
  }

  if (changed) index.updatedAt = new Date(deps.now()).toISOString();
  return { index, writes, calls, log, changed };
}
