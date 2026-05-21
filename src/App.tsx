import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { TodayPage } from '@/features/today/TodayPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { AddOrderPage } from '@/features/orders/AddOrderPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { ProductionPage } from '@/features/production/ProductionPage';
import { LogProductionPage } from '@/features/production/LogProductionPage';
import { EditLogProductionPage } from '@/features/production/EditLogProductionPage';
import { PlanWeekPage } from '@/features/production/PlanWeekPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { AddProductPage } from '@/features/products/AddProductPage';
import { EditProductPage } from '@/features/products/EditProductPage';

function Protected() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected />}>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<AddOrderPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/production" element={<ProductionPage />} />
          <Route path="/production/new" element={<LogProductionPage />} />
          <Route path="/production/plan-this-week" element={<PlanWeekPage />} />
          <Route path="/production/log/:id" element={<EditLogProductionPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/new" element={<AddProductPage />} />
          <Route path="/products/:id" element={<EditProductPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </AuthProvider>
  );
}
