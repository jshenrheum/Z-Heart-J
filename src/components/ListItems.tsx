import { useEffect, useMemo, useRef, useState, type RefObject, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { ListItem, SharedList } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { itemSub, listWords, recentMatches } from '../lib/lists.ts';
import { Icon } from './Icon.tsx';

/**
 * A list that works like Reminders: tap the circle to tick (the item stays a moment,
 * so a second tap takes it back, then moves to Done); tap the text to edit it in
 * place; swipe left to delete; drag the grip to reorder; type into
 * the last row to add, and Return keeps the keyboard up for the next one.
 */

const TICK_MS = 1200;
const SWIPE_OPEN = 84;

const norm = (s: string) => s.trim().toLowerCase();
/** Keeps a gesture on its element; some pointers (and synthetic ones) can't be captured, which is fine. */
const capture = (e: ReactPointerEvent) => {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  } catch {
    /* not capturable */
  }
};

interface RowProps {
  item: ListItem;
  listId: string;
  /** Editing, swiping and dragging need a connection; ticking doesn't. */
  editable: boolean;
  reorderable: boolean;
  ticking: boolean;
  onTick: () => void;
  dragging: boolean;
  dragOffset: number;
  onDragStart: (id: string, y: number) => void;
  onDragMove: (y: number) => void;
  onDragEnd: () => void;
  /** Keyboard reordering from the grip: one place up or down. */
  onStep: (dir: -1 | 1) => void;
}

