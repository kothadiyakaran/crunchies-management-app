import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

// Mock the tab bodies so this test stays focused on tab routing and avoids
// pulling in supabase via WeekTab's api imports.
vi.mock('./WeekTab', () => ({
  WeekTab: () => <div>Week tab content</div>,
}));
vi.mock('./MonthTab', () => ({
  MonthTab: () => <div>Month tab placeholder</div>,
}));
vi.mock('./TrendsTab', () => ({
  TrendsTab: () => <div>Trends tab placeholder</div>,
}));

import { ReportsPage } from './ReportsPage';

describe('ReportsPage', () => {
  it('defaults to Week tab when no ?tab param', () => {
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <ReportsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Week tab content/i)).toBeInTheDocument();
  });

  it('renders Month tab when ?tab=month', () => {
    render(
      <MemoryRouter initialEntries={['/reports?tab=month']}>
        <ReportsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Month tab placeholder/i)).toBeInTheDocument();
  });

  it('switches tab on click', () => {
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <ReportsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }));
    expect(screen.getByText(/Trends tab placeholder/i)).toBeInTheDocument();
  });
});
