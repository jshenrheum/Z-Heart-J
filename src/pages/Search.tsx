import { useState } from 'react';
import { historyState } from '../lib/router.tsx';
import { SearchField, SearchResults } from '../components/Search.tsx';
import { PageHeader } from '../components/ui.tsx';

export function SearchPage() {
  // The text passes through history.state (memory), never the URL, and is never stored.
  const [q, setQ] = useState(() => historyState<{ q?: string }>()?.q ?? '');
  return (
    <div className="page">
      <PageHeader title="Search" sub="Numbers, addresses, contacts, lists, and plans you’ve saved." />
      <SearchField value={q} onChange={setQ} autoFocus />
      <SearchResults query={q} limit={25} />
      {!q.trim() && (
        <p className="hint search-tips">
          Try “my fax”, “Zul fax”, “office address”, “NPI”, “vet”, “filter”, or “groceries”. Protected values are never searched.
        </p>
      )}
    </div>
  );
}
