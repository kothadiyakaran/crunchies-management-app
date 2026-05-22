import { supabase } from '@/lib/supabase';

const LAST_SEEN_KEY = 'orders:lastSeenAt';

export function getLastSeenAt(): string {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) ?? '1970-01-01T00:00:00Z';
  } catch {
    return '1970-01-01T00:00:00Z';
  }
}

export function markOrdersSeen(): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export async function fetchUnseenExhibitionOrderCount(): Promise<number> {
  const lastSeenAt = getLastSeenAt();
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'exhibition_form')
    .gt('created_at', lastSeenAt);
  if (error) return 0;
  return count ?? 0;
}
