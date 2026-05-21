import type { OrderListItem } from './api';

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function ymdInKolkata(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata' }).format(d);
}

function diffDaysYmd(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

export function formatDayHeader(date: string, today: string): string {
  const diff = diffDaysYmd(date, today);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return `${weekday} ${day} ${month}`;
}

export function formatOrderTimestamp(iso: string, today: string): string {
  const orderDate = ymdInKolkata(iso);
  if (orderDate !== today) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

export type OrderDayGroup = {
  date: string;
  orders: OrderListItem[];
};

export function groupOrdersByDay(orders: OrderListItem[]): OrderDayGroup[] {
  const byDate = new Map<string, OrderListItem[]>();
  for (const o of orders) {
    const date = ymdInKolkata(o.ordered_at);
    const bucket = byDate.get(date);
    if (bucket) bucket.push(o);
    else byDate.set(date, [o]);
  }
  return Array.from(byDate.entries())
    .map(([date, ords]) => ({ date, orders: ords }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
