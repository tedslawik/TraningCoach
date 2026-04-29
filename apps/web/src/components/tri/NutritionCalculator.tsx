import { useState, useEffect, useMemo } from 'react';
import {
  generateNutritionPlan, predictRaceTime, formatMinutes,
  type NutritionPlan, type RaceType, type WeeklySummary,
  RACE_LABELS,
} from '@tricoach/core';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

/* ── helpers ── */
function avgPaceSummaries(summaries: WeeklySummary[], disc: 'swim' | 'bike' | 'run') {
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

function parseTimeInput(val: string): number | null {
  // accepts HH:MM or plain minutes
  if (!val) return null;
  if (val.includes(':')) {
    const [h, m] = val.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function fmtHHMM(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/* ── stat cards ── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, opacity: 0.7 }}>{sub}</div>}
    </div>
  );
}

function SegHeader({ icon, label, time, color }: { icon: string; label: string; time: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatMinutes(time)}</div>
      </div>
    </div>
  );
}

/* ── main component ── */
export default function NutritionCalculator() {
  const { user } = useAuth();
  const [raceType, setRaceType]     = useState<RaceType>('half');
  const [timeInput, setTimeInput]   = useState('');
  const [weight, setWeight]         = useState(75);
  const [summaries, setSummaries]   = useState<WeeklySummary[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('weekly_summaries').select('*').eq('user_id', user.id).order('week_start', { ascending: true })
      .then(({ data }) => {
        if (data?.length) setSummaries(data.map(r => ({
          weekStart: r.week_start, swimDistKm: r.swim_dist_km, swimTimeMin: r.swim_time_min,
          bikeDistKm: r.bike_dist_km, bikeTimeMin: r.bike_time_min,
          runDistKm: r.run_dist_km, runTimeMin: r.run_time_min,
          sufferScore: r.suffer_score, tss: r.tss, kilojoules: r.kilojoules,
        })));
      });
  }, [user]);

  // Auto-predict from Strava history
  const prediction = useMemo(() => {
    if (!summaries.length) return null;
    const pred = predictRaceTime(
      raceType,
      avgPaceSummaries(summaries, 'swim'),
      avgPaceSummaries(summaries, 'bike'),
      avgPaceSummaries(summaries, 'run'),
    );
    return pred.totalMin != null ? pred : null;
  }, [summaries, raceType]);

  const effectiveMin = parseTimeInput(timeInput) ?? prediction?.totalMin ?? null;

  const plan: NutritionPlan | null = effectiveMin
    ? generateNutritionPlan(raceType, effectiveMin, weight, {
        swimMin: prediction?.swimMin ?? null,
        bikeMin: prediction?.bikeMin ?? null,
        runMin:  prediction?.runMin  ?? null,
      })
    : null;

  return (
    <div>
      {/* ── Inputs ── */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'end' }}>

          <div>
            <div className="workout-label">Format wyścigu</div>
            <select value={raceType} onChange={e => { setRaceType(e.target.value as RaceType); setTimeInput(''); }} style={{ width: '100%' }}>
              {(Object.entries(RACE_LABELS) as [RaceType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="workout-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Planowany czas</span>
              {prediction?.totalMin && (
                <button
                  onClick={() => setTimeInput(fmtHHMM(prediction.totalMin!))}
                  style={{ fontSize: 10, color: 'var(--tri)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  Użyj przewidzianego ↑
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={prediction?.totalMin ? fmtHHMM(prediction.totalMin) : 'HH:MM'}
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                style={{ width: '100%' }}
              />
              {prediction?.totalMin && !timeInput && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-secondary)', pointerEvents: 'none' }}>
                  auto
                </div>
              )}
            </div>
            {prediction?.totalMin && (
              <div style={{ fontSize: 11, color: 'var(--tri)', marginTop: 4 }}>
                Twój przewidziany czas: <strong>{formatMinutes(prediction.totalMin)}</strong>
                {prediction.swimMin && ` (${formatMinutes(prediction.swimMin)} / ${formatMinutes(prediction.bikeMin!)} / ${formatMinutes(prediction.runMin!)})`}
              </div>
            )}
          </div>

          <div>
            <div className="workout-label">Waga</div>
            <div className="input-row">
              <input type="number" value={weight} onChange={e => setWeight(+e.target.value)} min={40} max={120} style={{ width: 80 }} />
              <span className="input-unit">kg</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Plan ── */}
      {plan ? (
        <>
          {/* Pre-race */}
          <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--tri)' }}>
            <SegHeader icon="☀️" label="Przed startem" time={0} color="var(--tri)" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <StatCard label="Posiłek węglowodanowy" value={`${plan.preRaceCarbs} g`} sub={`${plan.preRaceMin} min przed startem`} color="var(--tri)" />
              <StatCard label="Ostatni żel/banan" value="30 min" sub="przed startem — prostych cukrów" />
              <StatCard label="Nawodnienie" value="500 ml" sub="do 60 min przed startem" />
            </div>
          </div>

          {/* Swim */}
          <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--swim)' }}>
            <SegHeader icon="🏊" label="Pływanie" time={plan.swimMin} color="var(--swim)" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <StatCard label="Kalorie" value="0" sub="brak możliwości jedzenia" />
              <StatCard label="Tempo" sub="aerobowe — oszczędzaj energię" value="Z2" />
              <StatCard label="Nawodnienie" value="—" sub="wejdź nawodniony" />
            </div>
          </div>

          {/* Bike */}
          <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--bike)' }}>
            <SegHeader icon="🚴" label="Rower" time={plan.bikeMin} color="var(--bike)" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              <StatCard label="Węgle / h" value={`${plan.bikeCarbs_ph} g`} color="var(--bike)" />
              <StatCard label="Płyny / h" value={`${plan.bikeFluids_ph} ml`} color="var(--bike)" />
              <StatCard label="Sód / h" value={`${plan.bikeSodium_ph} mg`} color="var(--bike)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <StatCard label="Żele łącznie" value={`${plan.bikeGels} szt.`} sub={`co ~${Math.round(plan.bikeMin / Math.max(plan.bikeGels, 1))} min`} />
              {plan.bikeBars > 0 && <StatCard label="Batony" value={`${plan.bikeBars} szt.`} sub="pierwsze 2/3 trasy" />}
              <StatCard label="Bidony 500ml" value={`${plan.bikeBottles} szt.`} sub={`izotonik + woda`} />
              <StatCard label="Łącznie węgle" value={`${plan.bikeCarbs} g`} sub={`${Math.round(plan.bikeCarbs * 4)} kcal`} />
            </div>
          </div>

          {/* Run */}
          <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--run)' }}>
            <SegHeader icon="🏃" label="Bieg" time={plan.runMin} color="var(--run)" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              <StatCard label="Węgle / h" value={`${plan.runCarbs_ph} g`} color="var(--run)" />
              <StatCard label="Płyny / h" value={`${plan.runFluids_ph} ml`} sub="z punktów żywienia" color="var(--run)" />
              <StatCard label="Sód / h" value={`${plan.runSodium_ph} mg`} color="var(--run)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <StatCard label="Żele łącznie" value={`${plan.runGels} szt.`} sub={`co ~30–35 min`} />
              <StatCard label="Łącznie węgle" value={`${plan.runCarbs} g`} sub={`${Math.round(plan.runCarbs * 4)} kcal`} />
              <StatCard label="Płyny" value="punkty żyw." sub="biegaj przez każdy" />
            </div>
          </div>

          {/* Summary */}
          <div style={{ background: 'var(--text)', color: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, marginBottom: 12 }}>
              Łącznie do zabrania
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                ['Żele', `${plan.bikeGels + plan.runGels} szt.`],
                ...(plan.bikeBars > 0 ? [['Batony', `${plan.bikeBars} szt.`]] : []),
                ['Bidony', `${plan.bikeBottles} szt.`],
                ['Węgle łącznie', `${plan.bikeCarbs + plan.runCarbs} g`],
                ['Energia łącznie', `${Math.round((plan.bikeCarbs + plan.runCarbs) * 4)} kcal`],
              ].map(([l, v]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Key rules */}
          <div className="card">
            <div className="card-title">💡 Kluczowe zasady</div>
            {plan.keyRules.map((r, i) => (
              <div key={i} className="tip-item">{r}</div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 14 }}>
          {summaries.length === 0 && !user
            ? 'Zaloguj się i zsynchronizuj Stravę, aby zobaczyć przewidziany czas automatycznie.'
            : 'Wybierz format wyścigu i wpisz planowany czas (lub zaloguj się ze Stravą).'}
        </div>
      )}
    </div>
  );
}
