const shortDateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

export function formatShortDate(ymd: string): string {
  if (!ymd) return '';
  return shortDateFmt.format(new Date(`${ymd}T12:00:00Z`));
}
