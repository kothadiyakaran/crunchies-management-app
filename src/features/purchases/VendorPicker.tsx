import { useEffect, useState } from 'react';
import { searchVendors } from './api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

export type VendorSelection = { id: string | null; name: string };

type Props = {
  selected: VendorSelection | null;
  onSelect: (v: VendorSelection | null) => void;
};

export function VendorPicker({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) {
      setResults([]);
      return;
    }
    if (debounced.trim().length === 0) {
      setResults([]);
      return;
    }
    searchVendors(debounced)
      .then(setResults)
      .catch((e: Error) => setError(e.message));
  }, [debounced, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-card border border-ink-900/10 bg-paper-elevated p-3">
        <p className="text-body font-semibold text-ink-900">{selected.name}</p>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-body-sm text-ink-500 underline"
        >
          Change
        </button>
      </div>
    );
  }

  const typed = query.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === typed.toLowerCase());

  return (
    <div>
      <label htmlFor="vendor-search" className="sr-only">Vendor name</label>
      <input
        id="vendor-search"
        className="h-11 input-shell"
        placeholder="Search shop or maker"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="mt-1 text-body-sm text-status-danger-fg">{error}</p>}

      {(results.length > 0 || (typed.length > 0 && !exactMatch)) && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-card border border-ink-900/10 bg-paper-elevated">
          {results.map((r) => (
            <li key={r.id} className="border-b border-ink-900/10 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect({ id: r.id, name: r.name })}
                className="block w-full p-3 text-left"
              >
                <span className="text-body text-ink-900">{r.name}</span>
              </button>
            </li>
          ))}
          {typed.length > 0 && !exactMatch && (
            <li className="border-b border-ink-900/10 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect({ id: null, name: typed })}
                className="block w-full p-3 text-left text-body-sm text-brand-orange"
              >
                Use "{typed}" as new vendor
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
