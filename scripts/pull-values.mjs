// Downloads the currently published FantasyCalc snapshots (index.json + the files it references)
// from the deployed site into public/data/fantasycalc/. Never calls FantasyCalc.
//
//   node scripts/pull-values.mjs https://<user>.github.io/<repo>/
//
// Used by the scheduled job (so the 3-hour rule sees the last attempt) and for local development.
// A missing index (first deployment) is fine; any other failure exits non-zero so the job stops
// rather than mistaking "couldn't download" for "never fetched" and calling FantasyCalc early.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const site = process.argv[2];
const OUT = process.env.VALUES_DIR ?? 'public/data/fantasycalc';
if (!site) {
  console.error('usage: node scripts/pull-values.mjs <site base URL>');
  process.exit(1);
}
const base = new URL('data/fantasycalc/', site.endsWith('/') ? site : site + '/');
const bust = `?t=${Date.now()}`; // bypass CDN caching so the latest attempt time is seen

async function get(path) {
  const res = await fetch(new URL(path, base).href + bust);
  return res;
}

const indexRes = await get('index.json');
if (indexRes.status === 404) {
  console.log('No published values yet (first deployment).');
  process.exit(0);
}
if (!indexRes.ok) {
  console.error(`Could not download published index.json: HTTP ${indexRes.status}`);
  process.exit(1);
}
const indexText = await indexRes.text();
const index = JSON.parse(indexText);

for (const set of Object.values(index.sets ?? {})) {
  for (const snap of [set.latest, set.previous]) {
    if (!snap) continue;
    const res = await get(snap.file);
    if (!res.ok) {
      console.error(`Could not download ${snap.file}: HTTP ${res.status}`);
      process.exit(1);
    }
    const path = join(OUT, snap.file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, await res.text());
  }
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.json'), indexText);
console.log(`Downloaded ${Object.keys(index.sets ?? {}).length} parameter set(s), updated ${index.updatedAt}.`);
