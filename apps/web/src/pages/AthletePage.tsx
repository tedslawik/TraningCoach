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
  hasHeartRate: boolean; deviceWatts: boolean;
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

function fmtZone(z: { min: number; max: number }) {
  if (z.min <= 0) return `< ${z.max}`;
  if (z.max <= 0 || z.max === 9999) return `> ${z.min}`;
  return `${z.min} – ${z.max}`;
}

function relDate(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if (diff === 0) return 'dziś';
  if (diff === 1) return 'wczoraj';
  return `${diff}d temu`;
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
  const handleReconnect = async () => {
    if (!session) return;
    window.location.href = `/api/auth/strava?token=${session.access_token}`;
  };
  const [data, setData]       = useState<AthleteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    if (!session) { setLoading(false); return; }
    fetch('/api/strava/athlete', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: AthleteData) => {
        setData(d);
        buildAssessment(d);
      })
      .catch(() => setError('Nie udało się pobrać danych zawodnika.'))
      .finally(() => setLoading(false));
  }, [session]);

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
          <div className="section-header">
            <SectionLabel discipline="tri">Treningi</SectionLabel>
            <h2>Szczegóły ostatnich 7 dni</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activities.map(a => {
              const meta = TYPE_META[a.type] ?? TYPE_META.other;
              return (
                <div key={a.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', borderLeft: `4px solid ${meta.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>

                    {/* Left: name + tags */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                        {meta.icon} {a.name}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <Tag color={meta.color}>{meta.label}</Tag>
                        {a.distanceKm > 0 && <Tag>{a.distanceKm} km</Tag>}
                        <Tag>{a.timeFormatted}</Tag>
                        {a.paceOrSpeed && <Tag>{a.paceOrSpeed}</Tag>}
                        {a.elevationGain > 0 && <Tag>↑ {a.elevationGain} m</Tag>}
                      </div>
                    </div>

                    {/* Right: metrics */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      {a.avgHeartRate && (
                        <Metric icon="❤️" label="avg HR" value={`${Math.round(a.avgHeartRate)}`} unit="bpm" />
                      )}
                      {a.maxHeartRate && (
                        <Metric icon="⬆️" label="max HR" value={`${Math.round(a.maxHeartRate)}`} unit="bpm" />
                      )}
                      {a.avgWatts && (
                        <Metric icon="⚡" label="avg" value={`${Math.round(a.avgWatts)}`} unit="W" />
                      )}
                      {a.normalizedWatts && (
                        <Metric icon="📊" label="NP" value={`${Math.round(a.normalizedWatts)}`} unit="W" />
                      )}
                      {a.avgCadence && (
                        <Metric icon="🔄" label="kadencja" value={`${Math.round(a.avgCadence)}`} unit="rpm" />
                      )}
                      {a.kilojoules && (
                        <Metric icon="🔋" label="energia" value={`${a.kilojoules}`} unit="kJ" />
                      )}
                      {a.sufferScore && (
                        <Metric icon="🔥" label="Suffer" value={`${a.sufferScore}`} />
                      )}
                      {a.perceivedExertion && (
                        <Metric icon="💬" label="RPE" value={`${a.perceivedExertion}/10`} />
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {relDate(a.date as string)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {activities.length === 0 && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Brak aktywności w ostatnich 7 dniach.</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 4,
      background: color ? `${color}22` : 'var(--bg-secondary)',
      color: color ?? 'var(--text-secondary)',
      fontWeight: color ? 600 : 400, border: `0.5px solid ${color ? `${color}44` : 'var(--border)'}`,
    }}>
      {children}
    </span>
  );
}

function Metric({ icon, label, value, unit }: { icon: string; label: string; value: string; unit?: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 48 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
        {value}{unit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {icon} {label}
      </div>
    </div>
  );
}
