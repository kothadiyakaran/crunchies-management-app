import { NavLink } from 'react-router-dom';
import { Home, ShoppingBag, Users, Factory, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';

const TABS = [
  { to: '/today', label: 'Today', Icon: Home },
  { to: '/orders', label: 'Orders', Icon: ShoppingBag },
  { to: '/customers', label: 'Customers', Icon: Users },
  { to: '/production', label: 'Production', Icon: Factory },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
] as const;

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-ink-900/10 bg-paper-elevated"
      aria-label="Primary"
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'flex h-14 flex-col items-center justify-center gap-1 text-label uppercase',
              isActive ? 'text-brand-orange' : 'text-ink-500',
            )
          }
        >
          <Icon size={20} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
