import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BusinessInfo } from './api';

const updateSettings = vi.fn();
const refresh = vi.fn();

vi.mock('./api', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));

const useSettingsMock = vi.fn();
vi.mock('./SettingsContext', () => ({
  useSettings: () => useSettingsMock(),
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'archana@example.com' }, signOut: vi.fn() }),
}));

import { SettingsPage } from './SettingsPage';

const FIXTURE: BusinessInfo = {
  name: 'Crunchies by Archana',
  tagline: 'Homemade traditional snacks',
  addressLines: ['Aundh, Pune 411007'],
  gstLine: null,
  phone: null,
  whatsapp: null,
  email: null,
  billFooter: 'Thank you',
  signatureLine: '— Archana',
};

beforeEach(() => {
  updateSettings.mockReset();
  refresh.mockReset();
  useSettingsMock.mockReset();
  useSettingsMock.mockReturnValue({
    settings: FIXTURE,
    refresh,
    loading: false,
    error: null,
  });
  updateSettings.mockResolvedValue(FIXTURE);
});

describe('SettingsPage', () => {
  it('renders fields populated from useSettings()', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByDisplayValue('Crunchies by Archana')).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue('Homemade traditional snacks')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Aundh, Pune 411007')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Thank you')).toBeInTheDocument();
    expect(screen.getByDisplayValue('— Archana')).toBeInTheDocument();
  });

  it('blocks save when business name is empty', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByDisplayValue('Crunchies by Archana')).toBeInTheDocument(),
    );

    const nameInput = screen.getByDisplayValue('Crunchies by Archana');
    await user.clear(nameInput);

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
    await user.click(saveBtn);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('blocks save when phone is filled but invalid', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByDisplayValue('Crunchies by Archana')).toBeInTheDocument(),
    );

    const phoneInput = screen.getByLabelText(/^phone/i);
    await user.type(phoneInput, '12345'); // not a valid Indian mobile (too short)

    expect(screen.getByText(/10-digit Indian mobile/i)).toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('saves with the expected camelCase patch (multi-line address split + filter blanks)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByDisplayValue('Crunchies by Archana')).toBeInTheDocument(),
    );

    // Replace the address textarea with a multi-line value including a blank row.
    const addressInput = screen.getByDisplayValue('Aundh, Pune 411007');
    await user.clear(addressInput);
    await user.type(addressInput, 'Line 1{enter}Line 2{enter}{enter}');

    // Fill a valid phone and a valid whatsapp + email.
    const phoneInput = screen.getByLabelText(/^phone/i);
    await user.type(phoneInput, '9876543210');

    const whatsappInput = screen.getByLabelText(/^whatsapp/i);
    await user.type(whatsappInput, '+91 9876543210');

    const emailInput = screen.getByLabelText(/^email/i);
    await user.type(emailInput, 'archana@example.com');

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(updateSettings).toHaveBeenCalledWith({
      name: 'Crunchies by Archana',
      tagline: 'Homemade traditional snacks',
      addressLines: ['Line 1', 'Line 2'],
      gstLine: null,
      phone: '9876543210',
      whatsapp: '9876543210',
      email: 'archana@example.com',
      billFooter: 'Thank you',
      signatureLine: '— Archana',
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saved/i));
  });
});
