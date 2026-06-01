import { describe, it, expect } from 'vitest';
import { trendChip, leadingZeroRun } from './trend';

describe('trendChip', () => {
  it('up', () => expect(trendChip([10, 11, 12, 14])).toEqual({ dir: 'up', pct: 40 }));
  it('down', () => expect(trendChip([20, 18, 16, 12])).toEqual({ dir: 'down', pct: 40 }));
  it('<4 weeks → dash', () => expect(trendChip([5, 6, 7])).toEqual({ dir: 'none', pct: null }));
  it('zero baseline → dash', () => expect(trendChip([0, 0, 4, 8])).toEqual({ dir: 'none', pct: null }));
  it('flat → none with computed pct', () =>
    expect(trendChip([10, 12, 11, 10])).toEqual({ dir: 'none', pct: 0 }));
});

describe('leadingZeroRun', () => {
  it('counts leading zeros', () => expect(leadingZeroRun([0, 0, 0, 5, 8])).toBe(3));
  it('no leading zeros', () => expect(leadingZeroRun([4, 0, 0, 8])).toBe(0));
  it('all zeros', () => expect(leadingZeroRun([0, 0, 0])).toBe(3));
  it('empty', () => expect(leadingZeroRun([])).toBe(0));
});
