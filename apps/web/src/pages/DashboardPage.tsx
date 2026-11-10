import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { calculatePMC, type WeeklySummary } from '@tricoach/core';
import { supabase } from '../lib/supabase';
import TrendsChart from '../components/charts/TrendsChart';
import PMCChart from '../components/charts/PMCChart';
import TrainingInsights from '../components/athlete/TrainingInsights';
import SectionLabel from '../components/SectionLabel';
import UpcomingEvents from '../components/events/UpcomingEvents';

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
  const { isEnabled } = usePreferences();
  const [summaries, setSummaries]     = useState<WeeklySummary[]>([]);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState('');
  const [lastSynced, setLastSynced]   = useState<string | null>(null);
  const [lastSyncedMs, setLastSyncedMs] = useState<number | null>(null); // null=loading, 0=never
  const autoSyncDone = useRef(false);

  useEffect(() => {
    if (!user) return;
    loadSummaries();
  }, [user]);

  // Auto-sync if Strava is connected and data is stale (> 8h) or never synced
  useEffect(() => {
    if (lastSyncedMs === null || !session || !stravaToken || syncing || autoSyncDone.current) return;
    const staleMs = 8 * 60 * 60 * 1000;
    if (lastSyncedMs === 0 || (Date.now() - lastSyncedMs) > staleMs) {
      autoSyncDone.current = true;
      handleSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncedMs, session, stravaToken]);

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
      if (newest) {
        setLastSynced(new Date(newest).toLocaleDateString('pl-PL', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }));
        setLastSyncedMs(new Date(newest).getTime());
      } else {
        setLastSyncedMs(0);
      }
    } else {
      setLastSyncedMs(0); // no rows at all → trigger auto-sync
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
    <div className="dashboard">
      {/* ── HERO ── */}
      <section style={{ background: 'var(--bg-tertiary)', padding: '1.75rem 5vw 1.5rem' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4 }}>Dashboard</p>
              <h1 style={{ fontSize: 'clamp(22px,3vw,30px)', fontWeight: 700, letterSpacing: -1, lineHeight: 1.15 }}>
                Cześć, <em style={{ fontStyle: 'normal', color: 'var(--tri)' }}>{name}</em>!
              </h1>
            </div>

            {/* Sync button */}
            {stravaToken && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  {lastSynced && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ostatnio: {lastSynced}</span>}
                  {syncMsg && <span style={{ fontSize: 11, color: syncMsg.startsWith('Błąd') ? '#ef4444' : '#22c55e' }}>{syncMsg}</span>}
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', background: syncing ? 'var(--bg-secondary)' : 'var(--text)', color: syncing ? 'var(--text-secondary)' : 'var(--bg)', border: 'none', fontSize: 12, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
                >
                  {syncing ? '↻ Synchronizacja…' : '↻ Syncuj historię'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {noData ? (
        <>
          {user && <UpcomingEvents />}
          {/* ── NO DATA STATE ── */}
          <section>
            <div className="section-inner narrow" style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Brak danych historycznych</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.6 }}>
                Kliknij <strong>↻ Syncuj historię</strong> powyżej, żeby pobrać ostatnie 16 tygodni ze Stravy.<br />
                Trwa to chwilę — po synchronizacji zobaczysz trendy, PMC i predyktor wyścigu.
              </p>
              {!stravaToken && (
                <Link to="/athlete" className="btn-primary">Połącz Stravę →</Link>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          {/* ── THIS WEEK + FORM ── */}
          <section>
            <div className="section-inner">
              <div className="section-header">
                <SectionLabel discipline="tri">Ten tydzień</SectionLabel>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                {[
                  { label: 'Pływanie', color: 'var(--swim)', icon: '🏊', cur: thisWeek, prev: lastWeek, dist: (s: WeeklySummary) => s.swimDistKm, time: (s: WeeklySummary) => s.swimTimeMin },
                  { label: 'Rower',    color: 'var(--bike)', icon: '🚴', cur: thisWeek, prev: lastWeek, dist: (s: WeeklySummary) => s.bikeDistKm, time: (s: WeeklySummary) => s.bikeTimeMin },
                  { label: 'Bieg',     color: 'var(--run)',  icon: '🏃', cur: thisWeek, prev: lastWeek, dist: (s: WeeklySummary) => s.runDistKm,  time: (s: WeeklySummary) => s.runTimeMin  },
                ].map(({ label, color, icon, cur, prev, dist, time }) => {
                  const curDist = cur ? dist(cur) : 0;
                  const prevDist = prev ? dist(prev) : null;
                  const delta = prevDist != null ? curDist - prevDist : null;
                  return (
                    <div key={label} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', borderTop: `3px solid ${color}`, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{icon} {label}</div>
                      <div style={{ fontSize: 'clamp(16px,4.5vw,22px)', fontWeight: 700, color, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{curDist.toFixed(1)} km</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                        {cur ? `${Math.round(time(cur))} min` : '0 min'}
                        {delta != null && (
                          <span title="vs zeszły tydzień" style={{ marginLeft: 6, color: delta >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(1)} km
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PMC summary */}
              {currentPMC && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 10 }}>
                  {[
                    { label: 'CTL · forma bazowa', value: currentPMC.ctl, color: '#60a5fa', hint: currentPMC.ctl < 40 ? 'Budowanie' : currentPMC.ctl < 70 ? 'Dobra baza' : 'Wysoka forma' },
                    { label: 'ATL · zmęczenie',    value: currentPMC.atl, color: '#fb923c', hint: currentPMC.atl > currentPMC.ctl + 10 ? 'Duże zmęczenie' : 'OK' },
                    { label: 'Form · CTL−ATL',     value: currentPMC.tsb, color: currentPMC.tsb >= 0 ? '#22c55e' : '#ef4444', hint: currentPMC.tsb > 5 ? 'Wypoczęty' : currentPMC.tsb > -10 ? 'Optymalny' : 'Zmęczony' },
                  ].map(({ label, value, color, hint }) => (
                    <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                        <div style={{ fontSize: 10, color, fontWeight: 600 }}>{hint}</div>
                      </div>
                      <div style={{ fontSize: 'clamp(16px,4.5vw,22px)', fontWeight: 800, color }}>{value > 0 ? '+' : ''}{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── UPCOMING RACES ── */}
          {user && <UpcomingEvents />}

          {/* ── CHARTS: trends + PMC side by side ── */}
          <section className="alt">
            <div className="section-inner dash-grid-2">
              <div className="dash-card">
                <div className="dash-card-title">Trendy objętości</div>
                <div className="dash-card-sub">Ostatnie 12 tygodni · km</div>
                <TrendsChart data={summaries} metric="distance" />
              </div>
              <div className="dash-card">
                <div className="dash-card-title">Forma i zmęczenie (PMC)</div>
                <div className="dash-card-sub" title="CTL = forma bazowa budowana przez tygodnie · ATL = aktualne zmęczenie · Form = CTL − ATL, im wyżej, tym bardziej wypoczęty">
                  CTL forma bazowa · ATL zmęczenie · Form = CTL − ATL
                </div>
                <PMCChart data={pmc} />
              </div>
            </div>
          </section>

          {/* ── AI TRAINING INSIGHTS ── */}
          {isEnabled('run_technique_ai') && <TrainingInsights />}

          {/* ── QUICK NAV ── */}
          <section>
            <div className="section-inner">
              <div className="section-header">
                <SectionLabel discipline="tri">Coaching</SectionLabel>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { to:'/plan',       icon:'🗓️', label:'Plan',       color:'var(--tri)',  tabId: null },
                  { to:'/calculators', icon:'🧮', label:'Kalkulatory', color:'var(--tri)',  tabId: null },
                  { to:'/tri-coach',  icon:'🏅', label:'Tri Coach',  color:'var(--tri)',  tabId: 'tab_tri' },
                  { to:'/run-coach',  icon:'🏃', label:'Run Coach',  color:'var(--run)',  tabId: 'tab_run' },
                  { to:'/swim-coach', icon:'🏊', label:'Swim Coach', color:'var(--swim)', tabId: 'tab_swim' },
                  { to:'/bike-coach', icon:'🚴', label:'Bike Coach', color:'var(--bike)', tabId: 'tab_bike' },
                ].filter(c => !c.tabId || isEnabled(c.tabId as Parameters<typeof isEnabled>[0])).map(c => (
                  <Link key={c.to} to={c.to} style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none', background:'var(--bg)', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-md)', padding:'8px 14px', transition:'transform 0.15s, box-shadow 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=''; (e.currentTarget as HTMLElement).style.boxShadow=''; }}
                  >
                    <span style={{ fontSize: 18 }}>{c.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.color }}>{c.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