export function ItemRow({ item, listId, editable, reorderable, ticking, onTick, dragging, dragOffset, onDragStart, onDragMove, onDragEnd, onStep }: RowProps) {
  const { actions } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [note, setNote] = useState(item.note);
  const [swipe, setSwipeState] = useState(0);
  // The latest offset, read by the gesture handlers between renders.
  const swipeRef = useRef(0);
  const setSwipe = (v: number) => {
    swipeRef.current = v;
    setSwipeState(v);
  };
  const rowRef = useRef<HTMLLIElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const g = useRef<{ x: number; y: number; base: number; mode: 'pending' | 'swipe' | 'off'; width: number } | null>(null);
  const dragOn = useRef(false);
  const done = item.checked || ticking;
  const sub = itemSub(item);

  useEffect(() => {
    if (!editing) {
      setName(item.name);
      setQty(item.qty);
      setNote(item.note);
    }
  }, [item.name, item.qty, item.note, editing]);
  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = name.trim();
    if (!n) {
      void actions.deleteItem(listId, item.id);
      return;
    }
    if (n !== item.name || qty.trim() !== item.qty || note.trim() !== item.note) void actions.editItem(listId, item.id, { name: n, qty: qty.trim(), note: note.trim() });
  };
  const cancel = () => {
    setName(item.name);
    setQty(item.qty);
    setNote(item.note);
    setEditing(false);
  };

  // ---- gestures: tap the text to edit, swipe left to delete (dragging is the grip's)
  const down = (e: ReactPointerEvent) => {
    if (editing || e.button !== 0) return;
    const width = rowRef.current?.offsetWidth ?? 320;
    g.current = { x: e.clientX, y: e.clientY, base: swipeRef.current, mode: 'pending', width };
  };
  const move = (e: ReactPointerEvent) => {
    const s = g.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === 'pending') {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) && editable) {
        s.mode = 'swipe';
        capture(e);
      } else if (Math.abs(dy) > 10) {
        s.mode = 'off'; // a scroll
      }
    }
    if (s.mode === 'swipe') setSwipe(Math.max(-s.width * 0.9, Math.min(0, s.base + dx)));
  };
  const up = (e: ReactPointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    if (s.mode === 'swipe') {
      const at = swipeRef.current;
      if (at < -s.width * 0.5) void actions.deleteItem(listId, item.id);
      else setSwipe(at < -40 ? -SWIPE_OPEN : 0);
      return;
    }
    if (s.mode === 'pending') {
      if (swipeRef.current !== 0) setSwipe(0);
      else if (editable && (e.target as HTMLElement).closest('.li-text')) setEditing(true);
    }
  };
  const cancelGesture = () => {
    const s = g.current;
    g.current = null;
    if (s?.mode === 'swipe') setSwipe(0);
  };

  const keys = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <li
      ref={rowRef}
      data-id={item.id}
      className={`li-row ${done ? 'is-done' : ''} ${ticking ? 'is-ticking' : ''} ${item.sync ? 'is-saving' : ''} ${dragging ? 'is-dragging' : ''} ${editing ? 'is-editing' : ''}`}
      style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
      aria-busy={item.sync ? true : undefined}
    >
      {editable && (
        <button type="button" className="li-delete" tabIndex={swipe ? 0 : -1} aria-hidden={swipe ? undefined : true} onClick={() => void actions.deleteItem(listId, item.id)}>
          Delete
        </button>
      )}
      <div
        className="li-slide"
        style={swipe ? { transform: `translateX(${swipe}px)` } : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancelGesture}
      >
        <button type="button" role="checkbox" aria-checked={done} className="check" aria-label={done ? `Put back “${item.name}”` : `Check off “${item.name}”`} onPointerDown={(e) => e.stopPropagation()} onClick={onTick}>
          {done && <Icon name="check" size={18} />}
        </button>
        {editing ? (
          <div
            className="li-edit"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
            }}
          >
            <input
              ref={nameRef}
              className="li-input li-input-name"
              value={name}
              maxLength={100}
              aria-label="Item"
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                keys(e);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <div className="li-edit-more">
              <input className="li-input li-input-qty" value={qty} maxLength={40} placeholder="Quantity" aria-label="Quantity" onChange={(e) => setQty(e.target.value)} onKeyDown={keys} />
              <textarea className="li-input li-input-note" value={note} maxLength={2000} rows={Math.min(6, Math.max(1, note.split('\n').length))} placeholder="Notes" aria-label="Notes" onChange={(e) => setNote(e.target.value)} onKeyDown={keys} />
              <button type="button" className="icon-btn li-trash" aria-label={`Delete “${item.name}”`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditing(false); void actions.deleteItem(listId, item.id); }}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className="li-text">
            <span className="li-name">{item.name}</span>
            {sub && <span className="li-sub">{item.qty && item.note ? `${item.qty} · ${item.note}` : item.qty || item.note}</span>}
            {editable && (
              <button type="button" className="sr-only" onClick={() => setEditing(true)} aria-label={`Edit “${item.name}”`}>
                Edit
              </button>
            )}
          </div>
        )}
        {reorderable && !editing && (
          <button
            type="button"
            className="li-grip"
            aria-label={`Move “${item.name}”`}
            aria-description="Drag, or use the arrow keys"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              e.preventDefault();
              capture(e);
              dragOn.current = true;
              navigator.vibrate?.(8);
              onDragStart(item.id, e.clientY);
            }}
            onPointerMove={(e) => dragOn.current && onDragMove(e.clientY)}
            onPointerUp={() => {
              if (!dragOn.current) return;
              dragOn.current = false;
              onDragEnd();
            }}
            onPointerCancel={() => {
              if (!dragOn.current) return;
              dragOn.current = false;
              onDragEnd();
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                onStep(e.key === 'ArrowUp' ? -1 : 1);
              }
            }}
          >
            <Icon name="grip" size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

