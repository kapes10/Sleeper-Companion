import { useState, type FormEvent } from 'react';
import { Button, ErrorMessage, Screen } from '../../components/ui';
import { normalizeUsername, UserNotFoundError } from '../../api/sleeper';
import { useServices } from '../../services';
import { saveAccount, type SavedAccount } from '../../storage/prefs';

export function UsernameScreen({ initialUsername = '', onSignedIn }: { initialUsername?: string; onSignedIn: (a: SavedAccount) => void }) {
  const { api } = useServices();
  const [username, setUsername] = useState(initialUsername);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!normalizeUsername(username)) return;
    setBusy(true);
    setError(null);
    try {
      const user = await api.getUser(username);
      const account = { username: user.username, userId: user.user_id, displayName: user.display_name || user.username };
      saveAccount(account);
      onSignedIn(account);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Sleeper Companion" subtitle="A read-only helper for your Sleeper leagues.">
      <form onSubmit={submit} className="space-y-4 rounded-xl bg-slate-900 p-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Sleeper username</span>
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-slate-50 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_sleeper_name"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            enterKeyHint="go"
          />
        </label>
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !normalizeUsername(username)}>
          {busy ? 'Looking up…' : 'Continue'}
        </Button>
        <p className="text-xs text-slate-500">
          No password needed. This app only reads public Sleeper data, and your username is remembered on this device only.
        </p>
      </form>
      {error != null && (
        <div className="mt-4">
          <ErrorMessage error={error} title={error instanceof UserNotFoundError ? 'Account not found' : "Couldn't look up that username"} />
        </div>
      )}
    </Screen>
  );
}
