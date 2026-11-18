import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderState } from './pushClient';

const getReminderState = vi.fn<() => Promise<ReminderState>>();
const enableReminders = vi.fn<() => Promise<ReminderState>>();
const disableReminders = vi.fn<() => Promise<void>>();

vi.mock('./pushClient', () => ({
  getReminderState: () => getReminderState(),
  enableReminders: () => enableReminders(),
  disableReminders: () => disableReminders(),
}));

import { RemindersCard } from './RemindersCard';
import { RemindersNudge } from './RemindersNudge';

beforeEach(() => {
  getReminderState.mockReset();
  enableReminders.mockReset();
  disableReminders.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});

describe('RemindersCard', () => {
  it('turns reminders on from the off state', async () => {
    getReminderState.mockResolvedValue('off');
    enableReminders.mockResolvedValue('on');
    render(<RemindersCard headingClassName="" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on reminders' }));
    expect(enableReminders).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Turn off reminders' })).toBeInTheDocument();
  });

  it('explains how to unblock when notifications are blocked', async () => {
    getReminderState.mockResolvedValue('blocked');
    render(<RemindersCard headingClassName="" />);
    expect(await screen.findByText(/App info → Notifications/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when the browser cannot show reminders', async () => {
    getReminderState.mockResolvedValue('unsupported');
    render(<RemindersCard headingClassName="" />);
    expect(await screen.findByText(/can’t show reminders/)).toBeInTheDocument();
  });

  it('shows the error when turning on fails', async () => {
    getReminderState.mockResolvedValue('off');
    enableReminders.mockRejectedValue(new Error('network down'));
    render(<RemindersCard headingClassName="" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on reminders' }));
    expect(await screen.findByText(/network down/)).toBeInTheDocument();
  });
});

describe('RemindersNudge', () => {
  it('appears only while reminders are off and stays dismissed', async () => {
    getReminderState.mockResolvedValue('off');
    const { unmount } = render(<RemindersNudge />);
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Get order reminders')).not.toBeInTheDocument();
    unmount();
    render(<RemindersNudge />);
    await waitFor(() => expect(getReminderState).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Get order reminders')).not.toBeInTheDocument();
  });

  it('hides once reminders are on', async () => {
    getReminderState.mockResolvedValue('on');
    render(<RemindersNudge />);
    await waitFor(() => expect(getReminderState).toHaveBeenCalled());
    expect(screen.queryByText('Get order reminders')).not.toBeInTheDocument();
  });
});
