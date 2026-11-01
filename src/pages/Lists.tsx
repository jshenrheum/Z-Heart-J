import { useState } from 'react';
import type { ListItem } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { NeedDock } from '../components/NeedDock.tsx';
import { listWords } from '../lib/lists.ts';
import { useOnline } from '../lib/online.ts';
import { CardLink, ConfirmDialog, EmptyState, PageHeader, PinButton, UpdatedBy } from '../components/ui.tsx';
import { routes } from '../lib/routes.ts';
import { NotFound } from './NotFound.tsx';

export function ListsPage() {
  const { state, actions } = useStore();
  const forms = useForms();
  const hasGroceries = state.lists.some((l) => /grocer/i.test(l.title));
  const hasRecipes = state.lists.some((l) => /recipe/i.test(l.title));
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
            return <CardLink key={l.id} to={routes.list(l.id)} icon="list" title={l.title} sub={`${open} to get`} meta={l.description ? <span className="muted small">{l.description}</span> : undefined} />;
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
      {!hasRecipes && (
        <div className="card">
          <p className="card-title">Start a Recipes list</p>
          <p className="muted">One tile per recipe. Hold a tile for its ingredients and method; tap it once you’ve made it, and it waits under Recently used.</p>
          <button type="button" className="btn btn-quiet" onClick={() => void actions.saveList(null, 'Recipes', 'What to cook, and how.')}>
            <Icon name="plus" size={17} /> Create Recipes
          </button>
        </div>
      )}
    </div>
  );
}

/** Per-device preference: keep a list in A–Z order. */
const AZ_KEY = 'zhj:list-az';
const readAz = () => {
  try {
    return localStorage.getItem(AZ_KEY) === '1';
  } catch {
    return false;
  }
};
const writeAz = (on: boolean) => {
  try {
    localStorage.setItem(AZ_KEY, on ? '1' : '0');
  } catch {
    // Private mode or storage off: the choice lasts until the page closes.
  }
};

/** One line per item: a circle to tick (or put back), the name, and an arrow that drops down its details and Edit. */
function ItemRow({ item, away, onToggle, onEdit }: { item: ListItem; away: boolean; onToggle: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const done = item.checked;
  return (
    <li className={`li-row ${done ? 'is-done' : ''} ${item.sync ? 'is-saving' : ''}`} aria-busy={item.sync ? true : undefined}>
      <button type="button" role="checkbox" aria-checked={done} className="check" aria-label={done ? `Put back “${item.name}”` : `Check off “${item.name}”`} onClick={onToggle}>
        {done && <Icon name="check" size={18} />}
      </button>
      <div className="li-body">
        <button type="button" className="li-line" aria-expanded={open} aria-controls={`ld-${item.id}`} onClick={() => setOpen((v) => !v)}>
          <span className="li-name">{item.name}</span>
          <Icon name="chevron" size={16} className="li-chev" />
        </button>
        {open && (
          <div className="li-details" id={`ld-${item.id}`}>
            {item.qty && <span>{item.qty}</span>}
            {item.note && <span className="li-note">{item.note}</span>}
            {!item.qty && !item.note && <span className="muted">No details yet.</span>}
            {!away && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={onEdit} aria-label={`Edit “${item.name}”`}>
                <Icon name="edit" size={15} /> Edit
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ListPage({ id }: { id: string }) {
  const { state, actions, offline } = useStore();
  const online = useOnline();
  // Without a connection a list still ticks and adds; editing, pinning and clearing wait.
  const away = !online || offline.copy;
  const forms = useForms();
  const list = state.lists.find((l) => l.id === id);
  const [az, setAz] = useState(readAz);
  const [confirmClear, setConfirmClear] = useState(false);
  if (!list) return <NotFound what="list" />;

  const open = list.items.filter((i) => !i.checked);
  const shown = az ? [...open].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })) : open;
  const recent = list.items.filter((i) => i.checked).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const words = listWords(list.title);
  const edit = (i: ListItem) => forms.open({ kind: 'item', listId: list.id, itemId: i.id });
  const row = (i: ListItem) => <ItemRow key={i.id} item={i} away={away} onToggle={() => void actions.toggleItem(list.id, i.id)} onEdit={() => edit(i)} />;

  return (
    <div className="page list-page">
      <PageHeader
        title={list.title}
        sub={list.description || undefined}
        back={{ to: routes.lists, label: 'Lists' }}
        actions={
          away ? undefined : (
            <>
              <PinButton target={{ kind: 'list', id: list.id }} />
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'list', id: list.id })}>
                <Icon name="edit" size={17} /> Edit list
              </button>
            </>
          )
        }
      />

      <section className="tiles-section" aria-labelledby="to-get-h">
        <div className="list-tools">
          <h2 className="section-title" id="to-get-h">
            {words.open} <span className="count">{open.length}</span>
          </h2>
          {list.items.length > 0 && (
            <div className="list-tools-actions">
              {open.length > 1 && (
                <button
                  type="button"
                  className={`btn btn-quiet btn-sm ${az ? 'is-on' : ''}`}
                  aria-pressed={az}
                  onClick={() => {
                    writeAz(!az);
                    setAz(!az);
                  }}
                >
                  A–Z
                </button>
              )}
            </div>
          )}
        </div>
        {open.length > 0 ? (
          <>
            <ul className="li-list card" id="to-get">
              {shown.map(row)}
            </ul>
            <p className="tile-hint">{words.hint}</p>
          </>
        ) : list.items.length === 0 ? (
          <EmptyState title={words.empty} body={words.emptyBody} />
        ) : (
          <p className="muted">{words.allDone}</p>
        )}
      </section>

      {recent.length > 0 && (
        <details className="recent">
          <summary>
            <Icon name="chevron" size={16} className="recent-chevron" />
            {words.recent} <span className="count">{recent.length}</span>
          </summary>
          <ul className="li-list card">{recent.map(row)}</ul>
          <button type="button" className="btn btn-quiet btn-sm recent-clear" onClick={() => setConfirmClear(true)} hidden={away}>
            <Icon name="trash" size={16} /> {words.clear}
          </button>
        </details>
      )}

      <UpdatedBy by={list.updatedBy} at={list.updatedAt} />
      <NeedDock list={list} />

      {confirmClear && (
        <ConfirmDialog
          title={`Clear ${recent.length} recently used item${recent.length === 1 ? '' : 's'}?`}
          body="They’ll be removed from this list for both of you. You can undo right after."
          confirmLabel="Clear"
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
