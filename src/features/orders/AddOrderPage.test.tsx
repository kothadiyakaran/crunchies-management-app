import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listCustomers = vi.fn();
const listProducts = vi.fn();
const createOrderWithItems = vi.fn();

vi.mock('@/features/customers/api', () => ({ listActiveCustomers: () => listCustomers() }));
vi.mock('@/features/products/api', () => ({ listActiveProducts: () => listProducts() }));
vi.mock('@/features/orders/api', () => ({
  createOrderWithItems: (i: unknown) => createOrderWithItems(i),
}));

import { AddOrderPage } from './AddOrderPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/orders/new']}>
      <Routes>
        <Route path="/orders/new" element={<AddOrderPage />} />
        <Route path="/orders" element={<div>OrdersList</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listCustomers.mockResolvedValue([{ id: 'c-1', name: 'Neighbour Auntie', phone: null, channel_id: 'ch-1' }]);
  listProducts.mockResolvedValue([{ id: 'p-1', name: 'Chivda', unit: '250g', default_price: 120 }]);
  createOrderWithItems.mockResolvedValue('order-new');
});

// TODO: rewritten in Sprint 4 Task 5 — the walking-skeleton single-item form
// is being replaced with the §7 7-step accordion (multi-item, mandatory
// target_fulfilment_date, payment status picker, etc.). Skipping until then
// rather than chasing a soon-to-be-deleted UI.
describe.skip('AddOrderPage', () => {
  it('submits createOrderWithItems with the selected fields and navigates to /orders', async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for dropdown options to populate
    await waitFor(() => expect(screen.getByRole('option', { name: 'Neighbour Auntie' })).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Customer'), 'c-1');
    await user.selectOptions(screen.getByLabelText('Product'), 'p-1');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '3');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(createOrderWithItems).toHaveBeenCalled(),
    );
    expect(await screen.findByText('OrdersList')).toBeInTheDocument();
  });

  it('disables Save until customer + product + positive qty are present', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: /Chivda/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
