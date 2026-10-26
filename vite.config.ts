import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineConfig, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { CSP } from './worker/csp.ts';

// Two builds from one source:
//   npm run build       → dist/       the signed-in app, served by the Worker (no demo code)
//   npm run build:demo  → dist-demo/  placeholder data in memory, no server (--mode demo)
// Inject the CSP <meta> for builds only (the dev server needs inline HMR scripts).
const csp = {
  name: 'zhj-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
};

// Each build gives the service worker its own cache name (from the built index.html,
// which names every hashed asset). A changed sw.js is how browsers notice a new
// version, so this is what makes "A new version is ready" appear after a deploy.
let resolved: ResolvedConfig;
const swVersion = {
  name: 'zhj-sw-version',
  apply: 'build' as const,
  configResolved: (c: ResolvedConfig) => void (resolved = c),
  async closeBundle() {
    const dir = resolve(resolved.root, resolved.build.outDir);
    const version = createHash('sha256').update(await readFile(join(dir, 'index.html'))).digest('hex').slice(0, 12);
    const sw = await readFile(join(dir, 'sw.js'), 'utf8');
    if (!sw.includes("'zhj-shell-v1'")) throw new Error('sw.js: cache name placeholder not found');
    await writeFile(join(dir, 'sw.js'), sw.replace("'zhj-shell-v1'", `'zhj-shell-${version}'`));
  },
};

export default defineConfig(({ command, mode }) => ({
  define: { __PROD__: JSON.stringify(command === 'build'), __DEMO__: JSON.stringify(mode === 'demo') },
  plugins: [react(), csp, swVersion],
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', sourcemap: false, target: 'es2022' },
  server: { port: 5173 },
}));
