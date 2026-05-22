export function cleanPhone(raw: string): string {
  let p = raw.replace(/[^0-9]/g, '');
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  return p;
}

export function isValidIndianMobile(raw: string): boolean {
  const p = cleanPhone(raw);
  return p.length === 10 && /^[6-9]/.test(p);
}
