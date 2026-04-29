import { useState, useEffect } from 'react';
import { predictRaceTime, formatMinutes, type RaceType, type WeeklySummary, RACE_LABELS } from '@tricoach/core';
import { useAuth } from '../../context/AuthContext';

interface Props { summaries: WeeklySummary[]; }

const RACE_DISTS: Record<RaceType, { swim: number; bike: number; run: number }> = {
  sprint:  { swim: 0.75, bike: 20,  run: 5    },
  olympic: { swim: 1.5,  bike: 40,  run: 10   },
  half:    { swim: 1.9,  bike: 90,  run: 21.1 },
  full:    { swim: 3.8,  bike: 180, run: 42.2 },
};

interface PRData {
  swimPace:  number | null;
  bikeSpeed: number | null;
  runPace:   number | null;
  counts:    { swim: number; bike: number; run: number };
  formatted: { swimPace: string | null; bikeSpeed: string | null; runPace: string | null };
}

function avgFromSummaries(summaries: WeeklySummary[], disc: 'swim' | 'bike' | 'run') {
  const recent = summaries.slice(-8);
  let dist = 0, time = 0;
  recent.forEach(s => {
    dist += disc === 'swim' ? s.swimDistKm : disc === 'bike' ? s.bikeDistKm : s.runDistKm;
    time += disc === 'swim' ? s.swimTimeMin : disc === 'bike' ? s.bikeTimeMin : s.runTimeMin;
  });
  if (dist < 0.1 || time < 1) return null;
  if (disc === 'bike') return dist / (time / 60);
  if (disc === 'swim') return time / (dist * 10);
  return time / dist;
}

