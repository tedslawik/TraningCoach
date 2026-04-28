import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { assessAthlete, analyzeWorkouts, RACE_TARGETS } from '@tricoach/core';
import type { Assessment } from '@tricoach/core';
import SectionLabel from '../components/SectionLabel';

/* ── Types ─────────────────────────────────────────────── */
interface AthleteData {
  profile: {
    id: number; name: string; avatar: string | null;
    weight: number | null; ftp: number | null;
    city: string | null; country: string | null;
  };
  weekStart: string;
  zones: {
    heartRate: Array<{ min: number; max: number }> | null;
    power:     Array<{ min: number; max: number }> | null;
    hrSource:  'strava' | 'calculated' | null;
    pwrSource: 'strava' | 'calculated' | null;
  };
  activities: Activity[];
  weekTotals: { sufferScore: number; kilojoules: number; timeFormatted: string; sessions: number };
}

interface Activity {
  id: number; name: string; type: 'swim' | 'bike' | 'run' | 'other'; sportType: string;
  date: string; distanceKm: number; elevationGain: number;
  timeFormatted: string; paceOrSpeed: string | null;
  sufferScore: number | null; avgHeartRate: number | null; maxHeartRate: number | null;
  avgWatts: number | null; normalizedWatts: number | null; kilojoules: number | null;
  avgCadence: number | null; perceivedExertion: number | null;
  movingTimeSec: number; hasHeartRate: boolean; deviceWatts: boolean;
  zoneTimes: number[] | null; // seconds per HR zone [Z1..Z5]
}

/* ── Constants ──────────────────────────────────────────── */
const HR_ZONE_NAMES  = ['Z1 Regeneracja','Z2 Aerobowa','Z3 Tempo','Z4 Próg','Z5 VO2max'];
const PWR_ZONE_NAMES = ['Z1 Regeneracja aktywna','Z2 Wytrzymałość','Z3 Tempo','Z4 Próg mleczanowy','Z5 VO2max','Z6 Moc anaerobowa','Z7 Sprint'];
const ZONE_COLORS    = ['#60a5fa','#34d399','#fbbf24','#fb923c','#f87171','#e11d48','#7c3aed'];

const TYPE_META = {
  swim:  { icon: '🏊', color: '#378add', label: 'Pływanie' },
  bike:  { icon: '🚴', color: '#639922', label: 'Rower' },
  run:   { icon: '🏃', color: '#d85a30', label: 'Bieg' },
  other: { icon: '💪', color: '#9ca3af', label: 'Trening' },
};

