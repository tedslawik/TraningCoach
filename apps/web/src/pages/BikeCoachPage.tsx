import HeroSm from '../components/HeroSm';
import SectionLabel from '../components/SectionLabel';
import CtaBanner from '../components/CtaBanner';

const ftpZones = [
  { badge: '#e0f2fe:#075985', zone: 'Z1', pct: '< 55%',   name: 'Aktywna regeneracja', dur: 'Bez limitu', use: 'Rozgrzewki, wyjazdy regeneracyjne po ciężkich dniach' },
  { badge: '#dcfce7:#166534', zone: 'Z2', pct: '56–75%',  name: 'Wytrzymałość',         dur: '2–6 godz.', use: 'Długie jazdy budujące bazę — 80% całego treningu rowerowego' },
  { badge: '#fef9c3:#713f12', zone: 'Z3', pct: '76–90%',  name: 'Tempo / Sweet Spot',   dur: '20–90 min', use: 'Tempo wyścigowe dla Half/Full — najefektywniejsza strefa dla amatorów' },
  { badge: '#fed7aa:#7c2d12', zone: 'Z4', pct: '91–105%', name: 'Próg mleczanowy',       dur: '10–30 min', use: 'Interwały FTP, poprawa progu, Olympic i Sprint triathlon' },
  { badge: '#fecaca:#7f1d1d', zone: 'Z5', pct: '106–120%',name: 'VO2max',                dur: '3–8 min',   use: 'Interwały VO2max — tylko dla zaawansowanych w fazie Build' },
  { badge: '#f3e8ff:#6b21a8', zone: 'Z6–Z7', pct: '> 121%', name: 'Moc anaerobowa',     dur: '< 2 min',   use: 'Sprint triathlon, podjazdy — niepotrzebne dla Full i Half' },
];

const trainings = [
  { code: 'Z2',  title: 'Długa jazda wytrzymałościowa', desc: '3–5 godzin w strefie 2. Buduje mitochondria i efektywność spalania tłuszczu. Najważniejszy trening tygodnia dla dystansów Half i Full. Niedziela rano z bidonikami i żelami — ćwiczysz też odżywianie.' },
  { code: 'SS',  title: 'Sweet Spot',                   desc: '88–93% FTP przez 20–40 minut. "Comfortably hard". Najefektywniejsza strefa dla poprawy FTP przy ograniczonym czasie treningowym. 2×20 min Sweet Spot to solidna środa dla amatora z pracą.' },
  { code: 'FTP', title: 'Interwały progowe',            desc: '95–105% FTP w blokach 8–20 minut. Podnosi próg mleczanowy. Raz w tygodniu maksymalnie — wymaga pełnej regeneracji.' },
  { code: 'B',   title: 'Brick',                        desc: 'Jazda zakończona biegiem bez przerwy. Kluczowy trening triathlonowy — uczy ciało przejścia T2. Minimum raz na 2 tygodnie w sezonie Build.' },
];

const ftpTable = [
  { level: 'Początkujący',     ftp: '120–180', speed: '22–26 km/h' },
  { level: 'Średniozaaw.',     ftp: '180–250', speed: '26–32 km/h' },
  { level: 'Zaawansowany',     ftp: '250–320', speed: '32–38 km/h' },
  { level: 'Elita amatorów',   ftp: '> 320',   speed: '> 38 km/h' },
];

const nutrition = [
  { title: 'Kalorie — ile?',    desc: '250–350 kcal/h dla wysiłku 2+ godzin. Łatwo strawne węglowodany: żele, batony, banany, daktyle. Zjedz coś po 20 minutach jazdy — nie czekaj na głód.' },
  { title: 'Płyny — kiedy?',   desc: '500–800 ml/h zależnie od temperatury. Napój izotonik + woda na zmianę. Zacznij pić po 10 minutach od startu. Jeśli czujesz pragnienie — jesteś już odwodniony.' },
  { title: 'Sód i elektrolity', desc: '600–900 mg sodu/h. Skurcze na biegu to często brak sodu, nie magnezu. Tabletki elektrolitowe lub napój z sodem. W upale zwiększ dawkę o 20–30%.' },
];

const pacing = [
  { num: '1', title: 'Pierwsze 20% dystansu — spokojnie', desc: 'Wszyscy wokół jadą za szybko — adrenalina wyścigu. Zacznij w 70–75% FTP, pozwól tętnu ustabilizować się. To kilometry, które spłacisz z odsetkami na biegu.' },
  { num: '2', title: 'Środkowe 60% — utrzymuj moc',       desc: '70–78% FTP dla Half, 65–72% dla Full. Stała moc ważniejsza niż stała prędkość — zmień przerzutkę na podjazdach, nie zwiększaj mocy. Power meter jest tu bezcenny.' },
  { num: '3', title: 'Ostatnie 20% — nie kończ za mocno', desc: 'Pokusa, żeby "wysypać" całą energię. Nie rób tego — masz jeszcze bieg. Każdy watt powyżej planu to stracona sekunda na biegu.' },
];

