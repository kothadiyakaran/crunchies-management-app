import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listCustomers = vi.fn();
const listProducts = vi.fn();
const createOrder = vi.fn();

vi.mock('@/features/customers/api', () => ({ listActiveCustomers: () => listCustomers() }));
vi.mock('@/features/products/api', () => ({ listActiveProducts: () => listProducts() }));
vi.mock('@/features/orders/api', () => ({ createOrder: (i: unknown) => createOrder(i) }));

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
  createOrder.mockResolvedValue('order-new');
});

describe('AddOrderPage', () => {
  it('submits createOrder with the selected fields and navigates to /orders', async () => {
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
      expect(createOrder).toHaveBeenCalledWith({ customer_id: 'c-1', product_id: 'p-1', qty: 3 }),
    );
    expect(await screen.findByText('OrdersList')).toBeInTheDocument();
  });

  it('disables Save until customer + product + positive qty are present', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: /Chivda/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
