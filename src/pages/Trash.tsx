import { useCallback, useEffect, useState } from 'react';
import { MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { SessionError } from '../data/backend.ts';
import { displayDate } from '../lib/dates.ts';
import { useFeedback } from '../lib/feedback.tsx';
import type { TrashEntry } from '../lib/records.ts';
import { routes } from '../lib/routes.ts';
import { Icon } from '../components/Icon.tsx';
import { EmptyState, PageHeader, timeAgo } from '../components/ui.tsx';

/** Deleted things, newest first, each restorable for 30 days. */
export function TrashPage() {
  const { backend, actions, today, refresh } = useStore();
  const { toast } = useFeedback();
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await backend.trash());
    } catch (e) {
      if (e instanceof SessionError) void refresh();
      setError('Couldn’t load the trash. Check your connection and try again.');
    }
  }, [backend, refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <PageHeader title="Trash" sub="Kept for 30 days, then removed for good. Restoring a list or plan brings back its items or tasks too." back={{ to: routes.settings, label: 'Settings' }} />
      {error ? (
        <div className="state-panel" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            <Icon name="refresh" size={18} /> Try again
          </button>
        </div>
      ) : entries === null ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : entries.length === 0 ? (
        <EmptyState title="The trash is empty." body="When either of you deletes something, it waits here for 30 days." />
      ) : (
        <ul className="trash-list">
          {entries.map((e) => (
            <li key={e.id} className="card trash-entry">
              <span className="card-main">
                <span className="card-title">{e.title}</span>
                <span className="card-sub">{e.context}</span>
                <span className="card-meta muted small">
                  Deleted by {MEMBERS[e.deletedBy].name} {timeAgo(e.deletedAt)} · removed for good after {displayDate(e.purgeAfter, today)}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy !== null}
                aria-label={`Restore “${e.title}”`}
                onClick={async () => {
                  setBusy(e.id);
                  const r = await actions.restore([e.id]);
                  setBusy(null);
                  if (r.ok) {
                    toast(`Restored “${e.title}”.`);
                    void load();
                  } else {
                    toast(r.message, { tone: 'error' });
                  }
                }}
              >
                <Icon name="undo" size={17} /> {busy === e.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
