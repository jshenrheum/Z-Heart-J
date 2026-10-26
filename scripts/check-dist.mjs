// Checks a build before it can be served or deployed.
//   node scripts/check-dist.mjs dist        → the production build: no demo content or demo controls
//   node scripts/check-dist.mjs dist-demo   → the demo build: clearly the demo
// Both: the CSP <meta> is present, there is no inline script or style, no source maps.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const which = process.argv[2] ?? 'dist';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)), which);
const demo = which === 'dist-demo';

const walk = async (dir) => (await readdir(dir, { withFileTypes: true })).flatMap((e) => (e.isDirectory() ? [] : [join(dir, e.name)])).concat(
  ...(await Promise.all((await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => walk(join(dir, e.name))))),
);
const files = await walk(root);
const text = async (f) => (/\.(js|css|html|json|webmanifest|svg)$/.test(f) ? readFile(f, 'utf8') : '');
const all = (await Promise.all(files.map(async (f) => [f, await text(f)])));

const problems = [];
const html = await readFile(join(root, 'index.html'), 'utf8');
if (!html.includes('http-equiv="Content-Security-Policy"')) problems.push('index.html has no CSP <meta>');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('index.html has an inline <script>');
if (/<style\b|\sstyle="/i.test(html)) problems.push('index.html has inline style');
if (files.some((f) => f.endsWith('.map'))) problems.push('source maps present');

// Strings that exist only in the demo content or the demo-only controls.
const DEMO_MARKERS = ['Demo Location A', 'Placeholder Street', 'makeDemoRows', 'Make the next save fail', 'Viewing as', 'Simulated failure (demo)'];
const found = (marker) => all.filter(([, t]) => t.includes(marker)).map(([f]) => f.slice(root.length + 1));
if (demo) {
  if (found('Demo preview.').length === 0) problems.push('the demo build doesn’t show its Demo preview banner');
} else {
  for (const m of DEMO_MARKERS) {
    const where = found(m);
    if (where.length) problems.push(`production build contains demo-only "${m}" (${where.join(', ')})`);
  }
}

if (problems.length) {
  console.error(`✗ ${which}:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ ${which}: ${demo ? 'demo build' : 'production build, no demo content or controls'}; CSP meta present; no inline script or style; no source maps (${files.length} files)`);
