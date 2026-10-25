// Small fetch wrapper for the Sleeper public read-only API: timeouts, limited concurrency,
// retries with exponential backoff for transient failures, and readable error messages.
//
// Sleeper's docs say to "stay under 1000 API calls per minute". This app makes a handful of
// calls per screen, so we only cap concurrency rather than claim a precise rate limit.

export const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

export type SleeperErrorKind = 'network' | 'timeout' | 'rate_limited' | 'server' | 'bad_response' | 'http';

export class SleeperApiError extends Error {
  readonly kind: SleeperErrorKind;
  readonly status?: number;

  constructor(kind: SleeperErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'SleeperApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Plain-English message suitable for showing to the owner. */
export function describeError(err: unknown): string {
  if (err instanceof SleeperApiError) {
    switch (err.kind) {
      case 'network':
        return "Couldn't reach Sleeper. Check your internet connection and try again.";
      case 'timeout':
        return 'Sleeper took too long to respond. Try again in a moment.';
      case 'rate_limited':
        return 'Sleeper is asking us to slow down (too many requests). Wait a minute and try again.';
      case 'server':
        return `Sleeper's servers returned an error (${err.status}). Try again later.`;
      case 'bad_response':
        return 'Sleeper sent a response this app could not read.';
      case 'http':
        return `Sleeper returned an unexpected error (${err.status}).`;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong.';
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  retries?: number;
  timeoutMs?: number;
  /** Base backoff delay; doubled per retry. Tests set this to 0. */
  backoffMs?: number;
  maxConcurrent?: number;
}

export interface SleeperClient {
  getJson<T>(path: string): Promise<T>;
}

export function createClient(options: ClientOptions = {}): SleeperClient {
  const {
    fetchImpl = (...args) => fetch(...args),
    retries = 2,
    timeoutMs = 20_000,
    backoffMs = 500,
    maxConcurrent = 4,
  } = options;

  let active = 0;
  const queue: Array<() => void> = [];

  async function acquire() {
    if (active < maxConcurrent) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
    active++;
  }

  function release() {
    active--;
    queue.shift()?.();
  }

  async function attempt<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: controller.signal });
    } catch (e) {
      if (controller.signal.aborted) throw new SleeperApiError('timeout', 'Request timed out');
      throw new SleeperApiError('network', e instanceof Error ? e.message : 'Network error');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) throw new SleeperApiError('rate_limited', 'Too many requests', 429);
    if (res.status >= 500) throw new SleeperApiError('server', 'Server error', res.status);
    if (!res.ok) throw new SleeperApiError('http', `HTTP ${res.status}`, res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new SleeperApiError('bad_response', 'Invalid JSON');
    }
  }

  const retryable = (e: unknown) =>
    e instanceof SleeperApiError && (e.kind === 'network' || e.kind === 'timeout' || e.kind === 'rate_limited' || e.kind === 'server');

  return {
    async getJson<T>(path: string): Promise<T> {
      const url = `${SLEEPER_BASE_URL}${path}`;
      await acquire();
      try {
        for (let i = 0; ; i++) {
          try {
            return await attempt<T>(url);
          } catch (e) {
            if (i >= retries || !retryable(e)) throw e;
            await new Promise((r) => setTimeout(r, backoffMs * 2 ** i));
          }
        }
      } finally {
        release();
      }
    },
  };
}