/** The last row: type a new item; Return adds it and keeps the keyboard up. Matching done items are offered to bring back. */
export function NewItemRow({ list }: { list: SharedList }) {
  const { actions } = useStore();
  const [text, setText] = useState('');
  const [dupKey, setDupKey] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => recentMatches(list, text), [list, text]);
  const words = listWords(list.title);

  const reset = () => {
    setText('');
    setDupKey(null);
    input.current?.focus();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    const key = norm(name);
    if (list.items.some((i) => !i.checked && norm(i.name) === key) && dupKey !== key) {
      setDupKey(key);
      return;
    }
    reset();
    void actions.addItem(list.id, name);
  };

  return (
    <li className="li-row li-new">
      <form className="li-slide" onSubmit={submit}>
        <span className="li-new-plus" aria-hidden="true">
          <Icon name="plus" size={16} />
        </span>
        <div className="li-text">
          <label className="sr-only" htmlFor={`new-${list.id}`}>
            Add an item to {list.title}
          </label>
          <input
            ref={input}
            id={`new-${list.id}`}
            className="li-input li-input-new"
            placeholder={words.placeholder}
            value={text}
            maxLength={100}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="enter"
            onChange={(e) => {
              setText(e.target.value);
              setDupKey(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && text) {
                e.preventDefault();
                setText('');
                setDupKey(null);
              }
            }}
          />
          {dupKey && (
            <p className="li-hint" role="status">
              “{text.trim()}” is already on the list. Press Return again to add it anyway.
            </p>
          )}
          {matches.length > 0 && (
            <div className="li-suggest" role="group" aria-label={words.recent}>
              <ul className="dock-chips">
                {matches.map((i) => {
                  const sub = itemSub(i);
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        className="dock-chip"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          reset();
                          void actions.toggleItem(list.id, i.id);
                        }}
                        aria-label={`Put back “${i.name}”${sub ? `, ${sub}` : ''}`}
                      >
                        <Icon name="plus" size={14} />
                        <span>{i.name}</span>
                        {sub && <span className="dock-chip-sub">{sub}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </form>
    </li>
  );
}

/**
 * Dragging a row by its grip: the row follows the finger, the others make room,
 * and on release the item is dropped between its new neighbours.
 */
export function useDragOrder(ids: string[], listEl: RefObject<HTMLUListElement | null>, onDrop: (id: string, afterId: string | null, beforeId: string | null) => void) {
  const [drag, setDrag] = useState<{ id: string; startY: number; y: number; slots: Array<{ id: string; top: number; mid: number }>; order: string[] } | null>(null);
  // The latest drag, read by the pointer handlers between renders.
  const dragRef = useRef<typeof drag>(null);

  const start = (id: string, y: number) => {
    const el = listEl.current;
    if (!el) return;
    const slots = ids.map((rid) => {
      const r = el.querySelector<HTMLElement>(`[data-id="${rid}"]`)?.getBoundingClientRect();
      return { id: rid, top: r?.top ?? 0, mid: r ? r.top + r.height / 2 : 0 };
    });
    const d = { id, startY: y, y, slots, order: ids };
    dragRef.current = d;
    setDrag(d);
  };
  const moveTo = (y: number) => {
    const d = dragRef.current;
    if (!d) return;
    const next = (() => {
      const from = d.slots.findIndex((s) => s.id === d.id);
      const centre = d.slots[from]!.mid + (y - d.startY);
      const others = d.slots.filter((s) => s.id !== d.id);
      let at = others.findIndex((s) => s.mid > centre);
      if (at < 0) at = others.length;
      const order = [...others.slice(0, at).map((s) => s.id), d.id, ...others.slice(at).map((s) => s.id)];
      return { ...d, y, order };
    })();
    dragRef.current = next;
    setDrag(next);
  };
  const end = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const at = d.order.indexOf(d.id);
    if (d.order.join() === ids.join()) return;
    onDrop(d.id, d.order[at - 1] ?? null, d.order[at + 1] ?? null);
  };
  const offset = (id: string) => {
    if (!drag || drag.id !== id) return 0;
    const from = drag.slots.findIndex((s) => s.id === id);
    const to = drag.order.indexOf(id);
    return drag.y - drag.startY - ((drag.slots[to]?.top ?? 0) - (drag.slots[from]?.top ?? 0));
  };
  return { order: drag?.order ?? ids, draggingId: drag?.id ?? null, start, moveTo, end, offset };
}

/**
 * A ticked item is saved at once but lingers in the list for a moment, struck through,
 * so a second tap can take it back before it moves to Done.
 */
export function useLinger() {
  const [lingering, setLingering] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((h) => window.clearTimeout(h));
  }, []);
  const drop = (id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) window.clearTimeout(t);
    timers.current.delete(id);
    setLingering((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };
  const add = (id: string) => {
    drop(id);
    setLingering((s) => new Set(s).add(id));
    timers.current.set(id, window.setTimeout(() => drop(id), TICK_MS));
  };
  return { lingering, add, drop };
}
