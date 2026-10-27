import type { PhotoRef, PinTarget } from './types.ts';
import type { Change, Kind, Row, Snapshot, TrashEntry } from '../lib/records.ts';
import { ConflictError, SaveError, SessionError, type Backend, type ProtectedInfo } from './backend.ts';

/**
 * The signed-in app's backend: same-origin JSON calls to the Worker. Identity is
 * never sent — Cloudflare Access adds it to each request and the Worker checks it.
 * Redirects aren't followed: when the Access session has expired, Access answers
 * with a redirect to its login page, which shows up here as "sign in again".
 */

/** A request with no answer by then counts as no connection (a shop's weak signal), so list changes wait instead. */
const TIMEOUT_MS = 10_000;

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T; res: Response }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await send<T>(method, path, body, headers, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function send<T>(method: string, path: string, body: unknown, headers: Record<string, string>, signal: AbortSignal): Promise<{ status: number; data: T; res: Response }> {
  let res: Response;
  try {
    res = await fetch(path, {
      signal,
      method,
      credentials: 'same-origin',
      redirect: 'manual',
      cache: 'no-store',
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SaveError(navigator.onLine ? 'Couldn’t reach the server.' : 'You’re offline.', 0, navigator.onLine ? 'network' : 'offline');
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400 && res.status !== 304)) {
    throw new SessionError('expired', 'Your sign-in has expired.');
  }
  if (res.status === 304) return { status: 304, data: null as T, res };
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    // Something other than the Worker answered (most likely the sign-in page).
    throw new SessionError('expired', 'Your sign-in has expired.');
  }
  let data: T & { error?: string; message?: string; current?: Row };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new SaveError('The connection dropped.', 0, 'network');
  }
  if (res.ok) return { status: res.status, data, res };

  const message = data?.message ?? 'The server couldn’t save that.';
  if (res.status === 401) throw new SessionError('expired', 'Your sign-in has expired.');
  if (res.status === 403 && data?.error === 'not_a_member') throw new SessionError('not_member', message);
  if (res.status === 503 && data?.error === 'not_configured' && method === 'GET' && path === '/api/state') throw new SessionError('not_configured', message);
  if (res.status === 409 && data?.error === 'conflict' && data.current) throw new ConflictError(data.current);
  throw new SaveError(message, res.status, data?.error ?? 'error');
}

const enc = encodeURIComponent;

/** A photo goes up as its own bytes, not JSON; the answers and errors are read as for any call. */
async function sendPhoto(blob: Blob, w: number, h: number): Promise<PhotoRef> {
  let res: Response;
  try {
    res = await fetch(`/api/photos?w=${w}&h=${h}`, { method: 'POST', credentials: 'same-origin', redirect: 'manual', cache: 'no-store', headers: { accept: 'application/json', 'content-type': blob.type }, body: blob });
  } catch {
    throw new SaveError(navigator.onLine ? 'Couldn’t reach the server.' : 'You’re offline.', 0, navigator.onLine ? 'network' : 'offline');
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) throw new SessionError('expired', 'Your sign-in has expired.');
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new SessionError('expired', 'Your sign-in has expired.');
  const data = (await res.json()) as PhotoRef & { error?: string; message?: string };
  if (res.ok) return { id: data.id, w: data.w, h: data.h };
  if (res.status === 401) throw new SessionError('expired', 'Your sign-in has expired.');
  throw new SaveError(data.message ?? 'That photo wasn’t saved.', res.status, data.error ?? 'error');
}

export function createApiBackend(): Backend {
  return {
    mode: 'live',
    exportHref: '/api/export',
    async load(etag) {
      const r = await call<Snapshot>('GET', '/api/state', undefined, etag ? { 'if-none-match': etag } : {});
      if (r.status === 304) return null;
      return { snapshot: r.data, etag: r.res.headers.get('etag') ?? undefined };
    },
    create: async (kind: Kind, id: string, data: object, parentId?: string) => (await call<Change>('POST', '/api/records', { kind, id, data, ...(parentId ? { parentId } : {}) })).data,
    update: async (id, version, data) => (await call<Change>('PUT', `/api/records/${enc(id)}`, { version, data })).data,
    remove: async (id, version) => (await call<Change>('DELETE', `/api/records/${enc(id)}?version=${version}`)).data,
    restore: async (ids) => (await call<Change>('POST', '/api/restore', { ids })).data,
    complete: async (id) => (await call<Change>('POST', `/api/tasks/${enc(id)}/complete`, {})).data,
    reopen: async (id) => (await call<Change>('POST', `/api/tasks/${enc(id)}/reopen`, {})).data,
    clearChecked: async (listId, items) => (await call<Change>('POST', `/api/lists/${enc(listId)}/clear-checked`, { items })).data,
    setPins: async (targets: PinTarget[]) => (await call<Change>('PUT', '/api/pins', { targets })).data,
    trash: async () => (await call<{ entries: TrashEntry[] }>('GET', '/api/trash')).data.entries,
    uploadPhoto: sendPhoto,
    photoUrl: (id) => `/api/photos/${enc(id)}`,
    protectedInfo: async (recordId) => (await call<ProtectedInfo>('GET', `/api/protected/${enc(recordId)}`)).data,
    setProtected: async (recordId, slot, value) => (await call<Change>('PUT', `/api/protected/${enc(recordId)}/${enc(slot)}`, { value })).data,
    clearProtected: async (recordId, slot) => (await call<Change>('DELETE', `/api/protected/${enc(recordId)}/${enc(slot)}`)).data,
    reveal: async (recordId, slot) => (await call<{ value: string }>('POST', `/api/protected/${enc(recordId)}/${enc(slot)}/reveal`, {})).data.value,
  };
}
