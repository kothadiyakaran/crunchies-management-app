import { describe, it, expect } from 'vitest';
import {
  calibrationVariance,
  calibrationVariancePct,
  rowAccuracyPct,
  weeklyAccuracyPct,
  visibleCalibrationRows,
  sortByVarianceDescending,
  type CalibrationRow,
} from './calibration';

function row(
  p: number | null,
  m: number,
  d: number,
  retro = false,
  name = 'P',
  id = 'p',
): CalibrationRow {
  return {
    product_id: id,
    product_name: name,
    unit: 'box',
    plan: p,
    made: m,
    demand: d,
    plan_set_retrospectively: retro,
  };
}

describe('calibrationVariance', () => {
  it('demand - plan when plan != null', () => {
    expect(calibrationVariance({ plan: 5, demand: 6 })).toBe(1);
    expect(calibrationVariance({ plan: 10, demand: 7 })).toBe(-3);
  });
  it('null when plan is null', () => {
    expect(calibrationVariance({ plan: null, demand: 5 })).toBe(null);
  });
  it('zero when demand equals plan', () => {
    expect(calibrationVariance({ plan: 8, demand: 8 })).toBe(0);
  });
});

describe('calibrationVariancePct', () => {
  it('rounds to integer percent', () => {
    expect(calibrationVariancePct({ plan: 5, demand: 6 })).toBe(20);
    expect(calibrationVariancePct({ plan: 10, demand: 8 })).toBe(-20);
  });
  it('null when plan is null', () => {
    expect(calibrationVariancePct({ plan: null, demand: 5 })).toBe(null);
  });
  it('null when plan and demand both zero', () => {
    expect(calibrationVariancePct({ plan: 0, demand: 0 })).toBe(null);
  });
  it('returns 100 when plan is zero but demand is positive', () => {
    expect(calibrationVariancePct({ plan: 0, demand: 4 })).toBe(100);
  });
});

describe('rowAccuracyPct', () => {
  it('plan=5 demand=6 → 83%', () => {
    expect(rowAccuracyPct({ plan: 5, demand: 6 })).toBe(83);
  });
  it('exact match → 100%', () => {
    expect(rowAccuracyPct({ plan: 5, demand: 5 })).toBe(100);
  });
  it('plan=10 demand=0 → 0%', () => {
    expect(rowAccuracyPct({ plan: 10, demand: 0 })).toBe(0);
  });
  it('null when plan is null', () => {
    expect(rowAccuracyPct({ plan: null, demand: 5 })).toBe(null);
  });
  it('null when both plan and demand are zero', () => {
    expect(rowAccuracyPct({ plan: 0, demand: 0 })).toBe(null);
  });
  it('plan=0 demand>0 → 0% (worst case)', () => {
    expect(rowAccuracyPct({ plan: 0, demand: 3 })).toBe(0);
  });
  it('symmetry: |demand-plan| is symmetric', () => {
    // plan=20 demand=10: diff=10, denom=20, acc=50
    expect(rowAccuracyPct({ plan: 20, demand: 10 })).toBe(50);
    // plan=10 demand=20: diff=10, denom=20, acc=50
    expect(rowAccuracyPct({ plan: 10, demand: 20 })).toBe(50);
  });
});

describe('weeklyAccuracyPct', () => {
  it('weights by max(demand, plan)', () => {
    // Row1: plan=5 demand=6 acc=83.33... weight=6
    // Row2: plan=20 demand=10 acc=50 weight=20
    // Weighted: (83.33*6 + 50*20) / 26 = (500 + 1000) / 26 = 57.69 → 58
    expect(weeklyAccuracyPct([row(5, 0, 6), row(20, 0, 10)])).toBe(58);
  });
  it('excludes retrospective rows', () => {
    expect(weeklyAccuracyPct([row(5, 0, 6, true)])).toBe(null);
  });
  it('excludes rows with null plan', () => {
    expect(weeklyAccuracyPct([row(null, 0, 6)])).toBe(null);
  });
  it('returns null when no eligible rows', () => {
    expect(weeklyAccuracyPct([])).toBe(null);
  });
  it('returns 100 when every eligible row matches exactly', () => {
    expect(weeklyAccuracyPct([row(5, 5, 5), row(10, 10, 10)])).toBe(100);
  });
  it('mixes retrospective + eligible: retrospective ignored', () => {
    // Eligible: row(5, _, 5) acc=100 weight=5 → 100%
    // Retro: row(20, _, 10) ignored
    expect(weeklyAccuracyPct([row(5, 0, 5), row(20, 0, 10, true)])).toBe(100);
  });
  it('skips rows where max(demand, plan) === 0 (plan=0 demand=0)', () => {
    // Only the second row contributes
    expect(weeklyAccuracyPct([row(0, 0, 0), row(5, 5, 5)])).toBe(100);
  });
});

describe('visibleCalibrationRows', () => {
  it('hides empty rows', () => {
    expect(visibleCalibrationRows([row(null, 0, 0), row(5, 0, 6)])).toHaveLength(1);
  });
  it('keeps rows where plan is null but made or demand > 0', () => {
    expect(visibleCalibrationRows([row(null, 3, 0), row(null, 0, 2)])).toHaveLength(2);
  });
  it('keeps rows where plan is set even if made and demand are 0', () => {
    expect(visibleCalibrationRows([row(5, 0, 0)])).toHaveLength(1);
  });
});

describe('sortByVarianceDescending', () => {
  it('biggest miss first; null plan last', () => {
    const rows = [row(5, 0, 6), row(null, 5, 5), row(10, 0, 4)];
    const sorted = sortByVarianceDescending(rows);
    // variances: r1=+1, r2=null, r3=-6 → |6| > |1| → r3 first, then r1, then r2
    expect(sorted[0]).toEqual(rows[2]);
    expect(sorted[1]).toEqual(rows[0]);
    expect(sorted[2]).toEqual(rows[1]);
  });
  it('tiebreaks |variance| equal by product_name', () => {
    const a = row(5, 0, 6, false, 'Almond');
    const b = row(5, 0, 6, false, 'Banana');
    const sorted = sortByVarianceDescending([b, a]);
    expect(sorted[0]).toEqual(a); // Almond before Banana
    expect(sorted[1]).toEqual(b);
  });
  it('does not mutate input', () => {
    const rows = [row(5, 0, 6), row(10, 0, 4)];
    const snapshot = rows.slice();
    sortByVarianceDescending(rows);
    expect(rows).toEqual(snapshot);
  });
});
