import { defineConfig } from 'vite';
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

export default defineConfig(({ command, mode }) => ({
  define: { __PROD__: JSON.stringify(command === 'build'), __DEMO__: JSON.stringify(mode === 'demo') },
  plugins: [react(), csp],
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', sourcemap: false, target: 'es2022' },
  server: { port: 5173 },
}));
