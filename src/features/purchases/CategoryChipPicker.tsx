import { useEffect, useState } from 'react';
import { createPurchaseCategory, listPurchaseCategories } from './api';

type Category = { id: string; name: string };

type Props = {
  value: string | null;
  onChange: (categoryId: string) => void;
  allowInlineAdd?: boolean; // default true
};

export function CategoryChipPicker({ value, onChange, allowInlineAdd = true }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const cs = await listPurchaseCategories();
      setCategories(cs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function saveNew() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const cat = await createPurchaseCategory(trimmed);
      setCategories((arr) => [...arr, cat]);
      onChange(cat.id);
      setDraft('');
      setAddingNew(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto">
        {categories.map((c) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={`h-9 shrink-0 rounded-pill border px-3 text-body-sm ${
                selected
                  ? 'border-brand-orange bg-brand-orange text-white'
                  : 'border-ink-900/20 bg-paper text-ink-900'
              }`}
            >
              {c.name}
            </button>
          );
        })}
        {allowInlineAdd && !addingNew && (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="h-9 shrink-0 rounded-pill border border-dashed border-ink-900/30 bg-paper px-3 text-body-sm text-ink-500"
          >
            + Add category…
          </button>
        )}
        {addingNew && (
          <div className="flex shrink-0 items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={20}
              placeholder="Category name"
              aria-label="New category name"
              className="h-9 w-36 rounded-pill border border-ink-900/20 bg-paper px-3 text-body-sm text-ink-900"
            />
            <button
              type="button"
              onClick={saveNew}
              disabled={saving || draft.trim().length === 0}
              className="h-9 rounded-pill bg-brand-orange px-3 text-body-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setAddingNew(false); setDraft(''); setError(null); }}
              className="text-body-sm text-ink-500"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-body-sm text-status-danger-fg">{error}</p>}
    </div>
  );
}
