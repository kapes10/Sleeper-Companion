// Small preferences in localStorage. This is per-browser only: nothing syncs between devices.
// Every access is guarded because storage can be unavailable (private mode, blocked site data).

const KEY = 'sleeper-companion:account';

export interface SavedAccount {
  username: string;
  userId: string;
  displayName: string;
}

export function loadAccount(): SavedAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedAccount>;
    if (typeof parsed.username !== 'string' || typeof parsed.userId !== 'string') return null;
    return { username: parsed.username, userId: parsed.userId, displayName: parsed.displayName ?? parsed.username };
  } catch {
    return null;
  }
}

export function saveAccount(account: SavedAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // Not fatal: the app still works for this session.
  }
}

export function clearAccount(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
