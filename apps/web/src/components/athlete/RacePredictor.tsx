import { useState } from 'react';
import { predictRaceTime, formatMinutes, type RaceType } from '@tricoach/core';
import type { WeeklySummary } from '@tricoach/core';

interface Props { summaries: WeeklySummary[]; }

const RACE_LABELS: Record<RaceType, string> = {
  sprint:  'Sprint (0.75/20/5)',
  olympic: 'Olympic (1.5/40/10)',
  half:    'Half Ironman (1.9/90/21)',
  full:    'Full Ironman (3.8/180/42)',
};

const RACE_DISTS: Record<RaceType, { swim: number; bike: number; run: number }> = {
  sprint:  { swim: 0.75, bike: 20,  run: 5    },
  olympic: { swim: 1.5,  bike: 40,  run: 10   },
  half:    { swim: 1.9,  bike: 90,  run: 21.1 },
  full:    { swim: 3.8,  bike: 180, run: 42.2 },
};

function avgPace(summaries: WeeklySummary[], discipline: 'swim' | 'bike' | 'run'): number | null {
  const recent = summaries.slice(-8); // last 8 weeks
  let dist = 0, time = 0;
  recent.forEach(s => {
    dist += discipline === 'swim' ? s.swimDistKm : discipline === 'bike' ? s.bikeDistKm : s.runDistKm;
    time += discipline === 'swim' ? s.swimTimeMin : discipline === 'bike' ? s.bikeTimeMin : s.runTimeMin;
  });
  if (dist < 0.1 || time < 1) return null;
  if (discipline === 'swim') return time / (dist * 10); // min/100m
  if (discipline === 'bike') return dist / (time / 60);  // km/h
  return time / dist; // min/km
}

function fmtPace(val: number | null, type: 'swim' | 'bike' | 'run'): string {
  if (val === null) return '—';
  if (type === 'bike') return `${val.toFixed(1)} km/h`;
  const m = Math.floor(val), s = Math.round((val - m) * 60);
  const unit = type === 'swim' ? '/100m' : '/km';
  return `${m}:${String(s).padStart(2, '0')} ${unit}`;
}

function Seg({ label, time, color }: { label: string; time: number | null; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{time != null ? formatMinutes(time) : '—'}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function RacePredictor({ summaries }: Props) {
  const [raceType, setRaceType] = useState<RaceType>('half');

  const swimPace = avgPace(summaries, 'swim');
  const bikeSpeed = avgPace(summaries, 'bike');
  const runPace  = avgPace(summaries, 'run');
  const pred     = predictRaceTime(raceType, swimPace, bikeSpeed, runPace);
  const dist     = RACE_DISTS[raceType];

  const dataCount = [swimPace, bikeSpeed, runPace].filter(Boolean).length;
  const confidence = dataCount === 3 ? 'Dobra' : dataCount === 2 ? 'Ograniczona' : 'Niska';
  const confColor  = dataCount === 3 ? '#22c55e' : dataCount === 2 ? '#fb923c' : '#ef4444';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>Predyktor czasu wyścigu</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Na podstawie ostatnich 8 tygodni treningów
          </div>
        </div>
        <select value={raceType} onChange={e => setRaceType(e.target.value as RaceType)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-md)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', cursor: 'pointer' }}>
          {(Object.entries(RACE_LABELS) as [RaceType, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Your paces */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: '1rem' }}>
        {[['🏊 Pływanie', 'swim' as const, 'var(--swim)'], ['🚴 Rower', 'bike' as const, 'var(--bike)'], ['🏃 Bieg', 'run' as const, 'var(--run)']].map(([label, disc, color]) => {
          const pace = disc === 'swim' ? swimPace : disc === 'bike' ? bikeSpeed : runPace;
          return (
            <div key={disc as string} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: color as string }}>{fmtPace(pace, disc as 'swim'|'bike'|'run')}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{label as string}</div>
            </div>
          );
        })}
      </div>

      {/* Predicted splits */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '8px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr auto 1fr', alignItems: 'center', gap: 0 }}>
          <Seg label={`🏊 ${dist.swim}km`}   time={pred.swimMin}  color="var(--swim)" />
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, padding: '0 4px' }}>T1<br /><span style={{ fontWeight: 700, color: 'var(--text)' }}>{pred.t1Min}min</span></div>
          <Seg label={`🚴 ${dist.bike}km`}   time={pred.bikeMin}  color="var(--bike)" />
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, padding: '0 4px' }}>T2<br /><span style={{ fontWeight: 700, color: 'var(--text)' }}>{pred.t2Min}min</span></div>
          <Seg label={`🏃 ${dist.run}km`}    time={pred.runMin}   color="var(--run)" />
          <div style={{ textAlign: 'center', color: 'var(--border-md)', fontSize: 20, padding: '0 4px' }}>=</div>
          <div style={{ textAlign: 'center', padding: '10px 0', gridColumn: 'span 3' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--tri)', letterSpacing: -1 }}>
              {pred.totalMin != null ? formatMinutes(pred.totalMin) : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Szacowany czas</div>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: confColor }} />
        Pewność predykcji: <strong style={{ color: confColor }}>{confidence}</strong>
        {dataCount < 3 && ' — potrzebujesz treningów ze wszystkich 3 dyscyplin.'}
      </div>
    </div>
  );
}
