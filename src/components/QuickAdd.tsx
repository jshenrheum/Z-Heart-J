import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../data/store.tsx';
import { historyState } from '../lib/router.tsx';
import { Icon } from './Icon.tsx';

/**
 * Type one item, press Enter (or Add), and the field stays ready for the next.
 * A duplicate gets a gentle hint — pressing Add again adds it anyway.
 */
export function QuickAdd({ listId, listTitle, grabFocus }: { listId: string; listTitle: string; grabFocus?: boolean }) {
  const { state, actions } = useStore();
  const [text, setText] = useState('');
  const [dupKey, setDupKey] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (grabFocus && historyState<{ focusAdd?: boolean }>()?.focusAdd) input.current?.focus();
  }, [grabFocus]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name) {
      input.current?.focus();
      return;
    }
    const list = state.lists.find((l) => l.id === listId);
    const key = name.toLowerCase();
    if (list?.items.some((i) => !i.checked && i.name.toLowerCase() === key) && dupKey !== key) {
      setDupKey(key);
      return;
    }
    setDupKey(null);
    setText('');
    input.current?.focus();
    void actions.addItem(listId, name);
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <label className="sr-only" htmlFor={`qa-${listId}`}>
        Add an item to {listTitle}
      </label>
      <input
        ref={input}
        id={`qa-${listId}`}
        className="input"
        placeholder="Add an item…"
        value={text}
        maxLength={100}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => {
          setText(e.target.value);
          setDupKey(null);
        }}
      />
      <button type="submit" className="btn btn-primary">
        <Icon name="plus" size={18} /> Add
      </button>
      {dupKey && (
        <p className="hint dup-hint" role="status">
          “{text.trim()}” is already on the list. Press Add again to add it anyway.
        </p>
      )}
    </form>
  );
}
