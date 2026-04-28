import { NavLink, Link } from 'react-router-dom';

export default function Nav() {
  return (
    <nav>
      <Link to="/" className="nav-logo">TriCoach</Link>
      <ul className="nav-links">
        <li><NavLink to="/tri-coach">Tri Coach</NavLink></li>
        <li><NavLink to="/run-coach">Run Coach</NavLink></li>
        <li><NavLink to="/swim-coach">Swim Coach</NavLink></li>
        <li><NavLink to="/bike-coach">Bike Coach</NavLink></li>
      </ul>
      <Link to="/#analyzer" className="nav-cta">Analizuj trening</Link>
    </nav>
  );
}
