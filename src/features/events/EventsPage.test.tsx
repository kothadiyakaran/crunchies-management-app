import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./api', () => ({
  listEvents: vi.fn(),
}));

import * as api from './api';
import { EventsPage } from './EventsPage';

const sampleEvent = {
  id: 'e1',
  name: 'Diwali 2026',
  kind: 'festival' as const,
  starts_on: '2026-11-06',
  ends_on: '2026-11-08',
  lead_weeks: 3,
  slug: null,
  active: true,
  pickup_window_start: null,
  pickup_window_end: null,
  venue_line: null,
  created_at: '2026-05-22T00:00:00Z',
  product_demand_count: 4,
};

describe('EventsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to Upcoming filter and calls listEvents("upcoming")', async () => {
    vi.mocked(api.listEvents).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.listEvents).toHaveBeenCalledWith('upcoming'));
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('renders empty-state copy for All when no events exist', async () => {
    vi.mocked(api.listEvents).mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/events?filter=all']}>
        <EventsPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText(/No events yet/i));
  });

  it('renders event row with name and product count', async () => {
    vi.mocked(api.listEvents).mockResolvedValue([sampleEvent]);
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Diwali 2026'));
    expect(screen.getByText(/4 products set/i)).toBeInTheDocument();
  });
});
