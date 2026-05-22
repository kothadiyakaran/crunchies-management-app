import { describe, it, expect } from 'vitest';
import { toBusinessInfo, type BusinessSettings } from './api';

const baseRow: BusinessSettings = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Crunchies by Archana',
  tagline: 'Homemade traditional snacks',
  address_lines: ['Aundh, Pune 411007'],
  gst_line: null,
  phone: null,
  whatsapp: null,
  email: null,
  bill_footer: 'Thank you',
  signature_line: '— Archana',
  updated_at: '2026-05-22T00:00:00Z',
};

describe('toBusinessInfo', () => {
  it('maps every field present (happy path)', () => {
    const row: BusinessSettings = {
      ...baseRow,
      tagline: 'Homemade traditional snacks',
      address_lines: ['Aundh, Pune 411007', 'Maharashtra'],
      gst_line: 'GSTIN: 27ABCDE1234F1Z5',
      phone: '9876543210',
      whatsapp: '9876543210',
      email: 'archana@example.com',
      bill_footer: 'Thank you, come again',
      signature_line: '— Archana K.',
    };
    expect(toBusinessInfo(row)).toEqual({
      name: 'Crunchies by Archana',
      tagline: 'Homemade traditional snacks',
      addressLines: ['Aundh, Pune 411007', 'Maharashtra'],
      gstLine: 'GSTIN: 27ABCDE1234F1Z5',
      phone: '9876543210',
      whatsapp: '9876543210',
      email: 'archana@example.com',
      billFooter: 'Thank you, come again',
      signatureLine: '— Archana K.',
    });
  });

  it('preserves nulls across all nullable fields', () => {
    const row: BusinessSettings = {
      ...baseRow,
      tagline: null,
      gst_line: null,
      phone: null,
      whatsapp: null,
      email: null,
    };
    const out = toBusinessInfo(row);
    expect(out.tagline).toBeNull();
    expect(out.gstLine).toBeNull();
    expect(out.phone).toBeNull();
    expect(out.whatsapp).toBeNull();
    expect(out.email).toBeNull();
  });

  it('maps empty address_lines array → addressLines: []', () => {
    const row: BusinessSettings = { ...baseRow, address_lines: [] };
    expect(toBusinessInfo(row).addressLines).toEqual([]);
  });

  it('preserves non-empty address_lines order', () => {
    const row: BusinessSettings = {
      ...baseRow,
      address_lines: ['Line 1', 'Line 2', 'Line 3'],
    };
    expect(toBusinessInfo(row).addressLines).toEqual(['Line 1', 'Line 2', 'Line 3']);
  });

  it('maps bill_footer and signature_line (snake → camel)', () => {
    const row: BusinessSettings = {
      ...baseRow,
      bill_footer: 'Custom footer text',
      signature_line: '— Custom signer',
    };
    const out = toBusinessInfo(row);
    expect(out.billFooter).toBe('Custom footer text');
    expect(out.signatureLine).toBe('— Custom signer');
  });
});
