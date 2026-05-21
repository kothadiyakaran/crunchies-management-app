import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getProductionThisWeek = vi.fn();
const getProductionPlansForWeek = vi.fn();
const upsertProductionPlan = vi.fn();

vi.mock('@/features/production/api', () => ({
  getProductionThisWeek: () => getProductionThisWeek(),
  getProductionPlansForWeek: (w: string) => getProductionPlansForWeek(w),
  upsertProductionPlan: (pid: string, w: string, q: number) => upsertProductionPlan(pid, w, q),
}));

vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-05-21' }));
vi.mock('@/lib/week', () => ({ weekStartFor: () => '2026-05-18' }));

import { PlanWeekPage } from './PlanWeekPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/production/plan-this-week']}>
      <Routes>
        <Route path="/production/plan-this-week" element={<PlanWeekPage />} />
        <Route path="/production" element={<div>ProductionScreen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getProductionThisWeek.mockReset();
  getProductionPlansForWeek.mockReset();
  upsertProductionPlan.mockReset();
  getProductionThisWeek.mockResolvedValue([
    {
      product_id: 'p1', name: 'Chivda', unit: '250g', is_seasonal: false,
      rolling_avg: 0, seed_qty: 5, weeks_of_history: 0, committed_qty: 0,
      produced_qty: 0, base: 5, suggested: 5, uses_seed: true, needs_seed: false,
    },
    {
      product_id: 'p2', name: 'Laddu', unit: 'box', is_seasonal: false,
      rolling_avg: 0, seed_qty: 3, weeks_of_history: 0, committed_qty: 0,
      produced_qty: 0, base: 3, suggested: 3, uses_seed: true, needs_seed: false,
    },
  ]);
  getProductionPlansForWeek.mockResolvedValue({});
  upsertProductionPlan.mockResolvedValue(undefined);
});

describe('PlanWeekPage', () => {
  it('pre-fills from suggestion, edits per-product, saves all, navigates back', async () => {
    const user = userEvent.setup();
    renderPage();

    const chivdaInput = await screen.findByLabelText(/Chivda/);
    const laddoInput = screen.getByLabelText(/Laddu/);

    expect(chivdaInput).toHaveValue(5);
    expect(laddoInput).toHaveValue(3);

    await user.clear(chivdaInput);
    await user.type(chivdaInput, '4');

    await user.click(screen.getByRole('button', { name: /save plan/i }));

    await waitFor(() => expect(upsertProductionPlan).toHaveBeenCalledTimes(2));
    expect(upsertProductionPlan).toHaveBeenCalledWith('p1', '2026-05-18', 4);
    expect(upsertProductionPlan).toHaveBeenCalledWith('p2', '2026-05-18', 3);

    expect(await screen.findByText('ProductionScreen')).toBeInTheDocument();
  });

  it('pre-fills from existing plan when present', async () => {
    getProductionPlansForWeek.mockResolvedValue({
      p1: { planned_qty: 7, original_planned_qty: 5, entered_at: '2026-05-18T03:00:00Z' },
    });
    renderPage();
    const chivdaInput = await screen.findByLabelText(/Chivda/);
    expect(chivdaInput).toHaveValue(7);
  });
});
