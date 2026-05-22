import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PipMarkerBar } from './PipMarkerBar';

describe('PipMarkerBar', () => {
  it('renders dashed plan tick when plan is non-null', () => {
    const { container } = render(<PipMarkerBar plan={5} made={4} demand={6} />);
    const dashed = container.querySelector('line[stroke-dasharray]');
    expect(dashed).not.toBeNull();
  });

  it('omits dashed plan tick when plan is null', () => {
    const { container } = render(<PipMarkerBar plan={null} made={4} demand={6} />);
    const dashed = container.querySelector('line[stroke-dasharray]');
    expect(dashed).toBeNull();
  });
});
