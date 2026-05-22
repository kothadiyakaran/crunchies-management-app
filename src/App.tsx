import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';

// Route-level code-splitting (T9.6). Each page becomes its own chunk so the
// initial bundle stays small; the largest dep — jspdf — only loads when the
// user opens an order detail and taps "Generate bill". Login stays eager so
// the auth gate renders instantly without a Suspense flash.
const TodayPage = lazy(() => import('@/features/today/TodayPage').then((m) => ({ default: m.TodayPage })));
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const AddOrderPage = lazy(() => import('@/features/orders/AddOrderPage').then((m) => ({ default: m.AddOrderPage })));
const BatchEntryPage = lazy(() => import('@/features/orders/BatchEntryPage').then((m) => ({ default: m.BatchEntryPage })));
const OrderDetailPage = lazy(() => import('@/features/orders/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const EditOrderPage = lazy(() => import('@/features/orders/EditOrderPage').then((m) => ({ default: m.EditOrderPage })));
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const AddCustomerPage = lazy(() => import('@/features/customers/AddCustomerPage').then((m) => ({ default: m.AddCustomerPage })));
const CustomerDetailPage = lazy(() => import('@/features/customers/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })));
const EditCustomerPage = lazy(() => import('@/features/customers/EditCustomerPage').then((m) => ({ default: m.EditCustomerPage })));
const ProductionPage = lazy(() => import('@/features/production/ProductionPage').then((m) => ({ default: m.ProductionPage })));
const LogProductionPage = lazy(() => import('@/features/production/LogProductionPage').then((m) => ({ default: m.LogProductionPage })));
const EditLogProductionPage = lazy(() => import('@/features/production/EditLogProductionPage').then((m) => ({ default: m.EditLogProductionPage })));
const PlanWeekPage = lazy(() => import('@/features/production/PlanWeekPage').then((m) => ({ default: m.PlanWeekPage })));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const AddProductPage = lazy(() => import('@/features/products/AddProductPage').then((m) => ({ default: m.AddProductPage })));
const EditProductPage = lazy(() => import('@/features/products/EditProductPage').then((m) => ({ default: m.EditProductPage })));
const EventsPage = lazy(() => import('@/features/events/EventsPage').then((m) => ({ default: m.EventsPage })));
const EventDetailPage = lazy(() => import('@/features/events/EventDetailPage').then((m) => ({ default: m.EventDetailPage })));
const PublicOrderFormPage = lazy(() => import('@/features/public/PublicOrderFormPage').then((m) => ({ default: m.PublicOrderFormPage })));
const OrderConfirmationPage = lazy(() => import('@/features/public/OrderConfirmationPage').then((m) => ({ default: m.OrderConfirmationPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function PageSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center text-ink-500">
      <div>Loading…</div>
    </div>
  );
}

function Protected() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}

function PublicSuspense() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Outlet />
    </Suspense>
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
          <Route path="/orders/batch" element={<BatchEntryPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/orders/:id/edit" element={<EditOrderPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/new" element={<AddCustomerPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/customers/:id/edit" element={<EditCustomerPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<EventDetailPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/production" element={<ProductionPage />} />
          <Route path="/production/new" element={<LogProductionPage />} />
          <Route path="/production/plan-this-week" element={<PlanWeekPage />} />
          <Route path="/production/log/:id" element={<EditLogProductionPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/new" element={<AddProductPage />} />
          <Route path="/products/:id" element={<EditProductPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route element={<PublicSuspense />}>
          <Route path="/order/:slug" element={<PublicOrderFormPage />} />
          <Route path="/order/:slug/confirmed" element={<OrderConfirmationPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </AuthProvider>
  );
}
