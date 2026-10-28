import { useEffect, useState } from 'react';
import { LeagueListScreen } from './features/leagues/LeagueListScreen';
import { RosterScreen } from './features/roster/RosterScreen';
import { UsernameScreen } from './features/username/UsernameScreen';
import { ValuesScreen } from './features/values/ValuesScreen';
import { ImportScreen } from './features/import/ImportScreen';
import { AnalyzerLeaguesScreen } from './features/analyzer/AnalyzerLeaguesScreen';
import { AnalyzerLeagueScreen } from './features/analyzer/AnalyzerLeagueScreen';
import { TradePartnersScreen } from './features/analyzer/TradePartnersScreen';
import { LineupsScreen } from './features/lineups/LineupsScreen';
import { LeagueTypesScreen } from './features/lineups/LeagueTypesScreen';
import { LineupPlayerScreen } from './features/lineups/LineupPlayerScreen';
import { clearAccount, loadAccount, type SavedAccount } from './storage/prefs';

// Hash-based routes keep the app working on any static host and let the phone's back button work:
//   #/                 league list
//   #/league/<id>      roster for one league
//   #/values           valuation match report
//   #/import           manual CSV import
//   #/analyzer         Team Analyzer: league list
//   #/analyzer/<id>    Team Analyzer: one league
//   #/analyzer/<id>/partners   Trade partners for one league
//   #/lineups          Lineup Manager: search and checklist
//   #/lineups/types    Lineup Manager: league types
//   #/lineups/player/<id>   Lineup Manager: one player across leagues
type Route =
  | { name: 'leagues' }
  | { name: 'league'; leagueId: string }
  | { name: 'values' }
  | { name: 'import' }
  | { name: 'analyzer' }
  | { name: 'analyzer-league'; leagueId: string }
  | { name: 'partners'; leagueId: string }
  | { name: 'lineups' }
  | { name: 'lineup-types' }
  | { name: 'lineup-player'; playerId: string };

function parseRoute(hash: string): Route {
  if (hash.startsWith('#/values')) return { name: 'values' };
  if (hash.startsWith('#/import')) return { name: 'import' };
  if (hash.startsWith('#/lineups/types')) return { name: 'lineup-types' };
  const lp = hash.match(/^#\/lineups\/player\/([^/?#]+)/);
  if (lp) return { name: 'lineup-player', playerId: decodeURIComponent(lp[1]!) };
  if (hash.startsWith('#/lineups')) return { name: 'lineups' };
  const tp = hash.match(/^#\/analyzer\/([^/?#]+)\/partners/);
  if (tp) return { name: 'partners', leagueId: decodeURIComponent(tp[1]!) };
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

  if (route.name === 'partners') return <TradePartnersScreen key={route.leagueId} account={account} leagueId={route.leagueId} />;
  if (route.name === 'analyzer') return <AnalyzerLeaguesScreen account={account} />;
  if (route.name === 'analyzer-league') return <AnalyzerLeagueScreen key={route.leagueId} account={account} leagueId={route.leagueId} />;
  if (route.name === 'lineups') return <LineupsScreen account={account} />;
  if (route.name === 'lineup-types') return <LeagueTypesScreen account={account} />;
  if (route.name === 'lineup-player') return <LineupPlayerScreen key={route.playerId} account={account} playerId={route.playerId} />;
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
