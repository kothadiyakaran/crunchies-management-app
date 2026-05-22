import { describe, it, expect } from 'vitest';
import { cleanPhone, isValidIndianMobile } from './phoneValidation';

describe('cleanPhone', () => {
  it('strips +91 prefix', () => expect(cleanPhone('+91 98765 43210')).toBe('9876543210'));
  it('strips dashes and spaces', () => expect(cleanPhone('98765-43210')).toBe('9876543210'));
  it('keeps 10-digit as-is', () => expect(cleanPhone('9876543210')).toBe('9876543210'));
});

describe('isValidIndianMobile', () => {
  it('valid 9876543210 → true', () => expect(isValidIndianMobile('9876543210')).toBe(true));
  it('starts with 5 → false', () => expect(isValidIndianMobile('5876543210')).toBe(false));
  it('9 digits → false', () => expect(isValidIndianMobile('987654321')).toBe(false));
});
