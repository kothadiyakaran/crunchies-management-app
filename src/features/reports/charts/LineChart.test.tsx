import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LineChart } from './LineChart';

describe('LineChart', () => {
  it('renders "No data" when all points are null', () => {
    render(
      <LineChart
        points={[
          { x: '2026-05-04', y: null },
          { x: '2026-05-11', y: null },
        ]}
      />,
    );
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('renders an svg when at least one point is non-null', () => {
    const { container } = render(
      <LineChart
        points={[
          { x: '2026-05-04', y: 80 },
          { x: '2026-05-11', y: 90 },
        ]}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
