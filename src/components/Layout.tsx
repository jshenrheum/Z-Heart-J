import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { anyDirty, subscribeDirty } from '../lib/dirty.ts';
import { useOnline } from '../lib/online.ts';
import { applyUpdate, usePwa } from '../lib/pwa.ts';
import { Link, navigate, useFocusOnRouteChange, useRoute } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { useForms } from './Forms.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Wordmark } from './Wordmark.tsx';
import { DemoBanner } from '../demo/ui.tsx';
import { clearAppCaches } from '../lib/pwa.ts';

const NAV: Array<{ to: string; label: string; icon: IconName; match: (p: string) => boolean }> = [
  { to: routes.home, label: 'Home', icon: 'home', match: (p) => p === '/' || p === '/search' },
  { to: routes.calendar, label: 'Calendar', icon: 'calendar', match: (p) => p.startsWith('/calendar') },
  { to: routes.wedding, label: 'Wedding', icon: 'heart', match: (p) => p.startsWith('/wedding') },
  { to: routes.info, label: 'Our Info', icon: 'info', match: (p) => p.startsWith('/info') },
  { to: routes.lists, label: 'Lists', icon: 'list', match: (p) => p.startsWith('/lists') },
  { to: routes.plans, label: 'Plans', icon: 'plan', match: (p) => p.startsWith('/plans') },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useRoute();
  const { me, saving, status, session, backend } = useStore();
  const online = useOnline();
  const ready = status === 'ready' && session.kind === 'ok';
  useFocusOnRouteChange(path);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <Link to={routes.home} className="brand" aria-label="Z heart J — home">
          <Wordmark height={34} />
        </Link>
        <div className="topbar-actions">
          <span className="save-state" role="status" aria-live="polite">
            {saving ? 'Saving…' : ''}
          </span>
          <Link to={routes.search} className="icon-btn" aria-label="Search">
            <Icon name="search" />
          </Link>
          {online && ready && <AddMenu />}
          {ready && (
            <Link to={routes.settings} className="avatar" aria-label={`Settings — ${backend.mode === 'demo' ? 'viewing as' : 'signed in as'} ${MEMBERS[me].name}`}>
              {MEMBERS[me].initial}
            </Link>
          )}
        </div>
      </header>

      <nav className="nav" aria-label="Main">
        <Link to={routes.home} className="nav-brand" aria-label="Z heart J — home">
          <Wordmark height={44} />
        </Link>
        {NAV.map((n) => {
          const on = n.match(path);
          return (
            <Link key={n.to} to={n.to} className={`nav-item ${on ? 'is-on' : ''}`} aria-current={on ? 'page' : undefined}>
              <Icon name={n.icon} size={24} />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <main id="main" tabIndex={-1}>
        <UpdateBanner />
        {!online ? (
          <OfflinePanel />
        ) : session.kind !== 'ok' ? (
          <SessionPanel />
        ) : status === 'loading' ? (
          <p className="state-panel muted" role="status">
            Loading your shared information…
          </p>
        ) : status === 'error' ? (
          <LoadErrorPanel />
        ) : (
          <>
            {__DEMO__ && <DemoBanner />}
            <SaveBanner />
            {children}
          </>
        )}
      </main>
    </div>
  );
}

/** Sign out of Cloudflare Access (and drop this app's caches on the way). */
export async function signOut() {
  await clearAppCaches().catch(() => undefined);
  navigator.serviceWorker?.controller?.postMessage('CLEAR_CACHES');
  window.location.assign('/cdn-cgi/access/logout');
}

function SessionPanel() {
  const { session } = useStore();
  if (session.kind === 'ok') return null;
  const title = session.kind === 'expired' ? 'Your sign-in has expired' : session.kind === 'not_member' ? 'This account isn’t one of the two members' : 'Not set up yet';
  return (
    <div className="state-panel" role="alert">
      <h1 className="page-title">{title}</h1>
      <p>
        {session.kind === 'expired'
          ? 'Nothing is shown until you sign in again. Anything you hadn’t saved yet wasn’t saved.'
          : session.kind === 'not_member'
            ? 'Sign out and sign in with the email address this household uses.'
            : session.message}
      </p>
      {session.kind === 'expired' ? (
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Sign in again
        </button>
      ) : session.kind === 'not_member' ? (
        <button type="button" className="btn btn-primary" onClick={() => void signOut()}>
          <Icon name="logout" size={18} /> Sign out
        </button>
      ) : null}
    </div>
  );
}

function LoadErrorPanel() {
  const { refresh } = useStore();
  return (
    <div className="state-panel" role="alert">
      <h1 className="page-title">Couldn’t load your information</h1>
      <p>The server didn’t answer. Nothing is shown rather than an old or partial copy.</p>
      <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
        <Icon name="refresh" size={18} /> Try again
      </button>
    </div>
  );
}

function SaveBanner() {
  const { banner, dismissBanner } = useStore();
  if (!banner) return null;
  return (
    <div className="save-banner" role="alert">
      <p>{banner.message}</p>
      <div className="save-banner-actions">
        {banner.retry && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const retry = banner.retry;
              dismissBanner();
              retry?.();
            }}
          >
            <Icon name="refresh" size={16} /> Retry
          </button>
        )}
        <button type="button" className="btn btn-quiet btn-sm" onClick={dismissBanner}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function OfflinePanel() {
  return (
    <div className="offline-panel" role="status">
      <Wordmark height={64} />
      <h1 className="page-title">You’re offline</h1>
      <p>Connect to view or update your shared information.</p>
      <p className="muted">Nothing from your household is kept on this device, so there is nothing to show until you’re back online.</p>
    </div>
  );
}

function UpdateBanner() {
  const { updateReady } = usePwa();
  const dirty = useSyncExternalStore(subscribeDirty, anyDirty, () => false);
  if (!updateReady) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version is ready.{dirty ? ' Finish or discard your edit first.' : ''}</span>
      <button type="button" className="btn btn-quiet btn-sm" onClick={applyUpdate} disabled={dirty}>
        Update available — refresh
      </button>
    </div>
  );
}

// -------------------------------------------------------------------- Add menu

interface Choice {
  label: string;
  icon: IconName;
  run: () => void;
}

function AddMenu() {
  const { path } = useRoute();
  const { state, me } = useStore();
  const forms = useForms();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groceries = state.lists.find((l) => /grocer/i.test(l.title)) ?? state.lists[0];
  const task: Choice = { label: 'New task', icon: 'plan', run: () => forms.open({ kind: 'task' }) };
  const info: Choice = { label: 'Add information', icon: 'info', run: () => forms.open({ kind: 'info' }) };
  const event: Choice = { label: 'New event', icon: 'calendar', run: () => forms.open({ kind: 'event' }) };
  const addItem = (listId: string): Choice => ({ label: 'Add an item', icon: 'plus', run: () => navigate(routes.list(listId), { state: { focusAdd: true } }) });

  let choices: Choice[];
  if (path.startsWith('/info')) {
    choices = [
      { label: 'Add work location', icon: 'building', run: () => forms.open({ kind: 'location', owner: me }) },
      { label: 'Add credential', icon: 'lock', run: () => forms.open({ kind: 'credential', owner: me }) },
      { label: 'Add contact', icon: 'phone', run: () => forms.open({ kind: 'contact' }) },
      info,
    ];
  } else if (path.startsWith('/lists')) {
    const id = path.split('/')[2];
    choices = [...(id ? [addItem(id)] : []), { label: 'New list', icon: 'list', run: () => forms.open({ kind: 'list' }) }];
  } else if (path.startsWith('/plans')) {
    choices = [task, { label: 'New plan', icon: 'calendar', run: () => forms.open({ kind: 'plan' }) }];
  } else if (path.startsWith('/calendar')) {
    choices = [event, task];
  } else if (path.startsWith('/wedding')) {
    const plan = state.plans.find((p) => p.template === 'wedding' && p.status === 'active');
    choices = [
      { label: 'Add guest', icon: 'user', run: () => forms.open({ kind: 'guest' }) },
      { label: 'Add vendor', icon: 'building', run: () => forms.open({ kind: 'vendor' }) },
      { label: 'Add budget line', icon: 'list', run: () => forms.open({ kind: 'budget' }) },
      { ...task, label: 'Add to the checklist', run: () => forms.open({ kind: 'task', prefill: plan ? { planId: plan.id } : {} }) },
    ];
  } else if (path.startsWith('/settings')) {
    return null;
  } else {
    choices = [...(groceries ? [{ ...addItem(groceries.id), label: `Add to ${groceries.title}` }] : []), event, task, info];
  }

  return (
    <div className="add-wrap" ref={wrap}>
      <button ref={btn} type="button" className="add-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" size={20} /> <span>Add</span>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Add">
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                btn.current?.focus(); // the menu item is about to unmount; forms return focus to whatever had it
                c.run();
              }}
            >
              <Icon name={c.icon} size={20} /> {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
