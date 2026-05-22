import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  getCalibrationRowsForWeek: vi.fn(),
  getOrderSummary: vi.fn(),
  getNewCustomersByChannel: vi.fn(),
  getTopProducts: vi.fn(),
  getTopCustomers: vi.fn(),
  getComplaintsInRange: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-05-22' }));

import * as api from './api';
import { WeekTab } from './WeekTab';

beforeEach(() => {
  vi.mocked(api.getCalibrationRowsForWeek).mockResolvedValue([]);
  vi.mocked(api.getOrderSummary).mockResolvedValue({
    total_orders: 0,
    total_value: 0,
    fulfilled_count: 0,
    outstanding_value: 0,
    outstanding_count: 0,
  });
  vi.mocked(api.getNewCustomersByChannel).mockResolvedValue([]);
  vi.mocked(api.getTopProducts).mockResolvedValue([]);
  vi.mocked(api.getTopCustomers).mockResolvedValue([]);
  vi.mocked(api.getComplaintsInRange).mockResolvedValue([]);
});

describe('WeekTab', () => {
  it('defaults to last completed week (2026-05-11 given today=2026-05-22)', async () => {
    render(
      <MemoryRouter>
        <WeekTab />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(api.getCalibrationRowsForWeek).toHaveBeenCalledWith('2026-05-11'),
    );
  });

  it('respects ?week= URL override', async () => {
    render(
      <MemoryRouter initialEntries={['/reports?tab=week&week=2026-05-04']}>
        <WeekTab />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(api.getCalibrationRowsForWeek).toHaveBeenCalledWith('2026-05-04'),
    );
  });
});
