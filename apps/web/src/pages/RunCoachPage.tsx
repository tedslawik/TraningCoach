import HeroSm from '../components/HeroSm';
import SectionLabel from '../components/SectionLabel';
import CtaBanner from '../components/CtaBanner';

const zones = [
  { badge: '#e0f2fe:#075985', name: 'Z1 Regeneracja', hr: '< 60%',  feel: 'Bardzo lekko, spokojna rozmowa', pace: '> 6:30 /km', use: 'Aktywna regeneracja po ciężkich sesjach' },
  { badge: '#dcfce7:#166534', name: 'Z2 Aerobowa',    hr: '60–70%', feel: 'Lekko, pełne zdania',             pace: '5:45–6:30 /km', use: '80% całego treningu — budowanie bazy tlenowej' },
  { badge: '#fef9c3:#713f12', name: 'Z3 Aerobowa+',   hr: '70–80%', feel: 'Umiarkowanie, krótkie zdania',    pace: '5:00–5:45 /km', use: 'Tempa wyścigowe Half/Full — używaj oszczędnie' },
  { badge: '#fed7aa:#7c2d12', name: 'Z4 Próg',        hr: '80–90%', feel: 'Ciężko, pojedyncze słowa',        pace: '4:20–5:00 /km', use: 'Treningi tempo, 10 km, Olympic tri' },
  { badge: '#fecaca:#7f1d1d', name: 'Z5 VO2max',      hr: '> 90%',  feel: 'Maksymalnie, brak mowy',          pace: '< 4:20 /km',    use: 'Interwały, tylko dla zaawansowanych' },
];

const runTypes = [
  { code: 'L', title: 'Long Run — długi bieg',    desc: 'Najważniejszy trening tygodnia. Buduje bazę tlenową i uczy ciało spalania tłuszczu. Tempo musi być spokojne — strefa 2. Dla Half Ironmana: 16–22 km. Nie biegaj szybciej, nawet jeśli czujesz się dobrze.' },
  { code: 'T', title: 'Tempo Run — bieg progowy', desc: '20–40 minut w tempie progu mleczanowego (strefa 4). "Komfortowo ciężko". Podnosi FTP biegowe i przyzwyczaja ciało do biegu w wyścigowym tempie. Raz w tygodniu maksymalnie.' },
  { code: 'E', title: 'Easy Run — łatwy bieg',    desc: 'Strefa 1–2, krótki dystans (5–10 km). Wypełnia tygodnik, wspomaga regenerację i akumuluje kilometry bez zmęczenia. Absolutnie większość amatorów biega je za szybko.' },
  { code: 'B', title: 'Brick Run — bieg po rowerze', desc: 'Specyficzny dla triathlonu. Uczy ciało szybkiej zmiany wzorca ruchowego. Nawet 15–20 minut po długiej jeździe to wartościowy bodziec. Pierwsze 2 km zawsze spokojniej — nogi muszą "wejść" w bieg.' },
];

const mistakes = [
  { title: 'Bieganie za szybko w treningach "łatwych"',   desc: '80% amatorów biega łatwe biegi w strefie 3–4. Efekt: chroniczne zmęczenie, brak regeneracji, brak poprawy tempa wyścigowego. Sprawdź puls — powinno się spokojnie rozmawiać.' },
  { title: 'Zbyt szybki wzrost kilometrów',               desc: 'Zasada 10% tygodniowo to minimum bezpieczeństwa. Kości, ścięgna i więzadła adaptują się wolniej niż mięśnie. Kontuzje u triathlonistów najczęściej wynikają z przeciążenia biegu.' },
  { title: 'Start biegu za szybko w wyścigu',             desc: 'Adrenalina wyścigu kłamie — czujesz się świetnie, ale jesteś na kredyt. Zbyt szybkie pierwsze kilometry kończą się "ścianą" na ostatniej trzeciej. Trzymaj plan, nie tłum.' },
];

