/** Switch between the screens for ONE league without going back to a list. Plain links, so the back button works. */
export function LeagueNav({ leagueId, active }: { leagueId: string; active: 'roster' | 'analyzer' | 'partners' }) {
  const id = encodeURIComponent(leagueId);
  const tab = (key: typeof active, href: string, label: string) => (
    <a
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-center text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
        active === key ? 'bg-slate-700 text-slate-50' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {label}
    </a>
  );
  return (
    <nav aria-label="This league" className="mb-4 flex gap-1 rounded-xl bg-slate-900 p-1">
      {tab('roster', `#/league/${id}`, 'Roster')}
      {tab('analyzer', `#/analyzer/${id}`, 'Team Analyzer')}
      {tab('partners', `#/analyzer/${id}/partners`, 'Trade partners')}
    </nav>
  );
}
