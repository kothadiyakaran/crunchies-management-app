import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Users, Factory, ReceiptIndianRupee, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';
import {
  fetchUnseenExhibitionOrderCount,
  markOrdersSeen,
} from '@/features/orders/newOrderBadge';

const TABS = [
  { to: '/today', label: 'Today', Icon: Home },
  { to: '/orders', label: 'Orders', Icon: ShoppingBag },
  { to: '/customers', label: 'Customers', Icon: Users },
  { to: '/production', label: 'Make', Icon: Factory },
  { to: '/purchases', label: 'Buy', Icon: ReceiptIndianRupee },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
] as const;

export function BottomNav() {
  const location = useLocation();
  const [unseen, setUnseen] = useState(0);

  // Refresh count on any nav change
  useEffect(() => {
    fetchUnseenExhibitionOrderCount()
      .then(setUnseen)
      .catch(() => setUnseen(0));
  }, [location.pathname]);

  // Clear when visiting Orders
  useEffect(() => {
    if (location.pathname.startsWith('/orders')) {
      markOrdersSeen();
      setUnseen(0);
    }
  }, [location.pathname]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-6 border-t border-ink-900/10 bg-paper-elevated"
      aria-label="Primary"
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'relative flex h-14 flex-col items-center justify-center gap-1 text-[9px] font-medium uppercase leading-[12px] tracking-[0.06em]',
              isActive ? 'text-brand-orange' : 'text-ink-500',
            )
          }
        >
          <Icon size={20} aria-hidden />
          <span>{label}</span>
          {to === '/orders' && unseen > 0 && (
            <span
              aria-label={`${unseen} new exhibition order${unseen === 1 ? '' : 's'}`}
              className="absolute right-3 top-1 inline-flex h-2 w-2 rounded-full bg-brand-orange"
            />
          )}
        </NavLink>
      ))}
    </nav>
  );
}
