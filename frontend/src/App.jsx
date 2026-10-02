import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Shell } from './components/Shell';
import { LandingPage, PricingPage } from './pages/PublicPages';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { TeamsPage } from './pages/TeamsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PublicStatusPage } from './pages/PublicStatusPage';
import { StatusAdminPage } from './pages/StatusAdminPage';

function Protected({ children }) {
  const { token, loading } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (loading) return <p className="px-8 py-10 text-muted">Loading session…</p>;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/status/:slug" element={<PublicStatusPage />} />
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/services" element={<Protected><ServicesPage /></Protected>} />
      <Route path="/services/:id" element={<Protected><ServiceDetailPage /></Protected>} />
      <Route path="/incidents" element={<Protected><IncidentsPage /></Protected>} />
      <Route path="/incidents/:id" element={<Protected><IncidentDetailPage /></Protected>} />
      <Route path="/teams" element={<Protected><TeamsPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="/status-pages" element={<Protected><StatusAdminPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
