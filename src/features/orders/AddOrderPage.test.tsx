import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOrderWithItems = vi.fn();
const listActiveProducts = vi.fn();
const searchCustomersByName = vi.fn();
const listChannels = vi.fn();
const createCustomerQuick = vi.fn();

vi.mock('@/features/orders/api', () => ({
  createOrderWithItems: (i: unknown) => createOrderWithItems(i),
}));
vi.mock('@/features/products/api', () => ({
  listActiveProducts: () => listActiveProducts(),
}));
vi.mock('@/features/customers/api', () => ({
  searchCustomersByName: (q: string) => searchCustomersByName(q),
  listChannels: () => listChannels(),
  createCustomerQuick: (i: unknown) => createCustomerQuick(i),
}));
vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-05-20' }));

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
  createOrderWithItems.mockReset();
  listActiveProducts.mockReset();
  searchCustomersByName.mockReset();
  listChannels.mockReset();
  createCustomerQuick.mockReset();
  createOrderWithItems.mockResolvedValue('new-order-id');
  listActiveProducts.mockResolvedValue([
    { id: 'p1', name: 'Chivda', unit: '250g', default_price: 100 },
    { id: 'p2', name: 'Laddu', unit: 'box', default_price: 200 },
  ]);
  searchCustomersByName.mockResolvedValue([
    { id: 'c1', name: 'Sunita Patil', phone: '+91...', channel_id: 'ch1' },
  ]);
  listChannels.mockResolvedValue([{ id: 'ch1', name: 'Personal' }]);
});

describe('AddOrderPage', () => {
  it('full flow: pick customer, add item, save, navigate', async () => {
    const user = userEvent.setup();
    renderPage();

    const search = await screen.findByPlaceholderText('Search customer name');
    await user.type(search, 'Sunita');
    const customerRow = await screen.findByRole('button', { name: /Sunita Patil/ });
    await user.click(customerRow);

    const productSelect = await screen.findByRole('combobox');
    await user.selectOptions(productSelect, 'p1');

    const qty = screen.getByLabelText('qty-0');
    await user.type(qty, '2');

    expect(screen.getByLabelText('price-0')).toHaveValue(100);

    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(createOrderWithItems).toHaveBeenCalledTimes(1));
    expect(createOrderWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 'c1',
        source: 'whatsapp',
        target_fulfilment_date: '2026-05-20',
        payment_status: 'unpaid',
        items: [{ product_id: 'p1', qty: 2, unit_price: 100 }],
      }),
    );
    expect(await screen.findByText('OrdersList')).toBeInTheDocument();
  });

  it('save button is disabled until customer + valid item', async () => {
    renderPage();
    const save = await screen.findByRole('button', { name: /^Save$/ });
    expect(save).toBeDisabled();
  });
});
