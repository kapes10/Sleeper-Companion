/** FantasyCalc requires a visible link near its values on every page that shows them. */
export function FantasyCalcAttribution() {
  return (
    <p className="text-xs text-slate-400">
      Values from{' '}
      <a href="https://fantasycalc.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline hover:text-emerald-300">
        FantasyCalc.com
      </a>
    </p>
  );
}
