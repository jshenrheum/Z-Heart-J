import { useMemo, useState } from 'react';
import { useStore } from '../data/store.tsx';
import { buildIndex, search, type SearchResult } from '../lib/search.ts';
import { useFeedback } from '../lib/feedback.tsx';
import { Link, navigate } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { directionsHref, telHref } from '../lib/summary.ts';
import { useForms } from './Forms.tsx';
import { Icon } from './Icon.tsx';
import { EmptyState } from './ui.tsx';

export function useSearch(query: string, limit = 25) {
  const { state, me, today } = useStore();
  const index = useMemo(() => buildIndex(state, today), [state, today]);
  const pinned = useMemo(() => new Set(state.pins[me].map((p) => `${p.kind}:${p.id}`)), [state.pins, me]);
  return useMemo(() => {
    const out = search(index, query, { me, pinned, limit: 200 });
    return { ...out, total: out.results.length, results: out.results.slice(0, limit) };
  }, [index, query, me, pinned, limit]);
}

export function SearchField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="search-field">
      <Icon name="search" size={22} className="search-icon" />
      <input
        className="search-input"
        type="search"
        role="searchbox"
        aria-label="Search"
        placeholder="Find a number or address…"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={80}
      />
    </div>
  );
}

export function SearchResults({ query, limit, showAll }: { query: string; limit: number; showAll?: boolean }) {
  const out = useSearch(query, limit);
  const forms = useForms();
  const q = query.trim();
  if (!q) return null;

  if (out.results.length === 0) {
    return (
      <EmptyState
        title="Nothing saved matches that."
        body="Search only looks at what you’ve saved — it won’t guess an answer."
        action={
          <button type="button" className="btn btn-primary" onClick={() => forms.open({ kind: 'info', title: q })}>
            <Icon name="plus" size={18} /> Add information
          </button>
        }
      />
    );
  }

  return (
    <div aria-live="polite">
      {out.scope && <p className="scope">Showing {out.scope}</p>}
      <ul className="result-list">
        {out.results.map((r) => (
          <ResultRow key={r.doc.id} r={r} />
        ))}
      </ul>
      {showAll && out.total > out.results.length && (
        <button type="button" className="btn btn-quiet" onClick={() => navigate(routes.search, { state: { q } })}>
          See all {out.total} results
        </button>
      )}
    </div>
  );
}

function ResultRow({ r }: { r: SearchResult }) {
  const { copy } = useFeedback();
  const d = r.doc;
  const copyWhat = d.kind === 'contact' ? 'Phone' : d.kind === 'event' ? 'Address' : d.title;
  return (
    <li className="result">
      <Link to={d.route} className="result-main">
        <span className="result-title">{d.title}</span>
        <span className="result-context">{d.context}</span>
      </Link>
      {d.protectedNote && (
        <p className="result-value protected">
          <Icon name="lock" size={16} /> Protected — open the card to manage it
        </p>
      )}
      {d.value && (
        <div className="result-value">
          <span className={`value ${d.fieldKind === 'phone' || d.fieldKind === 'fax' || d.fieldKind === 'identifier' ? 'tnum' : ''}`}>{d.value}</span>
          <span className="value-actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copy(copyWhat, d.value!)} aria-label={`Copy ${copyWhat.toLowerCase()}`}>
              <Icon name="copy" size={17} /> Copy
            </button>
            {d.fieldKind === 'phone' && (
              <a className="btn btn-quiet btn-sm" href={telHref(d.value)} aria-label={`Call ${d.title.toLowerCase()}`}>
                <Icon name="phone" size={17} /> Call
              </a>
            )}
            {d.fieldKind === 'address' && (
              <a className="btn btn-quiet btn-sm" href={directionsHref(d.value)} target="_blank" rel="noopener noreferrer" aria-label="Directions">
                <Icon name="map" size={17} /> Directions
              </a>
            )}
          </span>
        </div>
      )}
    </li>
  );
}

/** Search box with inline results, used on Home. The query lives in memory only. */
export function InlineSearch() {
  const [q, setQ] = useState('');
  return (
    <div className="search-block">
      <SearchField value={q} onChange={setQ} />
      <SearchResults query={q} limit={6} showAll />
    </div>
  );
}
