import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ReportsPage } from './ReportsPage';

describe('ReportsPage', () => {
  it('defaults to Week tab when no ?tab param', () => {
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <ReportsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Week tab placeholder/i)).toBeInTheDocument();
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
