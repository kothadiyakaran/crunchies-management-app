import { describe, it, expect } from 'vitest';
import {
  slugify,
  bumpSlug,
  nextYearName,
  defaultLeadWeeks,
  eventWindowState,
  weeksUntil,
} from './eventLogic';

describe('slugify', () => {
  it('basic name + year', () => {
    expect(slugify('Diwali Fair Aundh', 2026)).toBe('diwali-fair-aundh-2026');
  });
  it('strips punctuation and collapses spaces', () => {
    expect(slugify("Archana's Diwali Mela!", 2026)).toBe('archanas-diwali-mela-2026');
  });
  it('trims and collapses hyphens', () => {
    expect(slugify('  --Diwali--Fair--  ', 2027)).toBe('diwali-fair-2027');
  });
});

describe('bumpSlug', () => {
  it('appends numeric suffix', () => {
    expect(bumpSlug('diwali-2026', 2)).toBe('diwali-2026-2');
    expect(bumpSlug('diwali-2026', 7)).toBe('diwali-2026-7');
  });
});

describe('nextYearName', () => {
  it('bumps detected 4-digit year', () => {
    expect(nextYearName('Diwali 2026')).toBe('Diwali 2027');
    expect(nextYearName('2026 Diwali Fair')).toBe('2027 Diwali Fair');
  });
  it('falls back to suffix when no year found', () => {
    expect(nextYearName('Aundh Fair')).toBe('Aundh Fair (next year)');
  });
});

describe('defaultLeadWeeks', () => {
  it('festival -> 3', () => expect(defaultLeadWeeks('festival')).toBe(3));
  it('exhibition -> 1', () => expect(defaultLeadWeeks('exhibition')).toBe(1));
  it('other -> 2', () => expect(defaultLeadWeeks('other')).toBe(2));
});

describe('eventWindowState', () => {
  it('past', () =>
    expect(eventWindowState('2026-05-01', '2026-05-03', '2026-05-22')).toBe('past'));
  it('in_progress', () =>
    expect(eventWindowState('2026-05-20', '2026-05-25', '2026-05-22')).toBe('in_progress'));
  it('upcoming', () =>
    expect(eventWindowState('2026-06-01', '2026-06-03', '2026-05-22')).toBe('upcoming'));
  it('boundary: starts_on == today is in_progress', () =>
    expect(eventWindowState('2026-05-22', '2026-05-25', '2026-05-22')).toBe('in_progress'));
});

describe('weeksUntil', () => {
  it('upcoming 14 days -> 2', () => expect(weeksUntil('2026-06-05', '2026-05-22')).toBe(2));
  it('past', () => expect(weeksUntil('2026-05-01', '2026-05-22')).toBeLessThan(0));
});
