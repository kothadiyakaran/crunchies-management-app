import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from './BottomNav';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('renders all 5 tabs', () => {
    renderAt('/today');
    ['Today', 'Orders', 'Customers', 'Production', 'Reports'].forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
  });

  it('marks the active tab with aria-current="page"', () => {
    renderAt('/orders');
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Today' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
