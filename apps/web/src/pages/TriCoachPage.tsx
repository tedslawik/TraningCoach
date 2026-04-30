import HeroSm from '../components/HeroSm';
import SectionLabel from '../components/SectionLabel';
import CtaBanner from '../components/CtaBanner';
import NutritionCalculator from '../components/tri/NutritionCalculator';

const distances = [
  { name: 'Sprint',       swim: '0.75 km', bike: '20 km',  run: '5 km',    time: '~1h 15 min',   target: '15% / 45% / 40%' },
  { name: 'Olympic',      swim: '1.5 km',  bike: '40 km',  run: '10 km',   time: '~2h 30 min',   target: '18% / 42% / 40%' },
  { name: 'Half Ironman', swim: '1.9 km',  bike: '90 km',  run: '21.1 km', time: '~5–6 godz.',   target: '20% / 45% / 35%' },
  { name: 'Full Ironman', swim: '3.8 km',  bike: '180 km', run: '42.2 km', time: '~10–14 godz.', target: '18% / 50% / 32%' },
];

const phases = [
  { num: '1', title: 'Baza (Base) — 8–16 tygodni',    desc: 'Niska intensywność, duża objętość. Budowanie silnika tlenowego. Minimum 80% czasu w strefie 1–2. Kluczowe dla trwałego postępu.' },
  { num: '2', title: 'Budowanie (Build) — 6–10 tygodni', desc: 'Wzrost intensywności przy utrzymaniu objętości. Sesje sweet spot, treningi brick, długi bieg i jazda w tempie wyścigowym.' },
  { num: '3', title: 'Szczyt (Peak) — 2–3 tygodnie',  desc: 'Najwyższa jakość, lekko zredukowana objętość. Symulacje wyścigu, treningi w docelowym tempie, testy przejść T1/T2.' },
  { num: '4', title: 'Tapering — 1–2 tygodnie',       desc: 'Drastyczne obcięcie objętości, zachowanie intensywności. Odpoczynek, sen, odżywianie. Brak nowych bodźców treningowych.' },
];

const bricks = [
  { title: 'Brick krótki',       desc: 'Rower 30–45 min + bieg 15–20 min. Dobry do nauki przejścia. Można robić co tydzień bez dużego obciążenia.' },
  { title: 'Brick wyścigowy',    desc: '60–80% długości dystansu docelowego. Ćwicz pełny rytuał T2, odżywianie i nawodnienie na rowerze, start biegu w tempie wyścigowym.' },
  { title: 'Brick pełny (symulacja)', desc: 'Pływanie + rower + bieg w tempie docelowym. Raz lub dwa razy w sezonie, 3–4 tygodnie przed wyścigiem. Najważniejszy trening w roku.' },
];


export default function TriCoachPage() {
  return (
    <>
      <HeroSm
        discipline="tri"
        label="Tri Coach"
        title={<>Triathlon jako<br /><em className="tri">jeden sport</em></>}
        subtitle="Trzy dyscypliny, jedna strategia. Naucz się łączyć pływanie, rower i bieg w spójny plan, który prowadzi prosto na metę."
      />

      {/* ODŻYWIANIE — kalkulator */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="tri">Odżywianie wyścigowe</SectionLabel>
            <h2>Nie można wygrać na pusto, ale można przegrać na pełno</h2>
            <p>
              Wybierz format i planowany czas — kalkulator przeliczy dokładne ilości żeli
              i bidonów na podstawie Twojej wagi i dystansu.
              {' '}Jeśli masz połączoną Stravę, przewidziany czas pojawi się automatycznie.
            </p>
          </div>
          <NutritionCalculator />
        </div>
      </section>

      {/* DYSTANSE */}
      <section className="alt">
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="tri">Dystanse wyścigu</SectionLabel>
            <h2>Cztery formaty — jeden sport</h2>
            <p>Każdy dystans wymaga innej strategii treningowej i wyścigowej. Znajdź swój cel i planuj z wyprzedzeniem.</p>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Format</th><th>Pływanie</th><th>Rower</th><th>Bieg</th><th>Czas amatora</th><th>Proporcja treningu (S/B/R)</th></tr>
            </thead>
            <tbody>
              {distances.map(d => (
                <tr key={d.name}>
                  <td>{d.name}</td><td>{d.swim}</td><td>{d.bike}</td><td>{d.run}</td><td>{d.time}</td><td>{d.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PERIODYZACJA */}
      <section>
        <div className="section-inner">
          <div className="coach-layout">
            <div className="coach-text">
              <SectionLabel discipline="tri">Periodyzacja</SectionLabel>
              <h2>Fazy przygotowań do wyścigu</h2>
              <p>Skuteczne przygotowanie do triathlonu opiera się na świadomym planowaniu obciążeń. Każda faza ma określony cel — nie można budować szczytu przez cały rok.</p>
              <div className="phases">
                {phases.map(p => (
                  <div key={p.num} className="phase">
                    <div className="phase-num tri">{p.num}</div>
                    <div className="phase-body"><h4>{p.title}</h4><p>{p.desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="coach-visual">
              <div className="visual-icon">📅</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Przykładowy roczny plan (Half Ironman w czerwcu)</p>
              {[['Styczeń–Marzec','Faza Bazy — technika, niskie tętno'],['Kwiecień–Maj','Faza Budowania — brick, intensywność'],['Koniec Maja','Szczyt — symulacje, testy sprzętu'],['1–2 tyg. przed','Tapering — odpoczynek, ładowanie']].map(([period, desc]) => (
                <div key={period} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: '10px 12px', border: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{period}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PRZEJŚCIA */}
      <section className="alt">
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="tri">Przejścia</SectionLabel>
            <h2>T1 i T2 — czwarty sport triathlonu</h2>
            <p>Każda minuta zaoszczędzona w przejściu to minuta na mecie. Amatorzy tracą tu często 5–8 minut, które można odzyskać bez żadnego treningu fizycznego.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="info-card">
              <h4>T1 — Pływanie → Rower</h4>
              <p>Zdejmij piankę zanim wyjdziesz z wody. Przygotuj buty już w blokach na rowerze. Kask zakładaj przed dotknięciem roweru — dyskwalifikacja grozi za odwrotną kolejność. Ćwicz T1 co najmniej 3–4 razy przed wyścigiem.</p>
            </div>
            <div className="info-card">
              <h4>T2 — Rower → Bieg</h4>
              <p>Zacznij zdejmować buty rowerowe 1 km przed strefą. Miej numer startowy na gumce, nie zapinaj agrafkami. Pierwsze 2 km biegu zawsze spokojnie — nogi potrzebują adaptacji.</p>
            </div>
          </div>
        </div>
      </section>

      {/* BRICK */}
      <section>
        <div className="section-inner">
          <div className="section-header center">
            <SectionLabel discipline="tri">Brick</SectionLabel>
            <h2>Trening kluczowy dla triathlonisty</h2>
            <p>Brick to jazda na rowerze zakończona biegiem bez przerwy. Uczy ciało zmiany wzorca ruchowego i eliminuje uczucie „cegły w nogach" na początku biegu.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {bricks.map(b => (
              <div key={b.title} className="info-card"><h4>{b.title}</h4><p>{b.desc}</p></div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        title="Sprawdź swoje proporcje treningowe"
        description="Analizator TriCoach wyliczy, czy Twoje treningi mają odpowiedni podział między dyscypliny względem Twojego wyścigu docelowego."
      />
    </>
  );
}
