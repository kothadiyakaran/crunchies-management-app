import { render, screen } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { AddCustomerInlineModal } from './AddCustomerInlineModal';

vi.mock('@/features/customers/ChannelChipPicker', () => ({
  ChannelChipPicker: () => <div data-testid="channel-picker" />,
}));

test('modal renders outside any host <form> (portaled to body)', () => {
  const { container } = render(
    <form data-testid="host-form">
      <AddCustomerInlineModal onClose={() => {}} onCreated={() => {}} />
    </form>,
  );
  const hostForm = screen.getByTestId('host-form');
  const dialog = screen.getByRole('dialog');
  // Regression guard: a nested <form> is what broke the insert. The dialog
  // (and its own <form>) must be portaled out of the host form.
  expect(hostForm).not.toContainElement(dialog);
  expect(container.querySelector('form[data-testid="host-form"] form')).toBeNull();
});
