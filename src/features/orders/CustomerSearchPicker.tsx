import { useEffect, useState } from 'react';
import { searchCustomersByName } from '@/features/customers/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { AddCustomerInlineModal } from './AddCustomerInlineModal';

type Customer = { id: string; name: string; phone: string | null };

type Props = {
  selected: Customer | null;
  onSelect: (c: Customer) => void;
};

export function CustomerSearchPicker({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  const [results, setResults] = useState<Customer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
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
    searchCustomersByName(debounced)
      .then((rs) => setResults(rs.map((r) => ({ id: r.id, name: r.name, phone: r.phone }))))
      .catch((e: Error) => setError(e.message));
  }, [debounced, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-card border border-ink-900/10 bg-paper-elevated p-3">
        <div>
          <p className="text-body font-semibold text-ink-900">{selected.name}</p>
          {selected.phone && <p className="text-body-sm text-ink-500">{selected.phone}</p>}
        </div>
        <button
          type="button"
          onClick={() => onSelect({ id: '', name: '', phone: null })}
          className="text-body-sm text-ink-500 underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        className="h-11 input-shell"
        placeholder="Search customer name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="mt-1 text-body-sm text-status-danger-fg">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-card border border-ink-900/10 bg-paper-elevated">
          {results.map((r) => (
            <li key={r.id} className="border-b border-ink-900/10 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="block w-full p-3 text-left"
              >
                <span className="text-body text-ink-900">{r.name}</span>
                {r.phone && <span className="ml-2 text-body-sm text-ink-500">{r.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {debounced.trim().length > 0 && results.length === 0 && (
        <p className="mt-2 text-body-sm text-ink-500">
          No match.{' '}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-brand-orange underline"
          >
            + Add as new customer?
          </button>
        </p>
      )}

      {debounced.trim().length === 0 && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-2 text-body-sm text-brand-orange underline"
        >
          + New customer
        </button>
      )}

      {showAdd && (
        <AddCustomerInlineModal
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setShowAdd(false);
            onSelect({ id: c.id, name: c.name, phone: null });
          }}
        />
      )}
    </div>
  );
}
