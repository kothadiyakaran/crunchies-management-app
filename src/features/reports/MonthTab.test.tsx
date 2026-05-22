import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  getCalibrationRowsForWeek: vi.fn(),
  getOrderSummary: vi.fn(),
  getChannelBreakdown: vi.fn(),
  getCustomerBaseHealth: vi.fn(),
  getExhibitionRepeatRate: vi.fn(),
  getTopProducts: vi.fn(),
  getTopCustomers: vi.fn(),
  getComplaintsInRange: vi.fn(),
  getNewCustomersByChannel: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-05-22' }));

import * as api from './api';
import { MonthTab } from './MonthTab';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getCalibrationRowsForWeek).mockResolvedValue([]);
  vi.mocked(api.getOrderSummary).mockResolvedValue({
    total_orders: 0,
    total_value: 0,
    fulfilled_count: 0,
    outstanding_value: 0,
    outstanding_count: 0,
  });
  vi.mocked(api.getChannelBreakdown).mockResolvedValue([]);
  vi.mocked(api.getCustomerBaseHealth).mockResolvedValue({
    new_this_month: 0,
    currently_quiet: 0,
    reactivated_this_month: 0,
  });
  vi.mocked(api.getExhibitionRepeatRate).mockResolvedValue({
    total_acquired: 3,
    repeated: 1,
    pct: 33,
    show: false,
  });
  vi.mocked(api.getTopProducts).mockResolvedValue([]);
  vi.mocked(api.getTopCustomers).mockResolvedValue([]);
  vi.mocked(api.getComplaintsInRange).mockResolvedValue([]);
  vi.mocked(api.getNewCustomersByChannel).mockResolvedValue([]);
});

describe('MonthTab', () => {
  it('defaults to current month (2026-05 given today=2026-05-22)', async () => {
    render(
      <MemoryRouter>
        <MonthTab />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(api.getOrderSummary).toHaveBeenCalledWith('2026-05-01', '2026-06-01'),
    );
  });

  it('hides exhibition repeat rate when show=false', async () => {
    const { container } = render(
      <MemoryRouter>
        <MonthTab />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.getExhibitionRepeatRate).toHaveBeenCalled());
    expect(container.textContent).not.toContain('placed a second order');
  });
});
