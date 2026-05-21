import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { TodayPage } from '@/features/today/TodayPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { ProductionPage } from '@/features/production/ProductionPage';
import { ReportsPage } from '@/features/reports/ReportsPage';

function Protected({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/today"
          element={
            <Protected>
              <TodayPage />
            </Protected>
          }
        />
        <Route
          path="/orders"
          element={
            <Protected>
              <OrdersPage />
            </Protected>
          }
        />
        <Route
          path="/customers"
          element={
            <Protected>
              <CustomersPage />
            </Protected>
          }
        />
        <Route
          path="/production"
          element={
            <Protected>
              <ProductionPage />
            </Protected>
          }
        />
        <Route
          path="/reports"
          element={
            <Protected>
              <ReportsPage />
            </Protected>
          }
        />
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </AuthProvider>
  );
}