const techniques = [
  'Kadencja 85–95 rpm — wysoka kadencja oszczędza mięśnie na bieg',
  'Pozycja aerodynamiczna — opór powietrza to 70–80% całego oporu na rowerze',
  'Kąt tułowia 15–20° od poziomu — kompromis między aerodynamiką a komfortem biegu',
  'Stopy równoległe do podłoża w dolnym martwym punkcie',
  'Rozluźniony uchwyt kierownicy — napięte barki to strata energii i ból pleców',
];

export default function BikeCoachPage() {
  return (
    <>
      <HeroSm
        discipline="bike"
        label="Bike Coach"
        title={<>Rower to największy<br /><em className="bike">rezerwuar czasu</em></>}
        subtitle="W Half Ironmanie spędzasz na rowerze 2.5–3 godziny. W Full — 5–7 godzin. To tu wygrywasz lub tracisz wyścig. I tu możesz zdobyć najwięcej bez kontuzji."
      />

      {/* STREFY FTP */}
      <section className="alt">
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="bike">Strefy mocy (FTP)</SectionLabel>
            <h2>Trenuj z mocą, nie tylko z tętnem</h2>
            <p>FTP (Functional Threshold Power) to moc, którą możesz utrzymać przez godzinę. Większość amatorów ma FTP 150–280W.</p>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Strefa</th><th>% FTP</th><th>Nazwa</th><th>Czas w strefie</th><th>Zastosowanie w triathlonie</th></tr>
            </thead>
            <tbody>
              {ftpZones.map(z => {
                const [bg, color] = z.badge.split(':');
                return (
                  <tr key={z.zone}>
                    <td><span className="zone-badge" style={{ background: bg, color }}>{z.zone}</span></td>
                    <td>{z.pct}</td><td>{z.name}</td><td>{z.dur}</td><td>{z.use}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* TYPY TRENINGÓW */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="bike">Typy treningów</SectionLabel>
            <h2>Jak zbudować silny silnik rowerowy</h2>
          </div>
          <div className="phases">
            {trainings.map(t => (
              <div key={t.code} className="phase">
                <div className="phase-num bike">{t.code}</div>
                <div className="phase-body"><h4>{t.title}</h4><p>{t.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POZYCJA I KADENCJA */}
      <section className="alt">
        <div className="section-inner">
          <div className="coach-layout reverse">
            <div className="coach-text">
              <SectionLabel discipline="bike">Technika jazdy</SectionLabel>
              <h2>Pozycja i kadencja — dwa klucze do efektywności</h2>
              <p>Pozycja na rowerze ma ogromny wpływ na aerodynamikę i komfort biegu po zjeździe. Triathlonista jedzie inaczej niż kolarz szosowy — z myślą o biegu za 2–3 godziny.</p>
              <ul className="coach-features">
                {techniques.map(t => (
                  <li key={t}><span className="check bike">✓</span>{t}</li>
                ))}
              </ul>
            </div>
            <div className="coach-visual">
              <div className="visual-icon">⚡</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Przykładowe FTP i prędkości dla amatorów</p>
              <table className="data-table" style={{ marginTop: '0.5rem' }}>
                <thead><tr><th>Poziom</th><th>FTP (W)</th><th>Prędkość</th></tr></thead>
                <tbody>
                  {ftpTable.map(r => (
                    <tr key={r.level}><td>{r.level}</td><td>{r.ftp}</td><td>{r.speed}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="visual-stat-grid" style={{ marginTop: '1rem' }}>
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--bike)' }}>90</div><div className="visual-stat-lbl">Kadencja rpm</div></div>
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--bike)' }}>75%</div><div className="visual-stat-lbl">FTP wyścig HIM</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ODŻYWIANIE */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="bike">Odżywianie</SectionLabel>
            <h2>Rower to bufet — jedz, zanim poczujesz głód</h2>
            <p>Większość problemów biegowych w triathlonie to błędy żywieniowe na rowerze.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {nutrition.map(n => (
              <div key={n.title} className="info-card"><h4>{n.title}</h4><p>{n.desc}</p></div>
            ))}
          </div>
          <div className="info-card" style={{ marginTop: 16 }}>
            <h4>Złota zasada wyścigu</h4>
            <p>Nigdy nie eksperymentuj z jedzeniem w dniu wyścigu. Wszystko — żele, napoje, batony — musi być przetestowane w treningach. Żołądek w wyścigu jest pod stresem i reaguje inaczej niż w spokojnym treningu.</p>
          </div>
        </div>
      </section>

      {/* PACING */}
      <section className="alt">
        <div className="section-inner narrow">
          <div className="section-header">
            <SectionLabel discipline="bike">Pacing wyścigowy</SectionLabel>
            <h2>Jak jechać, żeby dobrze biec</h2>
            <p>Cel nie jest bieg na rowerze — celem jest zjechać ze stanem energetycznym, który pozwoli biec mocno.</p>
          </div>
          <div className="phases">
            {pacing.map(p => (
              <div key={p.num} className="phase">
                <div className="phase-num bike">{p.num}</div>
                <div className="phase-body"><h4>{p.title}</h4><p>{p.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        title="Sprawdź swoją prędkość na rowerze"
        description="Analizator wyliczy Twoją średnią prędkość i proporcję czasu na rowerze względem wyścigu docelowego."
      />
    </>
  );
}
