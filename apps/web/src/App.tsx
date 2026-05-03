import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthModal from './components/auth/AuthModal';
import Nav from './components/Nav';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import TriCoachPage from './pages/TriCoachPage';
import RunCoachPage from './pages/RunCoachPage';
import SwimCoachPage from './pages/SwimCoachPage';
import BikeCoachPage from './pages/BikeCoachPage';
import AthletePage from './pages/AthletePage';
import DashboardPage from './pages/DashboardPage';
import PlannerPage from './pages/PlannerPage';
import RunZonesPage from './pages/RunZonesPage';
import AnalyzerPage from './pages/AnalyzerPage';

function ScrollHandler() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '');
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 80);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [pathname, hash]);
  return null;
}

function AppShell() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Ładowanie…</div>
      </div>
    );
  }

  return (
    <>
      {!session && <AuthModal />}
      <Nav />
      <Routes>
        <Route path="/"            element={<HomePage />} />
        <Route path="/tri-coach"   element={<TriCoachPage />} />
        <Route path="/run-coach"   element={<RunCoachPage />} />
        <Route path="/swim-coach"  element={<SwimCoachPage />} />
        <Route path="/bike-coach"  element={<BikeCoachPage />} />
        <Route path="/athlete"     element={<AthletePage />} />
        <Route path="/dashboard"   element={<DashboardPage />} />
        <Route path="/plan"        element={<PlannerPage />} />
        <Route path="/run-zones"   element={<RunZonesPage />} />
        <Route path="/analyzer"    element={<AnalyzerPage />} />
      </Routes>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollHandler />
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
