import { Link } from 'react-router-dom';
import { usePreferences } from '../context/PreferencesContext';

export default function Footer() {
  const { isEnabled } = usePreferences();

  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-brand">
          TriCoach
          <span className="footer-tagline">Plany treningowe dla triathlonistów amatorów</span>
        </div>
        <nav className="footer-links" aria-label="Stopka">
          {isEnabled('tab_tri')  && <Link to="/tri-coach">Tri Coach</Link>}
          {isEnabled('tab_run')  && <Link to="/run-coach">Run Coach</Link>}
          {isEnabled('tab_swim') && <Link to="/swim-coach">Swim Coach</Link>}
          {isEnabled('tab_bike') && <Link to="/bike-coach">Bike Coach</Link>}
          <Link to="/calculators">Kalkulatory</Link>
        </nav>
        <div className="footer-copy">
          <span>© 2026 TriCoach — Zbudowany z Claude</span>
          <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>#{__COMMIT_HASH__}</span>
        </div>
      </div>
    </footer>
  );
}