const DAY_NAMES_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const m = monday.toLocaleDateString('pl-PL', opts);
  const s = sunday.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${m} – ${s}`;
}

function fmtZone(z: { min: number; max: number }) {
  if (z.min <= 0) return `< ${z.max}`;
  if (z.max <= 0 || z.max === 9999) return `> ${z.min}`;
  return `${z.min} – ${z.max}`;
}


/* ── Stat pill ──────────────────────────────────────────── */
function Stat({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────── */
export default function AthletePage() {
  const { session, stravaToken } = useAuth();
  const handleReconnect = () => {
    if (!session) return;
    window.location.href = `/api/auth/strava?token=${session.access_token}`;
  };

  const [weekStart, setWeekStart]     = useState<Date>(() => getMonday(new Date()));
  const [data, setData]               = useState<AthleteData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [weekLoading, setWeekLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [assessment, setAssessment]   = useState<Assessment | null>(null);

  const doFetch = (week: Date, initial = false) => {
    if (!session) { setLoading(false); return; }
    if (initial) setLoading(true); else setWeekLoading(true);
    fetch(`/api/strava/athlete?weekStart=${toDateKey(week)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: AthleteData) => { setData(d); buildAssessment(d); })
      .catch(() => setError('Nie udało się pobrać danych zawodnika.'))
      .finally(() => { setLoading(false); setWeekLoading(false); });
  };

  useEffect(() => { doFetch(weekStart, true); }, [session]);        // initial
  useEffect(() => { if (session && data) doFetch(weekStart); }, [weekStart]); // week nav

  const isCurrentWeek = toDateKey(weekStart) === toDateKey(getMonday(new Date()));
  const goPrev = () => setWeekStart(w => addDays(w, -7));
  const goNext = () => { if (!isCurrentWeek) setWeekStart(w => addDays(w, 7)); };

  function buildAssessment(d: AthleteData) {
    const swimDist = d.activities.filter(a=>a.type==='swim').reduce((s,a)=>s+a.distanceKm,0);
    const bikeDist = d.activities.filter(a=>a.type==='bike').reduce((s,a)=>s+a.distanceKm,0);
    const runDist  = d.activities.filter(a=>a.type==='run').reduce((s,a)=>s+a.distanceKm,0);
    const swimT = d.activities.filter(a=>a.type==='swim').reduce((s,a)=>s+parseFloat(a.timeFormatted),0);
    const bikeT = d.activities.filter(a=>a.type==='bike').reduce((s,a)=>s+parseFloat(a.timeFormatted),0);
    const runT  = d.activities.filter(a=>a.type==='run').reduce((s,a)=>s+parseFloat(a.timeFormatted),0);

    const target = RACE_TARGETS.half;
    const analysis = analyzeWorkouts(
      { swimDist, swimTime: swimT, swimSessions: d.activities.filter(a=>a.type==='swim').length,
        bikeDist, bikeTime: bikeT, bikeSessions: d.activities.filter(a=>a.type==='bike').length,
        runDist,  runTime: runT,   runSessions:  d.activities.filter(a=>a.type==='run').length,
        raceDate: '', raceType: 'half' },
      target,
    );

    setAssessment(assessAthlete({
      analysis, target,
      daysUntilRace: null,
      totalSufferScore: d.weekTotals.sufferScore,
      activities: d.activities.map(a => ({
        type: a.type, timeMin: 0,
        sufferScore: a.sufferScore, avgHeartRate: a.avgHeartRate,
      })),
    }));
  }

  if (!session) return (
    <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      Zaloguj się, aby zobaczyć profil zawodnika.
    </div>
  );

  if (!stravaToken && !loading) return (
    <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      Połącz Stravę, aby zobaczyć dane zawodnika.
    </div>
  );

  if (loading) return (
    <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Pobieranie danych…
    </div>
  );

  if (error) return (
    <div style={{ padding: '5rem', textAlign: 'center' }}>
      <div className="alert alert-warn">{error}</div>
    </div>
  );

  if (!data) return null;

  const { profile, zones, activities, weekTotals } = data;

  const sufferMax = Math.max(700, weekTotals.sufferScore);
  const sufferPct = Math.min(100, (weekTotals.sufferScore / sufferMax) * 100);
  const loadMeta  = weekTotals.sufferScore < 80   ? { color: '#60a5fa', label: 'Niskie' }
                  : weekTotals.sufferScore < 250  ? { color: '#34d399', label: 'Umiarkowane' }
                  : weekTotals.sufferScore < 500  ? { color: '#fb923c', label: 'Wysokie' }
                  :                                 { color: '#f87171', label: 'Bardzo wysokie' };

  return (
    <>
      {/* ── HERO ── */}
      <div className="hero-sm" style={{ textAlign: 'left', paddingLeft: '5vw', paddingRight: '5vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {profile.avatar && (
            <img src={profile.avatar} alt={profile.name}
              style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid var(--bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }} />
          )}
          <div>
            <span className="section-label tri">Zawodnik</span>
            <h1 style={{ marginBottom: 4 }}>{profile.name}</h1>
            <p style={{ margin: 0 }}>
              {[profile.city, profile.country].filter(Boolean).join(', ') || 'Profil triathlonisty'}
            </p>
          </div>
        </div>
      </div>

      {/* ── PROFIL + OBCIĄŻENIE ── */}
      <section>
        <div className="section-inner">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Dane fizyczne */}
            <div className="card">
              <div className="card-title">Dane zawodnika</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, padding: '8px 0' }}>
                <Stat label="Waga" value={profile.weight ? profile.weight.toFixed(1) : null} unit="kg" />
                <Stat label="FTP" value={profile.ftp} unit="W" />
                <Stat label="Sesje / 7 dni" value={weekTotals.sessions} />
              </div>
              {profile.weight == null && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                  Waga: ustaw w Strava → Ustawienia → Profil
                </p>
              )}
              {profile.ftp == null && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  FTP: ustaw w Strava → Ustawienia → Moje osiągi
                </p>
              )}
              <button onClick={handleReconnect} style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-md)', padding: '5px 12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                🔄 Reconnect Strava (odśwież uprawnienia)
              </button>
            </div>

            {/* Obciążenie tygodniowe */}
            <div className="card">
              <div className="card-title">Obciążenie tygodniowe</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, padding: '8px 0 16px' }}>
                <Stat label="Suffer Score" value={weekTotals.sufferScore} />
                <Stat label="Energia" value={weekTotals.kilojoules ? `${(weekTotals.kilojoules/1000).toFixed(1)}` : null} unit="MJ" />
                <Stat label="Czas" value={weekTotals.timeFormatted} />
              </div>
              <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Poziom obciążenia</span>
                <span style={{ fontWeight: 600, color: loadMeta.color }}>{loadMeta.label}</span>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                <div style={{ width: `${sufferPct}%`, height: '100%', background: loadMeta.color, borderRadius: 6, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── OCENA ZAWODNIKA ── */}
      {assessment && (
        <section className="alt">
          <div className="section-inner">
            <div className="section-header">
              <SectionLabel discipline="tri">Ocena zawodnika</SectionLabel>
              <h2>Analiza ostatnich 7 dni</h2>
            </div>

            {/* Score */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start', marginBottom: 24 }}>
              <div style={{ textAlign: 'center', background: 'var(--bg)', border: `3px solid ${assessment.scoreColor}`, borderRadius: 'var(--radius-xl)', padding: '1.5rem 2rem' }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: assessment.scoreColor, lineHeight: 1 }}>
                  {assessment.score}
                  <span style={{ fontSize: 24, fontWeight: 400, color: 'var(--text-secondary)' }}>/10</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: assessment.scoreColor, marginTop: 6 }}>
                  {assessment.scoreLabel}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {assessment.highlights.map((h, i) => (
                  <div key={i} style={{ background: '#eaf3de', color: '#2e5c0a', borderLeft: '3px solid #6fa820', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 13, lineHeight: 1.4 }}>
                    ✅ {h}
                  </div>
                ))}
                {assessment.warnings.map((w, i) => (
                  <div key={i} style={{ background: '#fdf3e0', color: '#7a4800', borderLeft: '3px solid #f0a820', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 13, lineHeight: 1.4 }}>
                    ⚠️ {w}
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {assessment.recommendations.length > 0 && (
              <div className="card">
                <div className="card-title">💡 Rekomendacje</div>
                {assessment.recommendations.map((r, i) => (
                  <div key={i} className="tip-item">{r}</div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── STREFY TĘTNA I MOCY ── */}
      <section>
        <div className="section-inner">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* HR Zones */}
            <div className="card">
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Strefy tętna</span>
                {zones.hrSource === 'calculated' && <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>szacowane z max HR</span>}
                {zones.hrSource === 'strava' && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>● Strava</span>}
              </div>
              {zones.heartRate ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {zones.heartRate.slice(0, 5).map((z, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: ZONE_COLORS[i], flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{HR_ZONE_NAMES[i]}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtZone(z)} <span style={{ fontWeight: 400, fontSize: 11 }}>bpm</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Brak stref — ustaw je w Strava → Ustawienia → Strefy tętna
                </p>
              )}
            </div>

            {/* Power Zones */}
            <div className="card">
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Strefy mocy {profile.ftp != null && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· FTP {profile.ftp} W</span>}</span>
                {zones.pwrSource === 'calculated' && <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>wyliczone z FTP</span>}
                {zones.pwrSource === 'strava' && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>● Strava</span>}
              </div>
              {zones.power ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {zones.power.slice(0, 7).map((z, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: ZONE_COLORS[i], flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{PWR_ZONE_NAMES[i] ?? `Z${i+1}`}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtZone(z)} <span style={{ fontWeight: 400, fontSize: 11 }}>W</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {profile.ftp != null
                    ? 'Strefy mocy niedostępne — sprawdź ustawienia Stravy'
                    : 'Ustaw FTP w Strava → Ustawienia → Moje osiągi → Próg mocy'}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── AKTYWNOŚCI Z DETALAMI ── */}
      <section className="alt">
        <div className="section-inner">
          {/* ── WEEK NAVIGATION ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: 12 }}>
            <div>
              <SectionLabel discipline="tri">Kalendarz treningów</SectionLabel>
              <h2 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 700, letterSpacing: -0.8 }}>
                {weekLoading ? 'Ładowanie…' : fmtWeekRange(weekStart)}
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={goPrev} style={navBtn}>← Poprzedni</button>
              <button onClick={goNext} disabled={isCurrentWeek} style={{ ...navBtn, opacity: isCurrentWeek ? 0.35 : 1 }}>Następny →</button>
            </div>
          </div>

          {/* ── CALENDAR GRID ── */}
          <WeekCalendar activities={activities} weekStart={weekStart} loading={weekLoading} />
        </div>
      </section>
    </>
  );
}

/* ── Nav button style ─────────────────────────────────── */
const navBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 'var(--radius-md)',
  border: '0.5px solid var(--border-md)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  transition: 'background 0.15s',
};

/* ── Week Calendar ─────────────────────────────────────── */
function WeekCalendar({ activities, weekStart, loading }: { activities: Activity[]; weekStart: Date; loading: boolean }) {
  const today = toDateKey(new Date());

  // Group activities by date key
  const grouped: Record<string, Activity[]> = {};
  activities.forEach(a => {
    const key = (a.date as string).split('T')[0];
    grouped[key] = grouped[key] ?? [];
    grouped[key].push(a);
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 8, minWidth: 700 }}>
        {days.map((day, i) => {
          const key   = toDateKey(day);
          const isToday = key === today;
          const dayActs = grouped[key] ?? [];
          return (
            <div key={key} style={{
              border: isToday ? '2px solid var(--tri)' : '0.5px solid var(--border-md)',
              borderRadius: 'var(--radius-lg)',
              background: isToday ? '#ede9fd22' : 'var(--bg)',
              display: 'flex', flexDirection: 'column',
              opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s',
            }}>
              {/* Day header */}
              <div style={{
                padding: '8px 10px 6px',
                borderBottom: '0.5px solid var(--border)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isToday ? 'var(--tri)' : 'var(--text-secondary)' }}>
                  {DAY_NAMES_SHORT[i]}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: isToday ? 'var(--tri)' : 'var(--text)' }}>
                  {day.getDate()}
                </div>
                {dayActs.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {dayActs.length} {dayActs.length === 1 ? 'trening' : 'treningi'}
                  </div>
                )}
              </div>

              {/* Activities or rest */}
              <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                {dayActs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--border-md)', fontSize: 18, padding: '10px 0', userSelect: 'none' }}>—</div>
                ) : (
                  dayActs.map(a => <ActivityCard key={a.id} activity={a} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityCard({ activity: a }: { activity: Activity }) {
  const meta = TYPE_META[a.type] ?? TYPE_META.other;
  const totalZoneSec = a.zoneTimes ? a.zoneTimes.reduce((s, v) => s + v, 0) : 0;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: `0.5px solid ${meta.color}55`,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: 'var(--radius-sm)',
      padding: '7px 8px',
    }}>
      {/* Name */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
        {meta.icon} {a.name}
      </div>

      {/* Distance · time · pace */}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {a.distanceKm > 0 ? `${a.distanceKm} km · ` : ''}{a.timeFormatted}
        {a.paceOrSpeed ? ` · ${a.paceOrSpeed}` : ''}
      </div>

      {/* Quick metrics row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
        {a.avgHeartRate && <span style={{ fontSize: 10, color: '#d85a30' }}>❤️ {Math.round(a.avgHeartRate)}</span>}
        {a.avgWatts     && <span style={{ fontSize: 10, color: '#639922' }}>⚡{Math.round(a.avgWatts)}W</span>}
        {a.sufferScore  && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>🔥{a.sufferScore}</span>}
        {a.elevationGain > 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>↑{a.elevationGain}m</span>}
      </div>

      {/* HR Zone breakdown */}
      {a.zoneTimes && totalZoneSec > 0 && (
        <div style={{ marginTop: 6 }}>
          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1, marginBottom: 4 }}>
            {a.zoneTimes.map((sec, i) => {
              const pct = (sec / totalZoneSec) * 100;
              if (pct < 1) return null;
              return <div key={i} style={{ width: `${pct}%`, background: ZONE_COLORS[i], flexShrink: 0 }} />;
            })}
          </div>
          {/* Labels: Z1 15% (8min) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {a.zoneTimes.map((sec, i) => {
              const pct = totalZoneSec > 0 ? Math.round((sec / totalZoneSec) * 100) : 0;
              if (pct < 1) return null;
              const min = Math.floor(sec / 60);
              const s   = Math.round(sec % 60);
              const timeStr = min > 0 ? `${min}min${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    Z{i + 1} <strong style={{ color: ZONE_COLORS[i] }}>{pct}%</strong> <span style={{ opacity: 0.7 }}>({timeStr})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

