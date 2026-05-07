import { Link } from 'react-router-dom';
import { usePreferences } from '../context/PreferencesContext';

export default function Footer() {
  const { isEnabled } = usePreferences();

  return (
    <footer>
      <div className="footer-inner">
        <div>
          <div className="footer-brand">TriCoach</div>
          <p className="footer-tagline">Profesjonalne plany treningowe dla triathlonistów amatorów. Zbudowany z pasji do sportu i danych.</p>
        </div>
        <div className="footer-links">
          {isEnabled('tab_tri')  && <Link to="/tri-coach">Tri Coach</Link>}
          {isEnabled('tab_run')  && <Link to="/run-coach">Run Coach</Link>}
          {isEnabled('tab_swim') && <Link to="/swim-coach">Swim Coach</Link>}
          {isEnabled('tab_bike') && <Link to="/bike-coach">Bike Coach</Link>}
          <Link to="/analyzer">Analizator</Link>
        </div>
      </div>
      <div className="footer-copy">
        <span>© 2026 TriCoach — Zbudowany z Claude</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85em', opacity: 0.6 }}>#{__COMMIT_HASH__}</span>
      </div>
    </footer>
  );
}
