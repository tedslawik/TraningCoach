import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div>
          <div className="footer-brand">TriCoach</div>
          <p className="footer-tagline">Profesjonalne plany treningowe dla triathlonistów amatorów. Zbudowany z pasji do sportu i danych.</p>
        </div>
        <div className="footer-links">
          <Link to="/tri-coach">Tri Coach</Link>
          <Link to="/run-coach">Run Coach</Link>
          <Link to="/swim-coach">Swim Coach</Link>
          <Link to="/bike-coach">Bike Coach</Link>
          <Link to="/#analyzer">Analizator</Link>
        </div>
      </div>
      <div className="footer-copy">
        <span>© 2026 TriCoach — Zbudowany z Claude</span>
        <span>Dla triathlonistów amatorów</span>
      </div>
    </footer>
  );
}
