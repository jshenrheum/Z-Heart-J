import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createApiBackend } from './data/api.ts';
import type { Backend } from './data/backend.ts';
import { initPwa } from './lib/pwa.ts';
import './styles.css';

initPwa();

// The demo backend (placeholder content, in memory) exists only in the demo build:
// with __DEMO__ false this import is dropped from the production bundle entirely.
const backend: Backend = __DEMO__ ? (await import('./demo/backend.ts')).createDemoBackend() : createApiBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App backend={backend} />
  </StrictMode>,
);
