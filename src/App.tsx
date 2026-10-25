import { useEffect, useState } from 'react';
import { LeagueListScreen } from './features/leagues/LeagueListScreen';
import { RosterScreen } from './features/roster/RosterScreen';
import { UsernameScreen } from './features/username/UsernameScreen';
import { ValuesScreen } from './features/values/ValuesScreen';
import { ImportScreen } from './features/import/ImportScreen';
import { AnalyzerLeaguesScreen } from './features/analyzer/AnalyzerLeaguesScreen';
import { AnalyzerLeagueScreen } from './features/analyzer/AnalyzerLeagueScreen';
import { clearAccount, loadAccount, type SavedAccount } from './storage/prefs';

// Hash-based routes keep the app working on any static host and let the phone's back button work:
//   #/                 league list
//   #/league/<id>      roster for one league
//   #/values           valuation match report
//   #/import           manual CSV import
//   #/analyzer         Team Analyzer: league list
//   #/analyzer/<id>    Team Analyzer: one league
type Route =
  | { name: 'leagues' }
  | { name: 'league'; leagueId: string }
  | { name: 'values' }
  | { name: 'import' }
  | { name: 'analyzer' }
  | { name: 'analyzer-league'; leagueId: string };

function parseRoute(hash: string): Route {
  if (hash.startsWith('#/values')) return { name: 'values' };
  if (hash.startsWith('#/import')) return { name: 'import' };
  const a = hash.match(/^#\/analyzer\/([^/?#]+)/);
  if (a) return { name: 'analyzer-league', leagueId: decodeURIComponent(a[1]!) };
  if (hash.startsWith('#/analyzer')) return { name: 'analyzer' };
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

  if (route.name === 'analyzer') return <AnalyzerLeaguesScreen account={account} />;
  if (route.name === 'analyzer-league') return <AnalyzerLeagueScreen key={route.leagueId} account={account} leagueId={route.leagueId} />;
  if (route.name === 'values') return <ValuesScreen account={account} />;
  if (route.name === 'import') return <ImportScreen />;
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
