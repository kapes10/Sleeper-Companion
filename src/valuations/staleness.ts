import type { SetState } from './fantasycalc/refresh.ts';

/** Show a warning when the newest FantasyCalc snapshot is older than this. */
export const FC_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type Freshness =
  | { kind: 'missing'; lastError: string | null }
  | { kind: 'fresh' | 'stale'; fetchedAt: number; ageMs: number; lastAttemptFailed: boolean; lastError: string | null };

export function fcFreshness(state: SetState | undefined, now: number): Freshness {
  if (!state?.latest) return { kind: 'missing', lastError: state?.lastError ?? null };
  const fetchedAt = Date.parse(state.latest.fetchedAt);
  const ageMs = Math.max(0, now - fetchedAt);
  return {
    kind: ageMs > FC_STALE_AFTER_MS ? 'stale' : 'fresh',
    fetchedAt,
    ageMs,
    lastAttemptFailed: state.lastAttemptOk === false,
    lastError: state.lastError,
  };
}

export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}
