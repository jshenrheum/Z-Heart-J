import { useSyncExternalStore } from 'react';

/** Service-worker registration, update prompts, and the install prompt. */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;
let snapshot = { canInstall: false, updateReady: false };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { canInstall: installEvent !== null, updateReady: waiting !== null };
  listeners.forEach((l) => l());
};

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    emit();
  });

  if (!__PROD__ || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          emit();
        }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw?.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = nw;
              emit();
            }
          });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  });
}

export function applyUpdate() {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage('SKIP_WAITING');
}

export async function promptInstall(): Promise<void> {
  if (!installEvent) return;
  await installEvent.prompt();
  await installEvent.userChoice.catch(() => undefined);
  installEvent = null;
  emit();
}

/** Sign-out calls this to remove every cache this app owns. */
export async function clearAppCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('zhj-')).map((k) => caches.delete(k)));
}

export function usePwa() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

export type Platform = 'ios' | 'android' | 'desktop';
export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
