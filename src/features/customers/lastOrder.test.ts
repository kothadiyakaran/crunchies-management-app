import { describe, it, expect } from 'vitest';
import { lastOrderLabel } from './lastOrder';

describe('lastOrderLabel', () => {
  it('today', () => expect(lastOrderLabel('2026-06-01', '2026-06-01')).toEqual({ text: 'today', stale: false }));
  it('yesterday', () => expect(lastOrderLabel('2026-05-31', '2026-06-01')).toEqual({ text: 'yesterday', stale: false }));
  it('N days', () => expect(lastOrderLabel('2026-05-29', '2026-06-01')).toEqual({ text: '3d ago', stale: false }));
  it('months + stale', () => expect(lastOrderLabel('2026-04-01', '2026-06-01')).toEqual({ text: '2mo ago', stale: true }));
  it('never', () => expect(lastOrderLabel(null, '2026-06-01')).toEqual({ text: 'never', stale: true }));
  it('day 30 boundary not stale', () => expect(lastOrderLabel('2026-05-02', '2026-06-01')).toEqual({ text: '1mo ago', stale: false }));
  it('day 31 stale', () => expect(lastOrderLabel('2026-05-01', '2026-06-01')).toEqual({ text: '1mo ago', stale: true }));
});
