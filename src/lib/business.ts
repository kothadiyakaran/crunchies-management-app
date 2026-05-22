// Business identity used on the bill PDF. Sprint 9 will replace these reads with
// a Settings table lookup; until then this file is the single source of truth.
// Mom-provided values are pending — defaults are placeholders Karan will edit
// in this file before showing mom her first generated bill.

export type BusinessInfo = {
  name: string;
  tagline: string | null;
  addressLines: string[]; // each rendered as its own line under the name
  gstLine: string | null; // e.g. "GSTIN: 27ABCDE1234F1Z5" — null hides the line
  phone: string | null;
  whatsapp: string | null; // 10-digit IN number, no +91; null hides the line
  email: string | null;
  billFooter: string; // small line below signature, e.g. "Thank you"
  signatureLine: string; // shown above the rule, e.g. "— Archana"
};

export const BUSINESS_INFO: BusinessInfo = {
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
