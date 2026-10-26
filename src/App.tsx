import { useEffect } from 'react';
import { FeedbackProvider } from './lib/feedback.tsx';
import { navigate, useRoute } from './lib/router.tsx';
import { routes } from './lib/routes.ts';
import type { Backend } from './data/backend.ts';
import { StoreProvider } from './data/store.tsx';
import { FormsProvider } from './components/Forms.tsx';
import { AppShell } from './components/Layout.tsx';
import { HomePage } from './pages/Home.tsx';
import { ContactsPage, InfoPage } from './pages/Info.tsx';
import { InfoDetailPage } from './pages/InfoDetail.tsx';
import { ListPage, ListsPage } from './pages/Lists.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { PlanPage, PlansPage } from './pages/Plans.tsx';
import { SearchPage } from './pages/Search.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { TrashPage } from './pages/Trash.tsx';

function Routes() {
  const { path } = useRoute();
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = seg;

  if (path === '/') return <HomePage />;
  if (path === routes.search) return <SearchPage />;
  if (path === routes.settings) return <SettingsPage />;
  if (path === routes.trash) return <TrashPage />;
  if (a === 'info') {
    if (seg.length === 1) return <InfoPage />;
    if (b === 'contacts' && seg.length === 2) return <ContactsPage />;
    if (b === 'r' && c && seg.length === 3) return <InfoDetailPage id={c} />;
  }
  if (a === 'lists') {
    if (seg.length === 1) return <ListsPage />;
    if (b && seg.length === 2) return <ListPage id={b} />;
  }
  if (a === 'plans') {
    if (seg.length === 1) return <PlansPage />;
    if (b === 'p' && c && seg.length === 3) return <PlanPage id={c} />;
  }
  return <NotFound />;
}

/** "/" or ⌘/Ctrl-K opens search from anywhere — an extra, never the only way in. */
function useSearchShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        navigate(routes.search);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App({ backend }: { backend: Backend }) {
  useSearchShortcut();
  return (
    <FeedbackProvider>
      <StoreProvider backend={backend}>
        <FormsProvider>
          <AppShell>
            <Routes />
          </AppShell>
        </FormsProvider>
      </StoreProvider>
    </FeedbackProvider>
  );
}
