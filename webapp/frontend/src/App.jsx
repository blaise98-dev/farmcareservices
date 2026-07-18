import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { usePermissions } from './hooks/usePermissions';
import RoleGuard from './components/RoleGuard';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Landing from './pages/public/Landing';
import About from './pages/public/About';
import Contact from './pages/public/Contact';
import Partners from './pages/public/Partners';
import Dashboard from './pages/Dashboard';
import Herd from './pages/Herd';
import CowDetail from './pages/CowDetail';
import Milk from './pages/Milk';
import Feed from './pages/Feed';
import Environment from './pages/Environment';
import AlertsPage from './pages/AlertsPage';
import Predictions from './pages/Predictions';
import Settings from './pages/Settings';
import AdminReports from './pages/AdminReports';
import UserManagement from './pages/UserManagement';
import Reproduction from './pages/Reproduction';
import HerdAnalytics from './pages/HerdAnalytics';
import CowEconomics from './pages/CowEconomics';
import FeedInventory from './pages/FeedInventory';
import Groups from './pages/Groups';
import Tanks from './pages/Tanks';
import WeeklyPlan from './pages/WeeklyPlan';
import FeedbackPage from './pages/FeedbackPage';
import IoTControl from './pages/IoTControl';
import HelpPage from './pages/HelpPage';
import SmsConfig from './pages/SmsConfig';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30000,
      retry: 2,
      staleTime: 10000,
    },
  },
});

// ── Protected layout ───────────────────────────────────────────
function AppLayout() {
  const { isAuthenticated } = useAuth();
  const p = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <RealtimeProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div style={{
          flex: 1,
          marginLeft: sidebarOpen ? 'var(--sidebar-w)' : 0,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'margin-left .3s ease',
        }}>
          <Header onMenuClick={() => setSidebarOpen(o => !o)} />

          <main style={{
            flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg)',
          }}>
            <Routes>
              {/* All authenticated roles */}
              <Route index                  element={<Dashboard />} />
              <Route path="herd"            element={<Herd />} />
              <Route path="herd/:id"        element={<CowDetail />} />
              <Route path="milk"            element={<Milk />} />
              <Route path="feed"            element={<Feed />} />
              <Route path="environment"     element={<Environment />} />
              <Route path="alerts"          element={<AlertsPage />} />
              <Route path="settings"        element={<Settings />} />
              <Route path="weekly-plan"     element={<WeeklyPlan />} />
              <Route path="feedback"        element={<FeedbackPage />} />

              {/* Farmer + Admin */}
              <Route path="groups"          element={<RoleGuard allowed={p.canViewHerd} redirect="/app"><Groups /></RoleGuard>} />
              <Route path="feed-inventory"  element={<RoleGuard allowed={p.canViewFeed} redirect="/app"><FeedInventory /></RoleGuard>} />

              {/* All roles with herd access */}
              <Route path="herd-analytics"  element={<RoleGuard allowed={p.canViewHerd} redirect="/app"><HerdAnalytics /></RoleGuard>} />
              <Route path="cow-economics"   element={<RoleGuard allowed={p.canViewHerd} redirect="/app"><CowEconomics /></RoleGuard>} />

              {/* Vet + Admin */}
              <Route path="reproduction"    element={<RoleGuard allowed={p.canViewHerd} redirect="/app"><Reproduction /></RoleGuard>} />

              {/* Admin + Technician */}
              <Route path="tanks"           element={<RoleGuard allowed={p.canViewEnvironment} redirect="/app"><Tanks /></RoleGuard>} />
              <Route path="iot-control"     element={<RoleGuard allowed={p.canViewEnvironment} redirect="/app"><IoTControl /></RoleGuard>} />

              {/* Admin only */}
              <Route path="sms-config"      element={<RoleGuard allowed={p.isAdmin} redirect="/app"><SmsConfig /></RoleGuard>} />

              {/* All roles */}
              <Route path="help"            element={<HelpPage />} />

              {/* Redirect old /economics to the new cow-economics page */}
              <Route path="economics" element={<Navigate to="/app/cow-economics" replace />} />

              {/* Predictions — Admin, Vet only (NOT Farmer, NOT Technician) */}
              <Route path="predictions"
                element={
                  <RoleGuard allowed={p.canViewPredictions} redirect="/app">
                    <Predictions />
                  </RoleGuard>
                }
              />

              {/* Admin-only pages */}
              <Route path="reports"
                element={
                  <RoleGuard allowed={p.canViewReports} redirect="/app">
                    <AdminReports />
                  </RoleGuard>
                }
              />
              <Route path="users"
                element={
                  <RoleGuard allowed={p.canManageUsers} redirect="/app">
                    <UserManagement />
                  </RoleGuard>
                }
              />

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

// ── Root app ───────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Public marketing site */}
            <Route path="/"          element={<Landing />} />
            <Route path="/about"     element={<About />} />
            <Route path="/contact"   element={<Contact />} />
            <Route path="/partners"  element={<Partners />} />

            {/* Public auth pages */}
            <Route path="/login" element={<LoginGuard />} />
            <Route path="/register" element={<RegisterGuard />} />
            <Route path="/forgot-password" element={<PublicAuthGuard><ForgotPassword /></PublicAuthGuard>} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Authenticated product */}
            <Route path="/app/*" element={<AppLayout />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function LoginGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/app" replace /> : <Login />;
}

function RegisterGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/app" replace /> : <Register />;
}

function PublicAuthGuard({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/app" replace /> : children;
}
