// Checks the production build in dist/ before it is deployed. Run after `npm run build`:
//
//   npm run check:build
//
// Fails (exit 1) if the PWA manifest, icons or service worker are invalid, if required tags are
// missing from the initial HTML, or if anything that looks like a secret or personal data is in
// the files that would be published.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Script } from 'node:vm';

const DIST = 'dist';
const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};
const read = (f) => readFileSync(join(DIST, f), 'utf8');

check(existsSync(join(DIST, 'index.html')), 'dist/index.html is missing (did the build run?)');
if (problems.length) finish();

// --- Initial HTML (what loads before any JavaScript runs)
const html = read('index.html');
check(/<meta name="robots" content="noindex/.test(html), 'index.html: missing the "noindex" robots tag');
check(/<link rel="manifest" href="[^"]*manifest\.webmanifest"/.test(html), 'index.html: missing the manifest link');
check(/<meta name="viewport"[^>]*viewport-fit=cover/.test(html), 'index.html: viewport must include viewport-fit=cover (safe areas)');
check(/<meta name="theme-color"/.test(html), 'index.html: missing theme-color');
check(/<link rel="apple-touch-icon" href="[^"]+"/.test(html), 'index.html: missing apple-touch-icon');
// FantasyCalc terms: an attribution link must be in the initial HTML, without requiring JavaScript.
const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
check(/<a [^>]*href="https:\/\/fantasycalc\.com"/.test(withoutScripts), 'index.html: FantasyCalc attribution link missing from the static HTML');

// --- Web app manifest
let manifest = null;
try {
  manifest = JSON.parse(read('manifest.webmanifest'));
} catch (e) {
  problems.push(`manifest.webmanifest is missing or not valid JSON (${e.message})`);
}
if (manifest) {
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'theme_color', 'background_color']) check(typeof manifest[k] === 'string' && manifest[k], `manifest: "${k}" is missing`);
  check(manifest.display === 'standalone', 'manifest: display must be "standalone"');
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const size of ['192x192', '512x512']) check(icons.some((i) => i.sizes === size && i.type === 'image/png'), `manifest: needs a ${size} PNG icon`);
  check(icons.some((i) => (i.purpose ?? '').includes('maskable')), 'manifest: needs a maskable icon (Android)');
  for (const icon of icons) {
    const file = join(DIST, icon.src);
    if (!existsSync(file)) {
      problems.push(`manifest: icon file ${icon.src} does not exist`);
      continue;
    }
    const png = readFileSync(file);
    const isPng = png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    check(isPng, `${icon.src}: not a PNG file`);
    if (isPng) {
      const actual = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      check(actual === icon.sizes, `${icon.src}: manifest says ${icon.sizes} but the image is ${actual}`);
    }
  }
}
const apple = html.match(/<link rel="apple-touch-icon" href="\.?\/?([^"]+)"/);
if (apple) check(existsSync(join(DIST, apple[1])), `apple-touch-icon ${apple[1]} does not exist`);

// --- Service worker
if (!existsSync(join(DIST, 'sw.js'))) {
  problems.push('sw.js (service worker) is missing');
} else {
  const sw = read('sw.js');
  for (const f of readdirSync(DIST).filter((f) => f === 'sw.js' || /^workbox-.*\.js$/.test(f))) {
    try {
      new Script(read(f), { filename: f });
    } catch (e) {
      problems.push(`${f}: JavaScript syntax error (${e.message})`);
    }
  }
  check(sw.includes('"index.html"') || sw.includes("'index.html'") || sw.includes('url:"index.html"'), 'sw.js: index.html is not precached');
  check(sw.includes('fantasycalc-values'), 'sw.js: the FantasyCalc values route (network-first) is missing');
  check(!sw.includes('api.sleeper.app'), 'sw.js: must not cache Sleeper API responses');
  check(/skipWaiting/.test(sw) && /clientsClaim/.test(sw), 'sw.js: new versions must activate right away (skipWaiting + clientsClaim)');
}

// --- Secrets and personal data in anything that would be published
const SECRET_PATTERNS = [
  [/gh[pousr]_[A-Za-z0-9]{20,}/, 'a GitHub token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/AKIA[0-9A-Z]{16}/, 'an AWS key'],
  [/[A-Za-z0-9._%+-]+@(gmail|yahoo|outlook|hotmail|icloud)\.com/i, 'a personal email address'],
];
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const file of walk(DIST)) {
  if (file.includes(join('data', 'fantasycalc'))) continue; // published FantasyCalc snapshots (public data)
  if (!/\.(js|html|css|json|webmanifest|txt|map)$/.test(file)) continue;
  check(!file.endsWith('.map'), `${file}: source maps should not be published`);
  const text = readFileSync(file, 'utf8');
  for (const [re, what] of SECRET_PATTERNS) check(!re.test(text), `${file}: looks like it contains ${what}`);
}

finish();

function finish() {
  if (problems.length) {
    console.error(`Build check FAILED:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Build check passed: manifest, icons, service worker, initial HTML, no secrets.');
}
