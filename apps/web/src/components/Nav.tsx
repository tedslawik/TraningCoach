import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Nav() {
  const { user, signOut } = useAuth();

  return (
    <nav>
      <Link to="/" className="nav-logo">TriCoach</Link>
      <ul className="nav-links">
        <li><NavLink to="/tri-coach">Tri Coach</NavLink></li>
        <li><NavLink to="/run-coach">Run Coach</NavLink></li>
        <li><NavLink to="/swim-coach">Swim Coach</NavLink></li>
        <li><NavLink to="/bike-coach">Bike Coach</NavLink></li>
        {user && <li><NavLink to="/dashboard">Dashboard</NavLink></li>}
      {user && <li><NavLink to="/plan">Plan</NavLink></li>}
      {user && <li><NavLink to="/run-zones">Strefy</NavLink></li>}
      {user && <li><NavLink to="/athlete">Zawodnik</NavLink></li>}
      {user && <li><NavLink to="/settings" title="Ustawienia">⚙️</NavLink></li>}
      </ul>
      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
    </nav>
  );
}
