import { describe, it, expect } from 'vitest';
import { weekStartFor } from './week';

describe('weekStartFor', () => {
  it('returns Monday for a mid-week date (Wed)', () => {
    expect(weekStartFor('2026-05-20')).toBe('2026-05-18'); // Wed → Mon
  });
  it('returns the same date if it is already Monday', () => {
    expect(weekStartFor('2026-05-18')).toBe('2026-05-18');
  });
  it('returns the previous Monday for a Sunday', () => {
    expect(weekStartFor('2026-05-24')).toBe('2026-05-18'); // Sun → previous Mon
  });
  it('returns Monday for a Saturday', () => {
    expect(weekStartFor('2026-05-23')).toBe('2026-05-18');
  });
});
