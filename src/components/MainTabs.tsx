/** Top-level tabs. Plain links, so the phone's back button keeps working. */
type Tab = 'leagues' | 'analyzer' | 'lineups';

export function MainTabs({ active }: { active: Tab }) {
  const tab = (id: Tab, href: string, label: string) => (
    <a
      href={href}
      aria-current={active === id ? 'page' : undefined}
      className={`flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
        active === id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {label}
    </a>
  );
  return (
    <nav aria-label="Main" className="mb-4 flex gap-1 rounded-xl bg-slate-900 p-1">
      {tab('leagues', '#/', 'Leagues')}
      {tab('analyzer', '#/analyzer', 'Team Analyzer')}
      {tab('lineups', '#/lineups', 'Lineups')}
    </nav>
  );
}
