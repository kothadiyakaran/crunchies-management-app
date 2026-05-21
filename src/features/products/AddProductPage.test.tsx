import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createProduct = vi.fn();
const setSeedDemand = vi.fn();

vi.mock('@/features/products/api', () => ({
  createProduct: (i: unknown) => createProduct(i),
  setSeedDemand: (id: string, qty: number) => setSeedDemand(id, qty),
}));

import { AddProductPage } from './AddProductPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/products/new']}>
      <Routes>
        <Route path="/products/new" element={<AddProductPage />} />
        <Route path="/products" element={<div>ProductsList</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  createProduct.mockReset();
  setSeedDemand.mockReset();
  createProduct.mockResolvedValue('p-new');
  setSeedDemand.mockResolvedValue(undefined);
});

describe('AddProductPage', () => {
  it('submits product + seed_demand and returns to /products', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Name'), 'Chivda');
    await user.type(screen.getByLabelText('Unit'), '250g pack');
    await user.clear(screen.getByLabelText(/default price/i));
    await user.type(screen.getByLabelText(/default price/i), '120');
    await user.clear(screen.getByLabelText(/weekly average/i));
    await user.type(screen.getByLabelText(/weekly average/i), '5');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chivda', unit: '250g pack', default_price: 120, is_aggregated: false }),
    );
    expect(setSeedDemand).toHaveBeenCalledWith('p-new', 5);
    expect(await screen.findByText('ProductsList')).toBeInTheDocument();
  });

  it('does not call setSeedDemand when seed field is empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Name'), 'Test');
    await user.type(screen.getByLabelText('Unit'), 'unit');
    await user.clear(screen.getByLabelText(/default price/i));
    await user.type(screen.getByLabelText(/default price/i), '10');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(setSeedDemand).not.toHaveBeenCalled();
  });
});
