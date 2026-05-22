import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listChannels = vi.fn();
const createCustomerFull = vi.fn();
const findCustomerByPhone = vi.fn();
const getCustomerDetail = vi.fn();
const updateCustomer = vi.fn();
const createChannel = vi.fn();
const listInProgressExhibitions = vi.fn();

vi.mock('./api', () => ({
  listChannels: () => listChannels(),
  createCustomerFull: (i: unknown) => createCustomerFull(i),
  findCustomerByPhone: (p: string) => findCustomerByPhone(p),
  getCustomerDetail: (id: string) => getCustomerDetail(id),
  updateCustomer: (id: string, patch: unknown) => updateCustomer(id, patch),
  createChannel: (n: string) => createChannel(n),
}));

vi.mock('@/features/events/api', () => ({
  listInProgressExhibitions: () => listInProgressExhibitions(),
}));

import { AddCustomerPage } from './AddCustomerPage';

const PERSONAL = { id: 'ch-personal', name: 'Personal' };
const EXHIBITION = { id: 'ch-exhibition', name: 'Exhibition' };
const EVENT_A = {
  id: 'ev-a',
  name: 'Aundh Fair 2026',
  kind: 'exhibition' as const,
  starts_on: '2026-05-20',
  ends_on: '2026-05-25',
  lead_weeks: 1,
  slug: 'aundh-fair-2026',
  active: true,
  pickup_window_start: null,
  pickup_window_end: null,
  venue_line: null,
  created_at: '2026-05-01T00:00:00Z',
};

beforeEach(() => {
  listChannels.mockReset();
  createCustomerFull.mockReset();
  findCustomerByPhone.mockReset();
  getCustomerDetail.mockReset();
  updateCustomer.mockReset();
  createChannel.mockReset();
  listInProgressExhibitions.mockReset();

  listChannels.mockResolvedValue([PERSONAL, EXHIBITION]);
  listInProgressExhibitions.mockResolvedValue([EVENT_A]);
  findCustomerByPhone.mockResolvedValue(null);
  createCustomerFull.mockResolvedValue('new-customer-id');
});

describe('AddCustomerPage — source event dropdown wiring', () => {
  it('renders the dropdown only when channel = Exhibition AND >=1 in-progress event', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddCustomerPage />
      </MemoryRouter>,
    );
    // Wait for channels to load and chips to render
    await waitFor(() => expect(screen.getByText('Personal')).toBeInTheDocument());

    // Personal default — no dropdown
    await user.click(screen.getByText('Personal'));
    expect(screen.queryByText(/Source event/i)).not.toBeInTheDocument();

    // Switch to Exhibition — dropdown should appear with the loaded event
    await user.click(screen.getByText('Exhibition'));
    await waitFor(() => expect(listInProgressExhibitions).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Source event/i)).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Aundh Fair 2026' })).toBeInTheDocument();
  });

  it('clears sourceEventId when user switches away from Exhibition (no orphan ids on save)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddCustomerPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Exhibition')).toBeInTheDocument());

    // Pick Exhibition, then select the event
    await user.click(screen.getByText('Exhibition'));
    await waitFor(() => expect(screen.getByText(/Source event/i)).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox'), 'ev-a');

    // Switch to Personal — dropdown should disappear, sourceEventId should reset
    await user.click(screen.getByText('Personal'));
    await waitFor(() => expect(screen.queryByText(/Source event/i)).not.toBeInTheDocument());

    // Fill name + phone (Personal requires phone) and save
    await user.type(screen.getByLabelText('Name'), 'Test Customer');
    await user.type(screen.getByLabelText(/Phone/), '9876543210');
    await user.click(screen.getByRole('button', { name: /Save customer/i }));

    await waitFor(() => expect(createCustomerFull).toHaveBeenCalled());
    const call = createCustomerFull.mock.calls[0];
    if (!call) throw new Error('createCustomerFull not called');
    const payload = call[0] as { channel_id: string; source_event_id: string | null };
    expect(payload.channel_id).toBe('ch-personal');
    expect(payload.source_event_id).toBeNull();
  });
});
