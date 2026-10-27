import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import type { ListItem } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { NeedDock } from '../components/NeedDock.tsx';
import { itemSub, listWords } from '../lib/lists.ts';
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

/**
 * Tap to act; press and hold (or right-click) to edit. After a hold, the finger
 * lifting produces no click, so the item isn't also checked off.
 */
function useHold(onTap: () => void, onHold: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const stop = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      held.current = false;
      stop();
      if (e.button !== 0) return;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        held.current = true;
        onHold();
      }, 450);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onTouchEnd: (e: ReactTouchEvent) => {
      if (held.current) e.preventDefault();
    },
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      if (held.current) return;
      stop();
      held.current = true;
      onHold();
    },
    onClick: () => {
      if (held.current) {
        held.current = false;
        return;
      }
      onTap();
    },
  };
}

function Tile({ item, recent, editing, onTap, onEdit }: { item: ListItem; recent: boolean; editing: boolean; onTap: () => void; onEdit: () => void }) {
  const press = useHold(editing ? onEdit : onTap, onEdit);
  const sub = itemSub(item);
  const action = editing ? 'Edit' : recent ? 'Put back' : 'Check off';
  return (
    <li>
      <button
        type="button"
        className={`tile ${recent ? 'tile-recent' : ''} ${editing ? 'is-editing' : ''} ${item.sync ? 'is-saving' : ''}`}
        aria-label={`${action} “${item.name}”${sub ? `, ${sub}` : ''}`}
        aria-busy={item.sync ? true : undefined}
        {...press}
      >
        <span className="tile-name">{item.name}</span>
        {sub && <span className="tile-sub">{sub}</span>}
        {editing && <Icon name="edit" size={14} className="tile-mark" />}
      </button>
    </li>
  );
}

export function ListPage({ id }: { id: string }) {
  const { state, actions } = useStore();
  const forms = useForms();
  const list = state.lists.find((l) => l.id === id);
  const [editing, setEditing] = useState(false);
  const [az, setAz] = useState(readAz);
  const [confirmClear, setConfirmClear] = useState(false);
  if (!list) return <NotFound what="list" />;

  const open = list.items.filter((i) => !i.checked);
  const shown = az ? [...open].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })) : open;
  const recent = list.items.filter((i) => i.checked).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const words = listWords(list.title);
  const edit = (i: ListItem) => forms.open({ kind: 'item', listId: list.id, itemId: i.id });
  const tile = (i: ListItem) => (
    <Tile key={i.id} item={i} recent={i.checked} editing={editing} onTap={() => void actions.toggleItem(list.id, i.id)} onEdit={() => edit(i)} />
  );

  return (
    <div className="page list-page">
      <PageHeader
        title={list.title}
        sub={list.description || undefined}
        back={{ to: routes.lists, label: 'Lists' }}
        actions={
          <>
            <PinButton target={{ kind: 'list', id: list.id }} />
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'list', id: list.id })}>
              <Icon name="edit" size={17} /> Edit list
            </button>
          </>
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
              <button type="button" className={`btn btn-quiet btn-sm ${editing ? 'is-on' : ''}`} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
                {editing ? 'Done' : 'Edit items'}
              </button>
            </div>
          )}
        </div>
        {open.length > 0 ? (
          <>
            <ul className="tiles" id="to-get">
              {shown.map(tile)}
            </ul>
            <p className="tile-hint">{editing ? words.editHint : words.hint}</p>
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
          <ul className="tiles tiles-recent">{recent.map(tile)}</ul>
          <button type="button" className="btn btn-quiet btn-sm recent-clear" onClick={() => setConfirmClear(true)}>
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
