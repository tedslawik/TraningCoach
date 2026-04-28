import { useState, useEffect, useCallback, useRef } from 'react';
import HeroSm from '../components/HeroSm';
import SectionLabel from '../components/SectionLabel';
import CtaBanner from '../components/CtaBanner';
import WeekCalendar, { WeekZoneSummaryBar, type CalendarActivity } from '../components/shared/WeekCalendar';
import { useAuth } from '../context/AuthContext';

/* ── Types ── */
interface RunActivity {
  id: number; name: string; sportType: string; date: string;
  distanceKm: number; timeFormatted: string; pace: string | null;
  movingTimeSec: number; sufferScore: number | null;
  avgHeartRate: number | null; maxHeartRate: number | null;
  elevationGain: number; hasHeartRate: boolean;
  zoneTimes: number[] | null;
}
interface RunTotals {
  distanceKm: number; timeFormatted: string; avgPace: string | null;
  avgHeartRate: number | null; sufferScore: number; sessions: number;
  longestRunKm: number; zoneTimes: number[];
}
interface RunData { weekStart: string; activities: RunActivity[]; totals: RunTotals; }

/* ── Helpers ── */
function getMonday(d: Date) {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const m = new Date(d); m.setDate(m.getDate() - (day - 1)); m.setHours(0,0,0,0); return m;
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtRange(mon: Date) {
  const sun = addDays(mon, 6);
  return `${mon.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})} – ${sun.toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'})}`;
}

/* ── Run assessment ── */
function assessRuns(totals: RunTotals): Array<{ type: 'ok' | 'warn'; text: string }> {
  const items: Array<{ type: 'ok' | 'warn'; text: string }> = [];

  // Volume
  if      (totals.distanceKm < 15)                 items.push({ type: 'warn', text: `Niski wolumen — ${totals.distanceKm} km. Dla Half IM cel to min. 30 km/tydzień.` });
  else if (totals.distanceKm >= 30 && totals.distanceKm <= 65) items.push({ type: 'ok',   text: `Dobry wolumen tygodniowy — ${totals.distanceKm} km w optymalnym zakresie.` });
  else if (totals.distanceKm > 65)                 items.push({ type: 'warn', text: `Bardzo duży wolumen — ${totals.distanceKm} km. Zadbaj o regenerację między sesjami.` });

  // Intensity from zone data
  const zt = totals.zoneTimes;
  const ztTotal = zt.reduce((s, v) => s + v, 0);
  if (ztTotal > 60) {
    const highPct = Math.round(((zt[2] + zt[3] + zt[4]) / ztTotal) * 100);
    const aerbPct = 100 - highPct;
    if (highPct > 25) items.push({ type: 'warn', text: `Za dużo intensywności — ${highPct}% czasu w Z3+ (cel < 20%). Więcej łatwych biegów.` });
    else              items.push({ type: 'ok',   text: `Dobra dystrybucja intensywności — ${aerbPct}% w strefach aerobowych.` });
  }

  // Frequency
  if      (totals.sessions < 2) items.push({ type: 'warn', text: `Tylko ${totals.sessions} bieg w tygodniu — dla triathlonu min. 3 sesje.` });
  else if (totals.sessions >= 3) items.push({ type: 'ok',  text: `${totals.sessions} sesje biegowe — dobra regularność.` });

  // Longest run
  if      (totals.longestRunKm < 10) items.push({ type: 'warn', text: `Brak długiego biegu (najdłuższy: ${totals.longestRunKm} km). Dla Half IM powinien być > 14 km.` });
  else if (totals.longestRunKm >= 14) items.push({ type: 'ok', text: `Długi bieg ${totals.longestRunKm} km — fundament biegu w Half IM.` });

  return items;
}

/* ── Live section ── */
function RunLiveSection() {
  const { session, stravaToken } = useAuth();
  const [weekStart, setWeekStart]   = useState(() => getMonday(new Date()));
  const [data, setData]             = useState<RunData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [weekLoading, setWeekLoading] = useState(false);
  const autoFetched = useRef(false);

  const navBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-md)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' };

  const doFetch = useCallback((week: Date, initial = false) => {
    if (!session) return;
    if (initial) setLoading(true); else setWeekLoading(true);
    fetch(`/api/strava/runs?weekStart=${toKey(week)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => { setLoading(false); setWeekLoading(false); });
  }, [session]);

  useEffect(() => {
    if (session && stravaToken && !autoFetched.current) {
      autoFetched.current = true;
      doFetch(weekStart, true);
    }
  }, [session, stravaToken, doFetch, weekStart]);

  useEffect(() => { if (data) doFetch(weekStart); }, [weekStart]); // eslint-disable-line

  const isCurrentWeek = toKey(weekStart) === toKey(getMonday(new Date()));

  if (!session || !stravaToken) return null;

  if (loading) return (
    <section className="alt">
      <div className="section-inner">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Pobieranie biegów ze Stravy…</p>
      </div>
    </section>
  );

  if (!data) return null;

  const { totals, activities } = data;
  const assessment = assessRuns(totals);

  // Map to CalendarActivity
  const calActs: CalendarActivity[] = activities.map(a => ({
    id: a.id, name: a.name, type: 'run', date: a.date,
    distanceKm: a.distanceKm, timeFormatted: a.timeFormatted,
    paceOrSpeed: a.pace, sufferScore: a.sufferScore,
    avgHeartRate: a.avgHeartRate, elevationGain: a.elevationGain,
    zoneTimes: a.zoneTimes,
  }));

  return (
    <section className="alt">
      <div className="section-inner">
        {/* Header + nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <SectionLabel discipline="run">Twoje biegi</SectionLabel>
            <h2 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 700, letterSpacing: -0.8 }}>
              {weekLoading ? 'Ładowanie…' : fmtRange(weekStart)}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setWeekStart(w => addDays(w, -7))} style={navBtn}>← Poprzedni</button>
            <button onClick={() => { if (!isCurrentWeek) setWeekStart(w => addDays(w, 7)); }} disabled={isCurrentWeek} style={{ ...navBtn, opacity: isCurrentWeek ? 0.35 : 1 }}>Następny →</button>
          </div>
        </div>

        {/* Weekly stats */}
        {totals.sessions > 0 ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 10, marginBottom: '1.25rem' }}>
              {[
                ['Dystans', `${totals.distanceKm} km`],
                ['Czas', totals.timeFormatted],
                ['Śr. tempo', totals.avgPace ?? '—'],
                ['Śr. HR', totals.avgHeartRate ? `${totals.avgHeartRate} bpm` : '—'],
                ['Suffer Score', totals.sufferScore > 0 ? String(totals.sufferScore) : '—'],
                ['Sesje', String(totals.sessions)],
                ['Najdłuższy', `${totals.longestRunKm} km`],
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--run)' }}>{val}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{lbl}</div>
                </div>
              ))}
            </div>

            {/* Zone summary */}
            <WeekZoneSummaryBar zoneTimes={totals.zoneTimes} totalLabel="Strefy tętna — biegi tygodnia" />

            {/* Calendar */}
            <WeekCalendar activities={calActs} weekStart={weekStart} loading={weekLoading} emptyLabel="REST" />

            {/* Assessment */}
            {assessment.length > 0 && (
              <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 2 }}>
                  Ocena tygodnia biegowego
                </div>
                {assessment.map((item, i) => (
                  <div key={i} className={`alert alert-${item.type}`} style={{ margin: 0 }}>
                    {item.type === 'ok' ? '✅' : '⚠️'} {item.text}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
            Brak biegów w tym tygodniu.
          </p>
        )}
      </div>
    </section>
  );
}

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

      {/* LIVE STRAVA DATA */}
      <RunLiveSection />

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
