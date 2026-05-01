import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { calculatePMC, type WeeklySummary } from '@tricoach/core';
import { supabase } from '../lib/supabase';
import TrendsChart from '../components/charts/TrendsChart';
import PMCChart from '../components/charts/PMCChart';
import RacePredictor from '../components/athlete/RacePredictor';
import SectionLabel from '../components/SectionLabel';

function getMonday(d: Date) {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const m = new Date(d); m.setDate(m.getDate() - (day - 1)); m.setHours(0, 0, 0, 0); return m;
}

// Use local date, NOT toISOString() — that converts to UTC which shifts the date for UTC+X timezones
function toLocalKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const { session, user, stravaToken } = useAuth();
  const [summaries, setSummaries]   = useState<WeeklySummary[]>([]);
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState('');
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSummaries();
  }, [user]);

  const loadSummaries = async () => {
    const { data } = await supabase
      .from('weekly_summaries')
      .select('*')
      .eq('user_id', user!.id)
      .order('week_start', { ascending: true });

    if (data?.length) {
      const mapped: WeeklySummary[] = data.map(r => ({
        weekStart:   r.week_start,
        swimDistKm:  r.swim_dist_km,  swimTimeMin: r.swim_time_min,
        bikeDistKm:  r.bike_dist_km,  bikeTimeMin: r.bike_time_min,
        runDistKm:   r.run_dist_km,   runTimeMin:  r.run_time_min,
        sufferScore: r.suffer_score,  tss: r.tss,  kilojoules: r.kilojoules,
      }));
      setSummaries(mapped);
      const newest = data[data.length - 1]?.synced_at;
      if (newest) setLastSynced(new Date(newest).toLocaleDateString('pl-PL', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }));
    }
  };

  const handleSync = async () => {
    if (!session || !stravaToken) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/strava/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`Zsynchronizowano ${data.weeks} tygodni (${data.activities} aktywności)`);
        await loadSummaries();
      } else {
        setSyncMsg(`Błąd: ${data.error}`);
      }
    } catch {
      setSyncMsg('Błąd połączenia');
    } finally {
      setSyncing(false);
    }
  };

  // Current week stats
  const thisMonday   = getMonday(new Date());
  const lastMonday   = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
  const thisWeekKey  = toLocalKey(thisMonday);
  const lastWeekKey  = toLocalKey(lastMonday);
  const thisWeek     = summaries.find(s => s.weekStart === thisWeekKey);
  const lastWeek     = summaries.find(s => s.weekStart === lastWeekKey);

  const pmc = calculatePMC(summaries);
  const currentPMC = pmc[pmc.length - 1];

  const name = stravaToken?.athlete_name ?? user?.email?.split('@')[0] ?? 'Triathlonisto';

  const noData = summaries.length === 0;

  return (
    <>
      {/* ── HERO ── */}
      <section style={{ background: 'var(--bg-tertiary)', padding: '3rem 5vw 2.5rem' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 8 }}>Dashboard</p>
              <h1 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1 }}>
                Cześć, <em style={{ fontStyle: 'normal', color: 'var(--tri)' }}>{name}</em>!
              </h1>
            </div>

            {/* Sync button */}
            {stravaToken && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', background: syncing ? 'var(--bg-secondary)' : 'var(--text)', color: syncing ? 'var(--text-secondary)' : 'var(--bg)', border: 'none', fontSize: 13, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
                >
                  {syncing ? 'Synchronizacja…' : '↻ Syncuj historię'}
                </button>
                {lastSynced && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ostatnio: {lastSynced}</span>}
                {syncMsg && <span style={{ fontSize: 11, color: syncMsg.startsWith('Błąd') ? '#ef4444' : '#22c55e' }}>{syncMsg}</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {noData ? (
        /* ── NO DATA STATE ── */
        <section>
          <div className="section-inner narrow" style={{ textAlign: 'center', padding: '4rem 5vw' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Brak danych historycznych</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
              Kliknij <strong>↻ Syncuj historię</strong> powyżej, żeby pobrać ostatnie 16 tygodni ze Stravy.<br />
              Trwa to chwilę — po synchronizacji zobaczysz trendy, PMC i predyktor wyścigu.
            </p>
            {!stravaToken && (
              <Link to="/athlete" className="btn-primary">Połącz Stravę →</Link>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* ── THIS WEEK vs LAST WEEK ── */}
          <section>
            <div className="section-inner">
              <div className="section-header">
                <SectionLabel discipline="tri">Ten tydzień</SectionLabel>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {[
                  { label: 'Pływanie', color: 'var(--swim)', icon: '🏊', cur: thisWeek, prev: lastWeek, dist: (s: WeeklySummary) => s.swimDistKm, time: (s: WeeklySummary) => s.swimTimeMin },
                  { label: 'Rower',    color: 'var(--bike)', icon: '🚴', cur: thisWeek, prev: lastWeek, dist: (s: WeeklySummary) => s.bikeDistKm, time: (s: WeeklySummary) => s.bikeTimeMin },
                  { label: 'Bieg',     color: 'var(--run)',  icon: '🏃', cur: thisWeek, prev: lastWeek, dist: (s: WeeklySummary) => s.runDistKm,  time: (s: WeeklySummary) => s.runTimeMin  },
                ].map(({ label, color, icon, cur, prev, dist, time }) => {
                  const curDist = cur ? dist(cur) : 0;
                  const prevDist = prev ? dist(prev) : null;
                  const delta = prevDist != null ? curDist - prevDist : null;
                  return (
                    <div key={label} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', borderTop: `3px solid ${color}` }}>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{icon} {label}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{curDist.toFixed(1)} km</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {cur ? `${Math.round(time(cur))} min` : '0 min'}
                        {delta != null && (
                          <span style={{ marginLeft: 8, color: delta >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(1)} km vs zeszły tydzień
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PMC summary */}
              {currentPMC && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 16 }}>
                  {[
                    { label: 'CTL — forma bazowa', value: currentPMC.ctl, color: '#60a5fa', hint: currentPMC.ctl < 40 ? 'Budowanie' : currentPMC.ctl < 70 ? 'Dobra baza' : 'Wysoka forma' },
                    { label: 'ATL — zmęczenie',    value: currentPMC.atl, color: '#fb923c', hint: currentPMC.atl > currentPMC.ctl + 10 ? 'Duże zmęczenie' : 'OK' },
                    { label: 'Form (CTL−ATL)',      value: currentPMC.tsb, color: currentPMC.tsb >= 0 ? '#22c55e' : '#ef4444', hint: currentPMC.tsb > 5 ? 'Wypoczęty' : currentPMC.tsb > -10 ? 'Optymalny' : 'Zmęczony' },
                  ].map(({ label, value, color, hint }) => (
                    <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 10, color, fontWeight: 600 }}>{hint}</div>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value > 0 ? '+' : ''}{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── TRENDS CHART ── */}
          <section className="alt">
            <div className="section-inner">
              <div className="section-header">
                <SectionLabel discipline="tri">Trendy objętości</SectionLabel>
                <h2>Ostatnie 12 tygodni</h2>
              </div>
              <TrendsChart data={summaries} metric="distance" />
            </div>
          </section>

          {/* ── PMC CHART ── */}
          <section>
            <div className="section-inner">
              <div className="section-header">
                <SectionLabel discipline="tri">Performance Management Chart</SectionLabel>
                <h2>Forma, zmęczenie i gotowość</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong>CTL</strong> (niebieska) = forma bazowa budowana przez tygodnie. <strong>ATL</strong> (pomarańczowa) = aktualne zmęczenie. <strong>Form</strong> (zielona/przerywana) = CTL−ATL — im wyższy, tym bardziej wypoczęty.
                </p>
              </div>
              <PMCChart data={pmc} />
            </div>
          </section>

          {/* ── RACE PREDICTOR ── */}
          <section className="alt">
            <div className="section-inner narrow">
              <div className="section-header">
                <SectionLabel discipline="tri">Predyktor wyścigu</SectionLabel>
                <h2>Szacowany czas na podstawie treningów</h2>
              </div>
              <RacePredictor summaries={summaries} />
            </div>
          </section>

          {/* ── QUICK NAV ── */}
          <section>
            <div className="section-inner">
              <div className="section-header center">
                <h2>Coaching</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 12 }}>
                {[
                  { to:'/plan',       icon:'🗓️', label:'Plan',       color:'var(--tri)' },
                  { to:'/analyzer',   icon:'📊', label:'Analizator', color:'var(--tri)' },
                  { to:'/tri-coach',  icon:'🏅', label:'Tri Coach',  color:'var(--tri)' },
                  { to:'/run-coach',  icon:'🏃', label:'Run Coach',  color:'var(--run)' },
                  { to:'/swim-coach', icon:'🏊', label:'Swim Coach', color:'var(--swim)' },
                  { to:'/bike-coach', icon:'🚴', label:'Bike Coach', color:'var(--bike)' },
                ].map(c => (
                  <Link key={c.to} to={c.to} style={{ display:'block', textDecoration:'none', background:'var(--bg)', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-lg)', padding:'1.25rem', textAlign:'center', transition:'transform 0.15s, box-shadow 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow='0 8px 24px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=''; (e.currentTarget as HTMLElement).style.boxShadow=''; }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{c.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: c.color }}>{c.label}</div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
