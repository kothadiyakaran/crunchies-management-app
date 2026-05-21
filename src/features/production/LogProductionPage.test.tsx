import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listProducts = vi.fn();
const createLog = vi.fn();

vi.mock('@/features/products/api',   () => ({ listActiveProducts: () => listProducts() }));
vi.mock('@/features/production/api', () => ({ createProductionLog: (i: unknown) => createLog(i) }));

import { LogProductionPage } from './LogProductionPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/production/new']}>
      <Routes>
        <Route path="/production/new" element={<LogProductionPage />} />
        <Route path="/production" element={<div>ProductionList</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listProducts.mockResolvedValue([{ id: 'p-1', name: 'Chivda', unit: '250g', default_price: 120 }]);
  createLog.mockResolvedValue('log-1');
});

describe('LogProductionPage', () => {
  it('submits createProductionLog and returns to /production', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: /Chivda/ })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Product'), 'p-1');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '15');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(createLog).toHaveBeenCalledWith({ product_id: 'p-1', qty: 15 }),
    );
    expect(await screen.findByText('ProductionList')).toBeInTheDocument();
  });
});
