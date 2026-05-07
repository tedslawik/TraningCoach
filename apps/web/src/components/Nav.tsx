import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';

export default function Nav() {
  const { user, signOut } = useAuth();
  const { isEnabled } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <>
      <nav>
        <Link to="/" className="nav-logo" onClick={close}>TriCoach</Link>
        <ul className="nav-links">
          {isEnabled('tab_tri')  && <li><NavLink to="/tri-coach">Tri Coach</NavLink></li>}
          {isEnabled('tab_run')  && <li><NavLink to="/run-coach">Run Coach</NavLink></li>}
          {isEnabled('tab_swim') && <li><NavLink to="/swim-coach">Swim Coach</NavLink></li>}
          {isEnabled('tab_bike') && <li><NavLink to="/bike-coach">Bike Coach</NavLink></li>}
          {user && <li><NavLink to="/dashboard">Dashboard</NavLink></li>}
          {user && <li><NavLink to="/plan">Plan</NavLink></li>}
          {user && <li><NavLink to="/athlete">Zawodnik</NavLink></li>}
          {user && <li><NavLink to="/settings" title="Ustawienia">⚙️</NavLink></li>}
        </ul>
        {user ? (
          <div className="nav-user" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user.email}</span>
            <button
              onClick={signOut}
              style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-md)', padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              Wyloguj
            </button>
          </div>
        ) : (
          <Link to="/analyzer" className="nav-cta">Analizuj trening</Link>
        )}
        <button
          className="nav-burger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {menuOpen && (
        <div className="nav-mobile-menu">
          <ul>
            {isEnabled('tab_tri')  && <li><NavLink to="/tri-coach"  onClick={close}>Tri Coach</NavLink></li>}
            {isEnabled('tab_run')  && <li><NavLink to="/run-coach"  onClick={close}>Run Coach</NavLink></li>}
            {isEnabled('tab_swim') && <li><NavLink to="/swim-coach" onClick={close}>Swim Coach</NavLink></li>}
            {isEnabled('tab_bike') && <li><NavLink to="/bike-coach" onClick={close}>Bike Coach</NavLink></li>}
            {user && <li><NavLink to="/dashboard" onClick={close}>Dashboard</NavLink></li>}
            {user && <li><NavLink to="/plan"      onClick={close}>Plan</NavLink></li>}
            {user && <li><NavLink to="/athlete"   onClick={close}>Zawodnik</NavLink></li>}
            {user && <li><NavLink to="/settings"  onClick={close}>Ustawienia</NavLink></li>}
            {!user && <li><NavLink to="/analyzer" onClick={close}>Analizator</NavLink></li>}
          </ul>
          {user ? (
            <div className="nav-mobile-footer">
              <span className="nav-mobile-footer-email">{user.email}</span>
              <button className="nav-mobile-footer-signout" onClick={() => { signOut(); close(); }}>
                Wyloguj
              </button>
            </div>
          ) : (
            <Link
              to="/analyzer"
              className="btn-primary"
              onClick={close}
              style={{ display: 'block', textAlign: 'center' }}
            >
              Analizuj trening →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
