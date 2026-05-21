import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the current local date as a YYYY-MM-DD string for the given IANA
 * timezone (defaults to Asia/Kolkata for mom). Use this instead of
 * `new Date().toISOString().slice(0,10)`, which gives UTC date and is wrong
 * for IST between 00:00 and 05:30.
 */
export function todayInTz(timeZone = 'Asia/Kolkata'): string {
  // en-CA gives ISO-8601 YYYY-MM-DD formatting.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