export default function RunCoachPage() {
  return (
    <>
      <HeroSm
        discipline="run"
        label="Run Coach"
        title={<>Finiszuj mocno,<br /><em className="run">zawsze</em></>}
        subtitle="Biegasz po 90 lub 180 km w siodle. Twój bieg triathlonowy to osobna dyscyplina, która wymaga specjalnego przygotowania — nie tylko kondycji, ale i adaptacji nerwowo-mięśniowej."
      />

      {/* STREFY */}
      <section className="alt">
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="run">Strefy tętna</SectionLabel>
            <h2>Trenuj we właściwej strefie</h2>
            <p>Większość amatorów trenuje zbyt intensywnie — zbyt wolno, żeby się poprawić, zbyt szybko, żeby się regenerować.</p>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Strefa</th><th>% HRmax</th><th>Odczucie</th><th>Tempo (baza 5:00/km)</th><th>Zastosowanie</th></tr>
            </thead>
            <tbody>
              {zones.map(z => {
                const [bg, color] = z.badge.split(':');
                return (
                  <tr key={z.name}>
                    <td><span className="zone-badge" style={{ background: bg, color }}>{z.name}</span></td>
                    <td>{z.hr}</td><td>{z.feel}</td><td>{z.pace}</td><td>{z.use}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* TYPY BIEGÓW */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="run">Typy biegów</SectionLabel>
            <h2>Każdy trening ma cel</h2>
          </div>
          <div className="phases">
            {runTypes.map(r => (
              <div key={r.code} className="phase">
                <div className="phase-num run">{r.code}</div>
                <div className="phase-body"><h4>{r.title}</h4><p>{r.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BIOMECHANIKA */}
      <section className="alt">
        <div className="section-inner">
          <div className="coach-layout">
            <div className="coach-text">
              <SectionLabel discipline="run">Technika</SectionLabel>
              <h2>Bieg po rowerze — inne ciało</h2>
              <p>Bieganie w triathlonie różni się od biegania samego w sobie. Mięśnie czworogłowe są zmęczone rowerem, biodra skrócone po pozycji aerodynamicznej.</p>
              <ul className="coach-features">
                {['Kadencja biegowa 175–185 kroków/min — skróć krok, zwiększ częstotliwość',
                  'Lekki pochyl do przodu z bioder — nie ze środka pleców',
                  'Rozluźnione ramiona — pięści nie zaciśnięte, łokcie pod kątem 90°',
                  'Lądowanie śródstopiem pod środkiem ciężkości ciała',
                  'Pierwsze 2–3 km wyścigu: świadomie trzymaj puls 10–15 uderzeń poniżej celu'].map(f => (
                  <li key={f}><span className="check run">✓</span>{f}</li>
                ))}
              </ul>
            </div>
            <div className="coach-visual">
              <div className="visual-icon">🦵</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Rozkład intensywności w tygodniu (Half Ironman)</p>
              <div>
                {[['Z1–Z2','80','.5'],['Z3–Z4','15','1'],['Z5','5','1']].map(([lbl, w, op]) => (
                  <div key={lbl} className="v-bar-row">
                    <span className="v-bar-lbl">{lbl}</span>
                    <div className="v-bar-track"><div className="v-bar-fill fill-run" style={{ width: `${w}%`, opacity: +op }} /></div>
                    <span className="v-bar-pct">{w}%</span>
                  </div>
                ))}
              </div>
              <div className="visual-stat-grid">
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--run)' }}>30–50</div><div className="visual-stat-lbl">km/tydzień</div></div>
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--run)' }}>3–4</div><div className="visual-stat-lbl">sesje/tydzień</div></div>
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--run)' }}>180</div><div className="visual-stat-lbl">kadencja spm</div></div>
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--run)' }}>10%</div><div className="visual-stat-lbl">maks. wzrost/tydzień</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BŁĘDY */}
      <section>
        <div className="section-inner narrow">
          <div className="section-header">
            <SectionLabel discipline="run">Najczęstsze błędy</SectionLabel>
            <h2>Czego unikać</h2>
          </div>
          <div className="phases">
            {mistakes.map(m => (
              <div key={m.title} className="phase">
                <div className="phase-num run">!</div>
                <div className="phase-body"><h4>{m.title}</h4><p>{m.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        title="Oblicz swoje tempo biegowe"
        description="Podaj dane z ostatnich treningów, a analizator wyliczy Twoje aktualne tempo i dopasuje plan biegowy do Twojego wyścigu."
      />
    </>
  );
}
