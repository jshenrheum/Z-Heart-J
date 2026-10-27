import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SharedList } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { itemSub, listWords, recentMatches } from '../lib/lists.ts';
import { Icon } from './Icon.tsx';

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The "I need…" field docked at the foot of a list, in the thumb zone. Typing
 * shows matching recently used items to put back with one tap; Enter or + adds
 * what was typed (a recently used item of the same name comes back instead of a
 * second copy). The field keeps focus, so the keyboard stays up for the next one.
 */
export function NeedDock({ list }: { list: SharedList }) {
  const { actions } = useStore();
  const [text, setText] = useState('');
  const [dupKey, setDupKey] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => recentMatches(list, text), [list, text]);
  const words = listWords(list.title);

  // Toasts rise above the dock while it is on screen.
  useEffect(() => {
    document.documentElement.classList.add('has-dock');
    return () => document.documentElement.classList.remove('has-dock');
  }, []);

  // With the keyboard up, sit just above it (iOS and Android shrink only the visual viewport).
  useEffect(() => {
    const vv = window.visualViewport;
    const el = dock.current;
    if (!vv || !el) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        el.style.setProperty('--kb', `${kb}px`);
        el.classList.toggle('is-raised', kb > 60);
      });
    };
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
    place();
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', place);
      vv.removeEventListener('scroll', place);
    };
  }, []);

  const reset = () => {
    setText('');
    setDupKey(null);
    input.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name) {
      input.current?.focus();
      return;
    }
    const key = norm(name);
    if (list.items.some((i) => !i.checked && norm(i.name) === key) && dupKey !== key) {
      setDupKey(key);
      return;
    }
    reset();
    void actions.addItem(list.id, name);
  };

  // Keeps the field focused (and the keyboard up) when a button is pressed.
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <div className="dock" ref={dock}>
      <div className="dock-inner">
        {matches.length > 0 && (
          <div className="dock-suggest" role="group" aria-label={words.recent}>
            <p className="dock-suggest-label">{words.recent}</p>
            <ul className="dock-chips">
              {matches.map((i) => {
                const sub = itemSub(i);
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      className="dock-chip"
                      onMouseDown={keepFocus}
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
        {dupKey && (
          <p className="dock-hint" role="status">
            “{text.trim()}” is already on the list. Press + again to add it anyway.
          </p>
        )}
        <form className="dock-form" onSubmit={submit}>
          <label className="sr-only" htmlFor={`need-${list.id}`}>
            Add an item to {list.title}
          </label>
          <input
            ref={input}
            id={`need-${list.id}`}
            className="dock-input"
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
          <button type="submit" className="dock-add" onMouseDown={keepFocus} aria-label={`Add to ${list.title}`}>
            <Icon name="plus" size={22} />
          </button>
        </form>
      </div>
    </div>
  );
}
