import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown; data?: T };

/**
 * Runs `load(force)` when `key` changes. `reload()` calls it again with force = true
 * (used by Refresh / Try again). Results from superseded runs are ignored.
 */
export function useAsync<T>(key: string, load: (force: boolean) => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const runId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback((force: boolean) => {
    const id = ++runId.current;
    setState((s) => ({ status: 'loading', data: s.data }));
    loadRef.current(force).then(
      (data) => id === runId.current && setState({ status: 'success', data }),
      (error: unknown) => id === runId.current && setState((s) => ({ status: 'error', error, data: s.data })),
    );
  }, []);

  useEffect(() => {
    setState({ status: 'loading' });
    run(false);
  }, [key, run]);

  return { state, reload: useCallback(() => run(true), [run]) };
}
