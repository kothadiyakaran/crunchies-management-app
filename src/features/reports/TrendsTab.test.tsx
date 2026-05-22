import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  getPerWeekAccuracyLastN: vi.fn(),
  getPerProductTrends: vi.fn(),
  getMonthlyChannelMixLastN: vi.fn(),
  getPastEventRetrospectives: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-05-22' }));

import * as api from './api';
import { TrendsTab } from './TrendsTab';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getPerProductTrends).mockResolvedValue([]);
  vi.mocked(api.getMonthlyChannelMixLastN).mockResolvedValue([]);
  vi.mocked(api.getPastEventRetrospectives).mockResolvedValue([]);
});

describe('TrendsTab', () => {
  it('renders empty-state copy when no weeks have plans', async () => {
    vi.mocked(api.getPerWeekAccuracyLastN).mockResolvedValue([
      { weekStart: '2026-04-06', accuracy: null },
      { weekStart: '2026-04-13', accuracy: null },
      { weekStart: '2026-04-20', accuracy: null },
      { weekStart: '2026-04-27', accuracy: null },
      { weekStart: '2026-05-04', accuracy: null },
      { weekStart: '2026-05-11', accuracy: null },
      { weekStart: '2026-05-18', accuracy: null },
      { weekStart: '2026-05-25', accuracy: null },
    ]);
    render(
      <MemoryRouter>
        <TrendsTab />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText(/Trends become useful/i));
  });

  it('renders the big accuracy number when at least one week has data', async () => {
    vi.mocked(api.getPerWeekAccuracyLastN).mockResolvedValue([
      { weekStart: '2026-04-06', accuracy: 70 },
      { weekStart: '2026-04-13', accuracy: 80 },
      { weekStart: '2026-04-20', accuracy: 90 },
      { weekStart: '2026-04-27', accuracy: null },
      { weekStart: '2026-05-04', accuracy: 85 },
      { weekStart: '2026-05-11', accuracy: 95 },
      { weekStart: '2026-05-18', accuracy: null },
      { weekStart: '2026-05-25', accuracy: null },
    ]);
    render(
      <MemoryRouter>
        <TrendsTab />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText(/Your plans matched demand/i));
  });
});
