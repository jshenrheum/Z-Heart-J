import { useState } from 'react';
import { MEMBERS, type ListItem } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { QuickAdd } from '../components/QuickAdd.tsx';
import { CardLink, ConfirmDialog, EmptyState, PageHeader, PinButton, UpdatedBy } from '../components/ui.tsx';
import { routes } from '../lib/routes.ts';
import { NotFound } from './NotFound.tsx';

export function ListsPage() {
  const { state, actions } = useStore();
  const forms = useForms();
  const hasGroceries = state.lists.some((l) => /grocer/i.test(l.title));
  return (
    <div className="page">
      <PageHeader
        title="Lists"
        sub="Shared by both of you. Add and check items from either phone."
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'list' })}>
            <Icon name="plus" size={17} /> New list
          </button>
        }
      />
      {state.lists.length === 0 ? (
        <EmptyState title="No lists yet." body="Start with groceries, or make a custom list for anything else." />
      ) : (
        <div className="stack">
          {state.lists.map((l) => {
            const open = l.items.filter((i) => !i.checked).length;
            const done = l.items.length - open;
            return <CardLink key={l.id} to={routes.list(l.id)} icon="list" title={l.title} sub={`${open} to get${done ? ` · ${done} checked` : ''}`} meta={l.description ? <span className="muted small">{l.description}</span> : undefined} />;
          })}
        </div>
      )}
      {!hasGroceries && (
        <div className="card">
          <p className="card-title">Start a Groceries list</p>
          <p className="muted">The one most households reach for first.</p>
          <button type="button" className="btn btn-quiet" onClick={() => void actions.saveList(null, 'Groceries', '')}>
            <Icon name="plus" size={17} /> Create Groceries
          </button>
        </div>
      )}
    </div>
  );
}

export function ListPage({ id }: { id: string }) {
  const { state, actions } = useStore();
  const forms = useForms();
  const list = state.lists.find((l) => l.id === id);
  const [reorder, setReorder] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  if (!list) return <NotFound what="list" />;

  const open = list.items.filter((i) => !i.checked);
  const checked = list.items.filter((i) => i.checked);

  const row = (i: ListItem, pos: number, count: number) => (
    <li key={i.id} className={`item ${i.checked ? 'is-done' : ''} ${i.sync ? 'is-saving' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={i.checked}
        className="check"
        aria-label={i.checked ? `Put back “${i.name}”` : `Check off “${i.name}”`}
        onClick={() => void actions.toggleItem(list.id, i.id)}
      >
        {i.checked && <Icon name="check" size={18} />}
      </button>
      <button type="button" className="item-body" onClick={() => forms.open({ kind: 'item', listId: list.id, itemId: i.id })} aria-label={`Edit “${i.name}”`}>
        <span className="item-name">{i.name}</span>
        {(i.qty || i.note) && <span className="item-sub">{[i.qty, i.note].filter(Boolean).join(' · ')}</span>}
      </button>
      {i.sync ? (
        <span className="muted small" aria-live="polite">Saving…</span>
      ) : reorder && !i.checked ? (
        <span className="reorder">
          <button type="button" className="icon-btn" disabled={pos === 0} onClick={() => void actions.moveItem(list.id, i.id, -1)} aria-label={`Move “${i.name}” up`}>
            <Icon name="arrowUp" size={18} />
          </button>
          <button type="button" className="icon-btn" disabled={pos === count - 1} onClick={() => void actions.moveItem(list.id, i.id, 1)} aria-label={`Move “${i.name}” down`}>
            <Icon name="arrowDown" size={18} />
          </button>
        </span>
      ) : (
        <span className="item-by" title={`Last changed by ${MEMBERS[i.updatedBy].name}`} aria-label={`Last changed by ${MEMBERS[i.updatedBy].name}`}>
          {MEMBERS[i.updatedBy].initial}
        </span>
      )}
    </li>
  );

  return (
    <div className="page">
      <PageHeader
        title={list.title}
        sub={list.description || undefined}
        back={{ to: routes.lists, label: 'Lists' }}
        actions={
          <>
            <PinButton target={{ kind: 'list', id: list.id }} />
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'list', id: list.id })}>
              <Icon name="edit" size={17} /> Edit
            </button>
          </>
        }
      />
      <QuickAdd listId={list.id} listTitle={list.title} grabFocus />

      {open.length === 0 && checked.length === 0 ? (
        <EmptyState title="Nothing on this list yet." body="Type an item above and press Enter. The field stays ready for the next one." />
      ) : (
        <>
          <div className="list-tools">
            <span className="muted small">{open.length} to get</span>
            {open.length > 1 && (
              <button type="button" className={`btn btn-quiet btn-sm ${reorder ? 'is-on' : ''}`} aria-pressed={reorder} onClick={() => setReorder((r) => !r)}>
                <Icon name="arrowDown" size={16} /> {reorder ? 'Done reordering' : 'Reorder'}
              </button>
            )}
          </div>
          {open.length > 0 ? <ul className="item-list card">{open.map((i, p) => row(i, p, open.length))}</ul> : <p className="muted">Everything’s checked off.</p>}
        </>
      )}

      {checked.length > 0 && (
        <details className="checked">
          <summary>
            Checked <span className="count">{checked.length}</span>
          </summary>
          <ul className="item-list card">{checked.map((i, p) => row(i, p, checked.length))}</ul>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" size={16} /> Clear checked
          </button>
        </details>
      )}

      <UpdatedBy by={list.updatedBy} at={list.updatedAt} />

      {confirmClear && (
        <ConfirmDialog
          title={`Clear ${checked.length} checked item${checked.length === 1 ? '' : 's'}?`}
          body="They’ll be removed from this list for both of you. You can undo right after."
          confirmLabel="Clear checked"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            void actions.clearChecked(list.id);
          }}
        />
      )}
    </div>
  );
}
