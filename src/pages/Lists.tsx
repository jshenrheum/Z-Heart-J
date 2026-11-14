import { useEffect, useRef, useState } from 'react';
import type { ListItem } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { ItemRow, NewItemRow, useLinger, useDragOrder } from '../components/ListItems.tsx';
import { Link } from '../lib/router.tsx';
import { listWords } from '../lib/lists.ts';
import { useOnline } from '../lib/online.ts';
import { CardLink, ConfirmDialog, EmptyState, PageHeader, UpdatedBy } from '../components/ui.tsx';
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

export function ListPage({ id }: { id: string }) {
  const { state, actions, offline, me } = useStore();
  const online = useOnline();
  // Without a connection a list still ticks and adds; editing, moving, pinning and clearing wait.
  const away = !online || offline.copy;
  const forms = useForms();
  const list = state.lists.find((l) => l.id === id);
  const [az, setAz] = useState(readAz);
  const [menu, setMenu] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const listEl = useRef<HTMLUListElement>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => {
      if (!menuEl.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);
  const { lingering, add: linger, drop: unlinger } = useLinger();
  const open = (list?.items ?? []).filter((i) => !i.checked);
  const inList = (list?.items ?? []).filter((i) => !i.checked || lingering.has(i.id)).sort((a, b) => a.position - b.position);
  const shown = az ? [...inList].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })) : inList;
  const drag = useDragOrder(shown.map((i) => i.id), listEl, (itemId, after, before) => void actions.moveItemTo(id, itemId, after, before));
  const tick = (i: ListItem) => {
    if (i.checked) {
      unlinger(i.id);
      void actions.toggleItem(id, i.id, { want: false, keepPlace: true, quiet: true });
    } else {
      linger(i.id);
      void actions.toggleItem(id, i.id);
    }
  };
  if (!list) return <NotFound what="list" />;

  const recent = list.items.filter((i) => i.checked && !lingering.has(i.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const words = listWords(list.title);
  const byId = new Map(shown.map((i) => [i.id, i]));
  const pinned = state.pins[me].some((p) => p.kind === 'list' && p.id === list.id);

  return (
    <div className="page list-page">
      <div className="page-head">
        <Link to={routes.lists} className="back-link">
          <Icon name="chevron" size={16} className="flip" /> Lists
        </Link>
        <div className="page-head-row">
          <div className="page-head-text">
            <h1 className="page-title">
              {list.title} <span className="list-count">{open.length}</span>
            </h1>
            {list.description && <p className="page-sub">{list.description}</p>}
          </div>
          {!away && (
            <div className="list-menu" ref={menuEl}>
              <button type="button" className="icon-btn list-menu-btn" aria-label="List options" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                <Icon name="more" size={22} />
              </button>
              {menu && (
                <div className="list-menu-pop" role="menu" onClick={() => setMenu(false)}>
                  <button type="button" role="menuitem" onClick={() => actions.togglePin({ kind: 'list', id: list.id })}>
                    <Icon name="pin" size={17} /> {pinned ? 'Unpin from Home' : 'Pin to Home'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { writeAz(!az); setAz(!az); }}>
                    <Icon name="list" size={17} /> {az ? 'Order I added them' : 'Sort A–Z'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => forms.open({ kind: 'list', id: list.id })}>
                    <Icon name="edit" size={17} /> Edit list
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ul className="li-list li-light card" id="to-get" ref={listEl} aria-label={words.open}>
        {drag.order.map((rid) => {
          const i = byId.get(rid);
          if (!i) return null;
          return (
            <ItemRow
              key={i.id}
              item={i}
              listId={list.id}
              editable={!away}
              reorderable={!away && !az && !i.checked}
              ticking={i.checked}
              onTick={() => tick(i)}
              dragging={drag.draggingId === i.id}
              dragOffset={drag.offset(i.id)}
              onDragStart={drag.start}
              onDragMove={drag.moveTo}
              onDragEnd={drag.end}
              onStep={(dir) => {
                const ids = shown.map((x) => x.id);
                const at = ids.indexOf(i.id);
                const to = at + dir;
                if (to < 0 || to >= ids.length) return;
                const rest = ids.filter((x) => x !== i.id);
                rest.splice(to, 0, i.id);
                void actions.moveItemTo(list.id, i.id, rest[to - 1] ?? null, rest[to + 1] ?? null);
              }}
            />
          );
        })}
        <NewItemRow list={list} />
      </ul>
      {list.items.length === 0 && <p className="tile-hint">{words.emptyBody}</p>}

      {recent.length > 0 && (
        <details className="recent">
          <summary>
            <Icon name="chevron" size={16} className="recent-chevron" />
            {words.recent} <span className="count">{recent.length}</span>
          </summary>
          <ul className="li-list card">
            {recent.map((i) => (
              <ItemRow key={i.id} item={i} listId={list.id} editable={!away} reorderable={false} ticking={false} onTick={() => void actions.toggleItem(list.id, i.id)} dragging={false} dragOffset={0} onDragStart={() => undefined} onDragMove={() => undefined} onDragEnd={() => undefined} onStep={() => undefined} />
            ))}
          </ul>
          <button type="button" className="btn btn-quiet btn-sm recent-clear" onClick={() => setConfirmClear(true)} hidden={away}>
            <Icon name="trash" size={16} /> {words.clear}
          </button>
        </details>
      )}

      <UpdatedBy by={list.updatedBy} at={list.updatedAt} />

      {confirmClear && (
        <ConfirmDialog
          title={`Clear ${recent.length} item${recent.length === 1 ? '' : 's'}?`}
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
