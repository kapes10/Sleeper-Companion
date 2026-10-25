// Manual CSV import: choose a file → map columns → describe the set → preview → save.
// Stored on this device only, separately from FantasyCalc values.
import { useMemo, useState, type ChangeEvent } from 'react';
import { Button, Notice, Screen } from '../../components/ui';
import { useServices } from '../../services';
import { buildCsvRows, CSV_FIELDS, guessMapping, type ColumnMapping, type CsvField } from '../../valuations/csv/import';
import { parseCsv } from '../../valuations/csv/parse';
import { saveCsvSet } from '../../valuations/csv/store';

const MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROWS = 10;

type FileState = { name: string; header: string[]; rows: { line: number; cells: string[] }[] } | null;

export function ImportScreen() {
  const services = useServices();
  const [file, setFile] = useState<FileState>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [meta, setMeta] = useState({ name: '', source: '', exportDate: '', format: '', qb: '' });
  const [acceptSkips, setAcceptSkips] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFile(null);
    setFileError(null);
    setSaved(null);
    setAcceptSkips(false);
    if (!f) return;
    if (f.size > MAX_BYTES) return setFileError('That file is larger than 5 MB, which is too big for a valuation list.');
    const parsed = parseCsv(await f.text());
    if (!parsed.ok) return setFileError(parsed.error);
    setFile({ name: f.name, header: parsed.header, rows: parsed.rows });
    setMapping(guessMapping(parsed.header));
    setMeta((m) => ({ ...m, name: m.name || f.name.replace(/\.csv$/i, '') }));
  }

  const built = useMemo(() => (file ? buildCsvRows(file.rows, mapping) : null), [file, mapping]);
  const today = new Date().toISOString().slice(0, 10);
  const metaErrors = [
    !meta.name.trim() && 'Give the set a name.',
    !meta.source.trim() && 'Say where the values came from.',
    !meta.exportDate && 'Enter the date the values were exported.',
    meta.exportDate > today && "The export date can't be in the future.",
    !meta.format && 'Choose dynasty or redraft.',
    !meta.qb && 'Choose 1QB or superflex.',
  ].filter((x): x is string => !!x);
  const blocking = [...(built?.blocking ?? []), ...metaErrors];
  const needsSkipConsent = !!built && built.invalidCount > 0;
  const canSave = !!built && blocking.length === 0 && (!needsSkipConsent || acceptSkips);

  async function save() {
    if (!built || !canSave) return;
    setSaveError(null);
    const isDynasty = meta.format === 'dynasty';
    const numQbs = meta.qb === '2' ? 2 : 1;
    try {
      await saveCsvSet(services.store, {
        id: `${Date.now()}`,
        name: meta.name.trim(),
        source: meta.source.trim(),
        exportDate: meta.exportDate,
        importedAt: new Date(services.now()).toISOString(),
        isDynasty,
        numQbs,
        rows: built.results.flatMap((r) => (r.row ? [r.row] : [])),
        skippedRows: built.invalidCount,
      });
      setSaved(`Saved “${meta.name.trim()}” with ${built.validCount} values.`);
      setFile(null);
    } catch {
      setSaveError("Couldn't save on this device (storage may be full or blocked). Nothing was saved.");
    }
  }

  const select = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-slate-50';

  return (
    <Screen title="Import values (CSV)" subtitle="A manual source, kept separate from FantasyCalc and stored on this device only.">
      <nav className="mb-4 flex gap-4 text-sm">
        <a href="#/values" className="inline-flex min-h-11 items-center text-emerald-400 hover:text-emerald-300">
          ← Match report
        </a>
      </nav>
      <div className="space-y-4">
        {saved && (
          <Notice>
            {saved} <a href="#/values" className="text-emerald-400 underline">See the match report</a>.
          </Notice>
        )}
        <label className="block rounded-xl bg-slate-900 p-4">
          <span className="text-sm font-medium text-slate-200">1. Choose a CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:text-slate-100" />
          <span className="mt-2 block text-xs text-slate-500">Needs a header row, a Sleeper ID column and a value column. Players are matched by Sleeper ID only.</span>
        </label>
        {fileError && (
          <div role="alert" className="rounded-lg border border-red-900 bg-red-950/60 p-4 text-red-100">
            <p className="font-medium">This file can't be imported</p>
            <p className="mt-1 text-sm text-red-200">{fileError}</p>
          </div>
        )}

        {file && built && (
          <>
            <fieldset className="rounded-xl bg-slate-900 p-4">
              <legend className="px-1 text-sm font-medium text-slate-200">2. Match columns ({file.name}, {file.rows.length} rows)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {CSV_FIELDS.map(({ field, label, required }) => (
                  <label key={field} className="block text-sm text-slate-300">
                    {label} {required ? <span className="text-amber-300">(required)</span> : <span className="text-slate-500">(optional)</span>}
                    <select
                      className={select}
                      value={mapping[field] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value === '' ? undefined : Number(e.target.value) }) as Record<CsvField, number>)}
                    >
                      <option value="">— not in file —</option>
                      {file.header.map((h, i) => (
                        <option key={h} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-3 rounded-xl bg-slate-900 p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium text-slate-200">3. Describe this set</legend>
              <label className="block text-sm text-slate-300">
                Set name
                <input className={select} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
              </label>
              <label className="block text-sm text-slate-300">
                Source (where the values came from)
                <input className={select} value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} placeholder="e.g. my spreadsheet" />
              </label>
              <label className="block text-sm text-slate-300">
                Export date
                <input type="date" max={today} className={select} value={meta.exportDate} onChange={(e) => setMeta({ ...meta, exportDate: e.target.value })} />
              </label>
              <label className="block text-sm text-slate-300">
                Format
                <select className={select} value={meta.format} onChange={(e) => setMeta({ ...meta, format: e.target.value })}>
                  <option value="">Choose…</option>
                  <option value="dynasty">Dynasty</option>
                  <option value="redraft">Redraft</option>
                </select>
              </label>
              <label className="block text-sm text-slate-300">
                QB setting
                <select className={select} value={meta.qb} onChange={(e) => setMeta({ ...meta, qb: e.target.value })}>
                  <option value="">Choose…</option>
                  <option value="1">1QB</option>
                  <option value="2">Superflex / 2QB</option>
                </select>
              </label>
            </fieldset>

            <section aria-label="Preview" className="rounded-xl bg-slate-900 p-4">
              <h2 className="text-sm font-medium text-slate-200">4. Preview</h2>
              {built.blocking.length === 0 && (
                <p className="mt-1 text-sm text-slate-300">
                  {built.validCount} usable row(s){built.invalidCount > 0 && <span className="text-amber-300">, {built.invalidCount} with problems (listed below)</span>}.
                </p>
              )}
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-2">Line</th>
                      <th className="py-1 pr-2">Sleeper ID</th>
                      <th className="py-1 pr-2">Name</th>
                      <th className="py-1 pr-2">Value</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {file.rows.slice(0, PREVIEW_ROWS).map((r, i) => {
                      const res = built.results[i];
                      const cell = (f: CsvField) => (mapping[f] === undefined ? '' : r.cells[mapping[f]!]);
                      return (
                        <tr key={r.line} className="border-t border-slate-800">
                          <td className="py-1 pr-2 text-slate-500">{r.line}</td>
                          <td className="py-1 pr-2">{cell('sleeperId')}</td>
                          <td className="py-1 pr-2">{cell('name')}</td>
                          <td className="py-1 pr-2">{cell('value')}</td>
                          <td className={`py-1 ${res?.error ? 'text-amber-300' : 'text-emerald-300'}`}>{res ? (res.error ?? 'OK') : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {built.results.some((r, i) => r.error && i >= PREVIEW_ROWS) && (
                <details className="mt-2 text-xs text-amber-200">
                  <summary className="cursor-pointer">More rows with problems</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {built.results
                      .filter((r, i) => r.error && i >= PREVIEW_ROWS)
                      .map((r) => (
                        <li key={r.line}>
                          Line {r.line}: {r.error}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </section>

            {blocking.length > 0 && (
              <Notice tone="warn">
                <ul className="list-disc pl-5">
                  {blocking.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {needsSkipConsent && blocking.length === 0 && (
              <label className="flex items-start gap-3 rounded-xl bg-slate-900 p-4 text-sm text-slate-200">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={acceptSkips} onChange={(e) => setAcceptSkips(e.target.checked)} />
                Import the {built.validCount} usable rows and skip the {built.invalidCount} row(s) with problems.
              </label>
            )}
            {saveError && <Notice tone="warn">{saveError}</Notice>}
            <Button variant="primary" className="w-full" disabled={!canSave} onClick={save}>
              Save set
            </Button>
          </>
        )}
      </div>
    </Screen>
  );
}
