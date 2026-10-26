// Local production build using esbuild. The owner's normal path is `npm run build`
// (Vite); this script exists so the preview can be built where the npm registry is
// not reachable. It produces the same dist/ layout: hashed /assets, public/ copied
// verbatim, the generic index.html shell, and the CSP <meta> injected.
import { createRequire } from 'node:module';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP } from './csp.mjs';

// esbuild is loaded with require() so that NODE_PATH works (ESM `import` ignores it).
const { build } = createRequire(import.meta.url)('esbuild');

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'assets'), { recursive: true });

const result = await build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  outdir: resolve(dist, 'assets'),
  entryNames: '[name]-[hash]',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  metafile: true,
  legalComments: 'none',
  loader: { '.json': 'json' },
  // The JS API does not read NODE_PATH by itself (the CLI does); pass it through.
  nodePaths: (process.env.NODE_PATH || '').split(':').filter(Boolean),
  define: { __PROD__: 'true', 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const outputs = Object.keys(result.metafile.outputs).map((p) => basename(p));
const js = outputs.find((f) => f.endsWith('.js'));
const css = outputs.find((f) => f.endsWith('.css'));
if (!js || !css) throw new Error(`Expected one JS and one CSS output, got: ${outputs.join(', ')}`);

await cp(resolve(root, 'public'), dist, { recursive: true });

let html = await readFile(resolve(root, 'index.html'), 'utf8');
html = html
  .replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`)
  .replace('</head>', `  <link rel="stylesheet" href="/assets/${css}">\n</head>`)
  .replace('<script type="module" src="/src/main.tsx"></script>', `<script type="module" src="/assets/${js}"></script>`);
if (html.includes('/src/main.tsx') || html.includes('<!--CSP-->')) throw new Error('index.html rewrite failed');
await writeFile(resolve(dist, 'index.html'), html);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
for (const [p, o] of Object.entries(result.metafile.outputs)) console.log(basename(p), kb(o.bytes));
console.log('dist/ ready');
