import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { RealtimeProvider } from './context/RealtimeContext';
import { usePermissions } from './hooks/usePermissions';
import RoleGuard from './components/RoleGuard';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
// Every page except the landing page and sign-in loads on demand, so the first
// visit downloads a fraction of the app (charts and maps arrive with their pages).
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
import Landing from './pages/public/Landing';
const About = lazy(() => import('./pages/public/About'));
const Contact = lazy(() => import('./pages/public/Contact'));
const Partners = lazy(() => import('./pages/public/Partners'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Herd = lazy(() => import('./pages/Herd'));
const CowDetail = lazy(() => import('./pages/CowDetail'));
const Milk = lazy(() => import('./pages/Milk'));
const Feed = lazy(() => import('./pages/Feed'));
const Environment = lazy(() => import('./pages/Environment'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const Predictions = lazy(() => import('./pages/Predictions'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminReports = lazy(() => import('./pages/AdminReports'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Reproduction = lazy(() => import('./pages/Reproduction'));
const HerdAnalytics = lazy(() => import('./pages/HerdAnalytics'));
const CowEconomics = lazy(() => import('./pages/CowEconomics'));
const FeedInventory = lazy(() => import('./pages/FeedInventory'));
const Groups = lazy(() => import('./pages/Groups'));
const Tanks = lazy(() => import('./pages/Tanks'));
const WeeklyPlan = lazy(() => import('./pages/WeeklyPlan'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const IoTControl = lazy(() => import('./pages/IoTControl'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const SmsConfig = lazy(() => import('./pages/SmsConfig'));
const Milking = lazy(() => import('./pages/Milking'));
const Barn = lazy(() => import('./pages/Barn'));
const CowHealth = lazy(() => import('./pages/CowHealth'));

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
            <Suspense fallback={<div className="spinner" />}>
            <Routes>
              {/* All authenticated roles */}
              <Route index                  element={<Dashboard />} />
              <Route path="herd"            element={<Herd />} />
              <Route path="herd/:id"        element={<CowDetail />} />
              <Route path="milk"            element={<Milk />} />
              <Route path="milking"         element={<Milking />} />
              <Route path="barn"            element={<Barn />} />
              <Route path="cow-health"      element={<CowHealth />} />
              <Route path="feed"            element={<Feed />} />
              <Route path="environment"     element={<Environment />} />
              <Route path="alerts"          element={<AlertsPage />} />
              <Route path="settings"        element={<Settings />} />
              <Route path="weekly-plan"     element={<WeeklyPlan />} />
              <Route path="feedback"        element={<FeedbackPage />} />

              {/* Farmer + Admin */}
              <Route path="groups"          element={<RoleGuard allowed={p.canViewGroups} redirect="/app"><Groups /></RoleGuard>} />
              <Route path="feed-inventory"  element={<RoleGuard allowed={p.canViewFeedInventory} redirect="/app"><FeedInventory /></RoleGuard>} />

              {/* Farmer + Vet + Admin (NOT Technician) */}
              <Route path="herd-analytics"  element={<RoleGuard allowed={p.canViewHerdAnalytics} redirect="/app"><HerdAnalytics /></RoleGuard>} />
              <Route path="cow-economics"   element={<RoleGuard allowed={p.canViewCowEconomics} redirect="/app"><CowEconomics /></RoleGuard>} />

              {/* Vet + Admin */}
              <Route path="reproduction"    element={<RoleGuard allowed={p.canViewReproduction} redirect="/app"><Reproduction /></RoleGuard>} />

              {/* Admin + Technician */}
              <Route path="tanks"           element={<RoleGuard allowed={p.canViewTanks} redirect="/app"><Tanks /></RoleGuard>} />
              <Route path="iot-control"     element={<RoleGuard allowed={p.canViewIotControl} redirect="/app"><IoTControl /></RoleGuard>} />

              {/* Admin only */}
              <Route path="sms-config"      element={<RoleGuard allowed={p.isAdmin} redirect="/app"><SmsConfig /></RoleGuard>} />

              {/* All roles */}
              <Route path="help"            element={<HelpPage />} />

              {/* Redirect old /economics to the new cow-economics page */}
              <Route path="economics" element={<Navigate to="/app/cow-economics" replace />} />

              {/* Predictions: Admin, Vet only (NOT Farmer, NOT Technician) */}
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
            </Suspense>
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
          <Suspense fallback={<div className="spinner" style={{ marginTop: 120 }} />}>
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
          </Suspense>
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
