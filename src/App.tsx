import { useEffect, useState } from 'react';
import { LeagueListScreen } from './features/leagues/LeagueListScreen';
import { RosterScreen } from './features/roster/RosterScreen';
import { UsernameScreen } from './features/username/UsernameScreen';
import { clearAccount, loadAccount, type SavedAccount } from './storage/prefs';

// Hash-based routes keep the app working on any static host and let the phone's back button work:
//   #/                 league list
//   #/league/<id>      roster for one league
type Route = { name: 'leagues' } | { name: 'league'; leagueId: string };

function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/league\/([^/?#]+)/);
  return m ? { name: 'league', leagueId: decodeURIComponent(m[1]!) } : { name: 'leagues' };
}

function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function App() {
  const [account, setAccount] = useState<SavedAccount | null>(() => loadAccount());
  const [lastUsername, setLastUsername] = useState(account?.username ?? '');
  const route = useHashRoute();

  if (!account) {
    return (
      <UsernameScreen
        initialUsername={lastUsername}
        onSignedIn={(a) => {
          setAccount(a);
          location.hash = '#/';
        }}
      />
    );
  }

  if (route.name === 'league') return <RosterScreen key={route.leagueId} account={account} leagueId={route.leagueId} />;

  return (
    <LeagueListScreen
      account={account}
      onChangeUser={() => {
        clearAccount();
        setLastUsername(account.username);
        setAccount(null);
      }}
    />
  );
}
