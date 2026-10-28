import { useCallback, useState } from 'react';
import { markDone, recordOpened, type LineupItem } from '../../analysis/lineup/verify';
import type { Services } from '../../services';
import { loadItems, saveItems } from '../../storage/lineup';
import type { SavedAccount } from '../../storage/prefs';
import { checkItems } from './checkItems';

/** The saved checklist (this device only) plus the actions on it. Checks run only when asked. */
export function useItems(services: Services, account: SavedAccount) {
  const [items, setItemsState] = useState<LineupItem[]>(() => loadItems());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const setItems = useCallback((next: LineupItem[]) => {
    saveItems(next);
    setItemsState(next);
  }, []);
  const update = useCallback(
    (key: string, f: (i: LineupItem) => LineupItem) => {
      const next = loadItems().map((i) => (i.key === key ? f(i) : i));
      setItems(next);
    },
    [setItems],
  );

  const check = useCallback(
    async (keys: string[]) => {
      setBusy((b) => new Set([...b, ...keys]));
      try {
        const next = await checkItems(services, account, loadItems(), new Set(keys));
        setItems(next);
      } finally {
        setBusy((b) => new Set([...b].filter((k) => !keys.includes(k))));
      }
    },
    [services, account, setItems],
  );

  return {
    items,
    busy,
    setItems,
    check,
    done: (key: string) => update(key, (i) => markDone(i, services.now())),
    opened: (key: string) => update(key, (i) => recordOpened(i, services.now())),
    remove: (key: string) => setItems(loadItems().filter((i) => i.key !== key)),
    clearAll: () => setItems([]),
  };
}
