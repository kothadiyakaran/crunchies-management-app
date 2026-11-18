import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { CalendarEvent, CalendarOrder } from './api';

const ORDERS: CalendarOrder[] = [
  {
    id: 'o1',
    ordered_at: '2026-11-20T04:00:00Z',
    target_fulfilment_date: '2026-11-24',
    fulfilled_at: null,
    payment_status: 'unpaid',
    customer_name: 'Sharma Stores',
    items: [
      { product_name: 'Chakli', unit: '250 gm', qty: 2 },
      { product_name: 'Chivda', unit: '200gm', qty: 1 },
    ],
    item_summary: '2 Chakli, 1 Chivda',
  },
  {
    id: 'o2',
    ordered_at: '2026-11-21T04:00:00Z',
    target_fulfilment_date: '2026-11-24',
    fulfilled_at: '2026-11-24',
    payment_status: 'paid',
    customer_name: 'Meena',
    items: [{ product_name: 'Chakli', unit: '250 gm', qty: 1 }],
    item_summary: '1 Chakli',
  },
];
const EVENTS: CalendarEvent[] = [{ id: 'e1', name: 'Diwali Mela', starts_on: '2026-11-23', ends_on: '2026-11-25' }];

vi.mock('./api', () => ({
  listCalendarOrders: vi.fn(async () => ORDERS),
  listCalendarEvents: vi.fn(async () => EVENTS),
}));
vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-11-18' }));

import { CalendarPage } from './CalendarPage';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.search}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/calendar"
          element={
            <>
              <CalendarPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CalendarPage', () => {
  it('opens on the ?date= day with events, totals of pending orders and all orders', async () => {
    renderAt('/calendar?date=2026-11-24');
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tue 24 November' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Sharma Stores')).toBeInTheDocument());
    expect(screen.getByText('Meena')).toBeInTheDocument();
    expect(screen.getByText(/Diwali Mela/)).toBeInTheDocument();
    expect(screen.getByText(/day 2 of 3/)).toBeInTheDocument();
    // To make counts pending orders only: Meena's fulfilled pack is excluded
    const toMake = screen.getByText('To make').nextElementSibling as HTMLElement;
    expect(toMake.textContent).toBe('Chakli 2 × 250 gm · Chivda 1 × 200 gm');
    expect(screen.getByRole('link', { name: /Sharma Stores/ })).toHaveAttribute('href', '/orders/o1');
    expect(screen.getByRole('button', { name: 'Tue 24 November, 1 order due, event' })).toBeInTheDocument();
  });

  it('falls back to today for an impossible date', async () => {
    renderAt('/calendar?date=2026-13-45');
    expect(screen.getByRole('heading', { name: 'Wed 18 November' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Nothing due.')).toBeInTheDocument());
  });

  it('ignores a slow response for a month the user already left', async () => {
    const api = await import('./api');
    const list = vi.mocked(api.listCalendarOrders);
    let releaseNovember: (v: CalendarOrder[]) => void = () => {};
    list.mockImplementationOnce(() => new Promise((r) => (releaseNovember = r)));
    const user = userEvent.setup();
    renderAt('/calendar?date=2026-11-24');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(screen.getByText('Nothing due.')).toBeInTheDocument());
    // The stale November response happens to include a 1 Dec order that the
    // fresh December fetch does not; it must not be applied.
    releaseNovember([{ ...ORDERS[0]!, id: 'late', customer_name: 'Late Co', target_fulfilment_date: '2026-12-01' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('loc').textContent).toBe('?date=2026-12-01');
    expect(screen.queryByText('Late Co')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing due.')).toBeInTheDocument();
  });

  it('defaults to today and shows an empty day', async () => {
    renderAt('/calendar');
    expect(screen.getByRole('heading', { name: 'Wed 18 November' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Nothing due.')).toBeInTheDocument());
  });

  it('moves the selection with arrow keys and keeps it in the URL', async () => {
    const user = userEvent.setup();
    renderAt('/calendar?date=2026-11-24');
    await user.click(screen.getByRole('button', { name: /^Tue 24 November/ }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('heading', { name: 'Tue 1 December' })).toBeInTheDocument();
    expect(screen.getByTestId('loc').textContent).toBe('?date=2026-12-01');
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeInTheDocument();
  });

  it('changes month with the arrows and selects the 1st', async () => {
    const user = userEvent.setup();
    renderAt('/calendar?date=2026-11-24');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByTestId('loc').textContent).toBe('?date=2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByTestId('loc').textContent).toBe('?date=2026-11-18');
  });
});
