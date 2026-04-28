import { Link } from 'react-router-dom';
import SectionLabel from '../components/SectionLabel';
import Analyzer from '../components/analyzer/Analyzer';

const coaches = [
  { to: '/tri-coach',  accent: 'tri',  icon: '🏅', title: 'Tri Coach',  link: 'tri',
    desc: 'Kompleksowy plan triathlonowy — periodyzacja, proporcje dyscyplin, brick treningi i strategia wyścigu dla Sprint, Olympic, Half i Full Ironman.' },
  { to: '/run-coach',  accent: 'run',  icon: '🏃', title: 'Run Coach',  link: 'run',
    desc: 'Strefy tętna, typy biegów i adaptacja do biegania po rowerze. Finiszuj mocno nawet gdy nogi mają za sobą 180 km w siodle.' },
  { to: '/swim-coach', accent: 'swim', icon: '🏊', title: 'Swim Coach', link: 'swim',
    desc: 'Dryle techniczne, plany dystansów i adaptacja do wód otwartych. Wyjedź z wody wypoczęty, z przewagą nad resztą peletonu.' },
  { to: '/bike-coach', accent: 'bike', icon: '🚴', title: 'Bike Coach', link: 'bike',
    desc: 'FTP, strefy mocy i strategia energetyczna. Rower to 45–55% czasu Half Ironmana — tu wygrywasz lub tracisz wyścig.' },
] as const;

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="hero" id="hero">
        <p className="hero-eyebrow">Profesjonalny coaching sportowy</p>
        <h1>Trenuj mądrzej.<br /><em className="tri">Dotrzyj na metę.</em></h1>
        <p className="hero-sub">
          Spersonalizowane plany treningowe, analiza wydajności i wskazówki ekspertów
          dla triathlonistów i sportowców amatorów na każdym poziomie.
        </p>
        <div className="hero-actions">
          <Link to="/#analyzer" className="btn-primary">Zacznij analizę →</Link>
          <Link to="/#coaches" className="btn-secondary">Poznaj ofertę</Link>
        </div>
        <div className="hero-badges">
          {[['--tri','Triathlon'],['--swim','Pływanie'],['--bike','Kolarstwo'],['--run','Bieganie']].map(([color, label]) => (
            <div key={label} className="hero-badge">
              <div className="dot" style={{ background: `var(${color})` }} />
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* COACH CARDS */}
      <section id="coaches" className="alt">
        <div className="section-inner">
          <div className="section-header center">
            <h2>Wybierz swojego coacha</h2>
            <p>Każda dyscyplina ma dedykowaną stronę z poradami, planami i wskazówkami dostosowanymi do jej specyfiki.</p>
          </div>
          <div className="coaches-grid">
            {coaches.map(c => (
              <Link key={c.to} className="coach-card" to={c.to}>
                <div className={`coach-card-accent accent-${c.accent}`} />
                <span className="coach-card-icon">{c.icon}</span>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
                <span className={`coach-card-link ${c.link}`}>Poznaj {c.title} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ANALYZER */}
      <section id="analyzer">
        <div className="section-inner narrow">
          <div className="analyzer-header">
            <SectionLabel discipline="tri">Analizator treningowy</SectionLabel>
            <h2>Wprowadź swoje treningi</h2>
            <p>Uzupełnij dane z ostatnich 7 dni, a TriCoach wygeneruje analizę i plan na następny tydzień.</p>
          </div>
          <Analyzer />
        </div>
      </section>
    </>
  );
}
