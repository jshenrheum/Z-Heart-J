import { useCallback, useEffect, useRef, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/**
 * A very small history-API router. Detail URLs are real paths (restored after a
 * refresh by the server's SPA fallback), query params carry filters, and the scroll
 * position of the page you left is restored on Back.
 */

const EVENT = 'zhj:navigate';
const scrollByKey = new Map<string, number>(); // in-memory only — never persisted

const key = () => window.location.pathname + window.location.search;

function subscribe(cb: () => void) {
  const onPop = () => {
    cb();
    const y = scrollByKey.get(key()) ?? 0;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  };
  window.addEventListener('popstate', onPop);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', onPop);
    window.removeEventListener(EVENT, cb);
  };
}

export interface NavOptions {
  replace?: boolean;
  /** Small in-memory payload (e.g. a search draft) — kept out of the URL on purpose. */
  state?: unknown;
  /** Keep the current scroll position (used for filter chips). */
  keepScroll?: boolean;
}

export function navigate(to: string, opts: NavOptions = {}) {
  scrollByKey.set(key(), window.scrollY);
  if (opts.replace) window.history.replaceState(opts.state ?? null, '', to);
  else window.history.pushState(opts.state ?? null, '', to);
  window.dispatchEvent(new Event(EVENT));
  if (!opts.keepScroll) window.scrollTo(0, 0);
}

export function useLocationKey(): string {
  return useSyncExternalStore(subscribe, key, () => '/');
}

export function useRoute(): { path: string; query: URLSearchParams } {
  const k = useLocationKey();
  const i = k.indexOf('?');
  return { path: i === -1 ? k : k.slice(0, i), query: new URLSearchParams(i === -1 ? '' : k.slice(i)) };
}

export function historyState<T = unknown>(): T | null {
  return (window.history.state as T | null) ?? null;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
  keepScroll?: boolean;
  children?: ReactNode;
}

export function Link({ to, replace, keepScroll, onClick, children, ...rest }: LinkProps) {
  const handle = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to, { replace, keepScroll });
    },
    [to, replace, keepScroll, onClick],
  );
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

/** Move focus to the main region after a route change so screen readers announce the new page. */
export function useFocusOnRouteChange(pathname: string) {
  const first = useRef(true);
  useEffect(() => {
    // Not on the very first render: the page has just loaded, and the first Tab press
    // should reach the skip link, not land somewhere inside the content.
    if (first.current) {
      first.current = false;
      return;
    }
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: true });
  }, [pathname]);
}
