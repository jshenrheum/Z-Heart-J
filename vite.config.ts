import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { CSP } from './scripts/csp.mjs';

// Stage 1 is a static PWA. Stage 2 adds a Cloudflare Worker that serves this
// build and the same-origin /api. Nothing here reads household data.
// Inject the CSP <meta> for production builds only (the dev server needs inline HMR scripts).
const csp = {
  name: 'zhj-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
};

export default defineConfig(({ command }) => ({
  define: { __PROD__: JSON.stringify(command === 'build') },
  plugins: [react(), csp],
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
  server: { port: 5173 },
}));
