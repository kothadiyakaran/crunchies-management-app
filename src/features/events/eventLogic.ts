export function slugify(name: string, year: number): string {
  // "Diwali Fair Aundh" + 2026 -> "diwali-fair-aundh-2026"
  // Lowercase, strips diacritics, replaces non-[a-z0-9] runs with single "-",
  // trims leading/trailing hyphens, appends "-${year}"
  const cleaned = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/['‘’]/g, '') // elide apostrophes (ASCII + curly) — they are joiners, not separators
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${cleaned}-${year}`;
}

export function bumpSlug(base: string, attempt: number): string {
  return `${base}-${attempt}`;
}

export function nextYearName(name: string): string {
  // Bump first 4-digit year found, else append " (next year)"
  const m = name.match(/(?<!\d)(\d{4})(?!\d)/);
  if (!m || !m[1]) return `${name} (next year)`;
  const yr = parseInt(m[1], 10);
  return name.replace(m[1], String(yr + 1));
}

export function defaultLeadWeeks(kind: 'festival' | 'exhibition' | 'other'): number {
  if (kind === 'festival') return 3;
  if (kind === 'exhibition') return 1;
  return 2;
}

export type EventWindowState = 'upcoming' | 'in_progress' | 'past';

export function eventWindowState(
  starts_on: string,
  ends_on: string,
  today: string,
): EventWindowState {
  // All args YYYY-MM-DD; string compare suffices.
  if (today < starts_on) return 'upcoming';
  if (today > ends_on) return 'past';
  return 'in_progress';
}

export function weeksUntil(starts_on: string, today: string): number {
  // Day-floor math; negative for past, 0 for in-progress (or near-immediate future)
  const a = new Date(`${starts_on}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.floor((a - b) / (7 * 24 * 60 * 60 * 1000));
}