function fmtPace(val: number | null, type: 'swim' | 'bike' | 'run'): string {
  if (val === null) return '—';
  if (type === 'bike') return `${val.toFixed(1)} km/h`;
  const m = Math.floor(val), s = Math.round((val - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}${type === 'swim' ? '/100m' : '/km'}`;
}

function Seg({ label, time, color }: { label: string; time: number | null; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>
        {time != null ? formatMinutes(time) : '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

type PaceSource = 'avg' | 'pr';

export default function RacePredictor({ summaries }: Props) {
  const { session } = useAuth();
  const [raceType, setRaceType]   = useState<RaceType>('half');
  const [source, setSource]       = useState<PaceSource>('avg');
  const [prs, setPrs]             = useState<PRData | null>(null);
  const [loadingPrs, setLoadingPrs] = useState(false);

  const dist = RACE_DISTS[raceType];

  // Avg-based paces from summaries
  const avgSwim  = avgFromSummaries(summaries, 'swim');
  const avgBike  = avgFromSummaries(summaries, 'bike');
  const avgRun   = avgFromSummaries(summaries, 'run');

  // Fetch PRs from Strava
  useEffect(() => {
    if (!session) return;
    setLoadingPrs(true);
    fetch('/api/strava/prs', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPrs(d); })
      .catch(() => {})
      .finally(() => setLoadingPrs(false));
  }, [session]);

  // Switch to PR source automatically when PRs load (if at least 2 disciplines have data)
  useEffect(() => {
    if (prs && [prs.swimPace, prs.bikeSpeed, prs.runPace].filter(Boolean).length >= 2) {
      setSource('pr');
    }
  }, [prs]);

  const activePaces = source === 'pr' && prs
    ? { swim: prs.swimPace,  bike: prs.bikeSpeed,  run: prs.runPace  }
    : { swim: avgSwim,       bike: avgBike,         run: avgRun       };

  const pred = predictRaceTime(raceType, activePaces.swim, activePaces.bike, activePaces.run);

  const dataCount = [activePaces.swim, activePaces.bike, activePaces.run].filter(Boolean).length;
  const confidence = dataCount === 3 ? 'Dobra' : dataCount === 2 ? 'Ograniczona' : 'Niska';
  const confColor  = dataCount === 3 ? '#22c55e' : dataCount === 2 ? '#fb923c' : '#ef4444';

  return (
    <div className="card">
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>Predyktor czasu wyścigu</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {source === 'pr' ? 'Na podstawie Twoich rekordów ze Stravy (top 25% wyników)' : 'Na podstawie średnich z ostatnich 8 tygodni treningów'}
          </div>
        </div>
        <select
          value={raceType}
          onChange={e => setRaceType(e.target.value as RaceType)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-md)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', cursor: 'pointer' }}
        >
          {(Object.entries(RACE_LABELS) as [RaceType, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Source toggle */}
      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 3, marginBottom: '1rem', gap: 3, width: 'fit-content' }}>
        {(['avg', 'pr'] as PaceSource[]).map(s => (
          <button
            key={s}
            onClick={() => setSource(s)}
            disabled={s === 'pr' && !prs}
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-md)', border: 'none',
              fontSize: 12, fontWeight: source === s ? 600 : 400,
              fontFamily: 'var(--font)', cursor: s === 'pr' && !prs ? 'not-allowed' : 'pointer',
              background: source === s ? 'var(--bg)' : 'transparent',
              color: source === s ? 'var(--text)' : 'var(--text-secondary)',
              boxShadow: source === s ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              opacity: s === 'pr' && !prs && !loadingPrs ? 0.45 : 1,
              transition: 'all 0.15s',
            }}
          >
            {s === 'avg' ? '📊 Średnie treningowe' : loadingPrs ? '⏳ Pobieranie rekordów…' : '🏆 Rekordy osobiste'}
          </button>
        ))}
      </div>

      {/* Pace comparison table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '1rem' }}>
        {(['swim', 'bike', 'run'] as const).map(disc => {
          const avgVal = disc === 'bike' ? avgBike : disc === 'swim' ? avgSwim : avgRun;
          const prVal  = disc === 'bike' ? prs?.bikeSpeed : disc === 'swim' ? prs?.swimPace : prs?.runPace;
          const prFmt  = disc === 'bike' ? prs?.formatted.bikeSpeed : disc === 'swim' ? prs?.formatted.swimPace : prs?.formatted.runPace;
          const icon   = disc === 'swim' ? '🏊' : disc === 'bike' ? '🚴' : '🏃';
          const color  = disc === 'swim' ? 'var(--swim)' : disc === 'bike' ? 'var(--bike)' : 'var(--run)';
          const label  = disc === 'swim' ? 'Pływanie' : disc === 'bike' ? 'Rower' : 'Bieg';

          // PR better than avg?
          let delta: string | null = null;
          if (avgVal && prVal) {
            const diff = disc === 'bike'
              ? ((prVal - avgVal) / avgVal * 100)   // higher speed = better
              : ((avgVal - prVal) / avgVal * 100);   // lower pace = better
            if (Math.abs(diff) > 0.5) delta = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
          }

          return (
            <div key={disc} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px', borderTop: `2px solid ${color}` }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>{icon} {label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Śr. treningowe</span>
                  <span style={{ fontSize: 12, fontWeight: source === 'avg' ? 700 : 400, color: source === 'avg' ? 'var(--text)' : 'var(--text-secondary)' }}>
                    {fmtPace(avgVal, disc)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Rekord (top 25%)</span>
                  <span style={{ fontSize: 12, fontWeight: source === 'pr' ? 700 : 400, color: source === 'pr' ? color : 'var(--text-secondary)' }}>
                    {prFmt ?? (loadingPrs ? '…' : '—')}
                  </span>
                </div>
                {delta && (
                  <div style={{ fontSize: 10, color: '#22c55e', textAlign: 'right', fontWeight: 600 }}>
                    Rekord szybszy o {delta}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Predicted splits */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '8px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr auto 1fr', alignItems: 'center' }}>
          <Seg label={`🏊 ${dist.swim}km`}  time={pred.swimMin}  color="var(--swim)" />
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11, padding: '0 4px' }}>T1<br /><strong style={{ color: 'var(--text)' }}>{pred.t1Min}min</strong></div>
          <Seg label={`🚴 ${dist.bike}km`}  time={pred.bikeMin}  color="var(--bike)" />
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11, padding: '0 4px' }}>T2<br /><strong style={{ color: 'var(--text)' }}>{pred.t2Min}min</strong></div>
          <Seg label={`🏃 ${dist.run}km`}   time={pred.runMin}   color="var(--run)" />
          <div style={{ textAlign: 'center', color: 'var(--border-md)', fontSize: 20, padding: '0 4px' }}>=</div>
          <div style={{ textAlign: 'center', padding: '10px 0', gridColumn: 'span 3' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--tri)', letterSpacing: -1 }}>
              {pred.totalMin != null ? formatMinutes(pred.totalMin) : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
              Szacowany czas · {source === 'pr' ? 'rekordy' : 'średnia'}
            </div>
          </div>
        </div>
      </div>

      {/* Confidence + note */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: confColor, flexShrink: 0 }} />
        <span>Pewność: <strong style={{ color: confColor }}>{confidence}</strong></span>
        {source === 'pr' && prs && (
          <span style={{ opacity: 0.7 }}>
            · Rekordy z {prs.counts.swim} pływań, {prs.counts.bike} jazd, {prs.counts.run} biegów
          </span>
        )}
        {dataCount < 3 && (
          <span> — potrzebujesz danych ze wszystkich 3 dyscyplin.</span>
        )}
      </div>
    </div>
  );
}
