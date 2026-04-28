import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Nav from './components/Nav';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import TriCoachPage from './pages/TriCoachPage';
import RunCoachPage from './pages/RunCoachPage';
import SwimCoachPage from './pages/SwimCoachPage';
import BikeCoachPage from './pages/BikeCoachPage';

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

export default function App() {
  return (
    <BrowserRouter>
      <ScrollHandler />
      <Nav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tri-coach" element={<TriCoachPage />} />
        <Route path="/run-coach" element={<RunCoachPage />} />
        <Route path="/swim-coach" element={<SwimCoachPage />} />
        <Route path="/bike-coach" element={<BikeCoachPage />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
