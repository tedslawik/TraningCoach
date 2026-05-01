import { useMemo } from 'react';
import { analyzeRunStream, analyzeRunLaps, type RunAnalysis, type RunInterval } from '@tricoach/core';
import type { StreamData } from '../charts/ActivityCharts';

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

function fmtPace(minKm: number): string {
  if (!minKm || minKm > 30) return '—';
  const m = Math.floor(minKm), s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtDist(m: number): string {
  if (m < 950) return `${Math.round(m / 25) * 25} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
}

function HRBadge({ bpm, hrZones }: { bpm: number | null; hrZones: Array<{min:number;max:number}> | null }) {
  if (!bpm) return null;
  let zone = 1;
  if (hrZones) {
    for (let i = 0; i < hrZones.length; i++) {
      const lo = hrZones[i].min <= 0 ? 0 : hrZones[i].min;
      const hi = hrZones[i].max <= 0 ? 999 : hrZones[i].max;
      if (bpm >= lo && bpm < hi) { zone = i + 1; break; }
    }
  }
  const zoneColors = ['#60a5fa','#34d399','#fbbf24','#fb923c','#f87171'];
  const color = zoneColors[zone - 1] ?? '#9ca3af';
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      ❤️ {bpm} <span style={{ fontWeight: 400, opacity: 0.8 }}>Z{zone}</span>
    </span>
  );
}

function IntervalRow({ iv, color, hrZones }: { iv: RunInterval; color: string; hrZones: Array<{min:number;max:number}> | null }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: `${color}0d`,
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${color}33`,
    }}>
      <div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginRight: 10 }}>
          {fmtDist(iv.distM)}
        </span>
        <span style={{ fontSize: 14, color }}>
          {fmtPace(iv.paceMinKm)}
        </span>
      </div>
      <HRBadge bpm={iv.avgHR} hrZones={hrZones} />
      {iv.restSec > 5 && (
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>
          przerwa {fmtSec(iv.restSec)}
        </span>
      )}
    </div>
  );
}

function PhaseRow({ label, distKm, avgHR, hrZones }: { label: string; distKm: number; avgHR: number | null; hrZones: Array<{min:number;max:number}> | null; color?: string }) {
  if (distKm < 0.1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 14px' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        <span style={{ fontWeight: 600, color: 'var(--text)', marginRight: 8 }}>{label}</span>
        {distKm.toFixed(1)} km
      </span>
      <HRBadge bpm={avgHR} hrZones={hrZones} />
    </div>
  );
}

/* ── Compute avg HR for warmup/cooldown from stream data ── */
function hrForPhase(
  data: StreamData,
  phaseKm: number,
  fromEnd = false,
): number | null {
  if (!data.heartrate.length || !data.distance.length) return null;
  const phaseM   = phaseKm * 1000;
  const totalM   = data.distance[data.distance.length - 1] ?? 0;
  const startM   = fromEnd ? totalM - phaseM : 0;
  const endM     = fromEnd ? totalM : phaseM;

  const vals: number[] = [];
  for (let i = 0; i < data.distance.length; i++) {
    const d = data.distance[i];
    if (d >= startM && d <= endM && data.heartrate[i] > 40) {
      vals.push(data.heartrate[i]);
    }
  }
  return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
}

/* ── Main component ── */
export default function RunSummaryNote({ data }: { data: StreamData }) {
  if (!RUN_TYPES.has(data.sportType)) return null;

  const analysis: RunAnalysis | null = useMemo(() => {
    // Prefer lap-based analysis (athlete pressed lap button = clean data)
    if (data.laps?.length >= 4) {
      const lapResult = analyzeRunLaps(data.laps);
      if (lapResult && lapResult.confidence !== 'low') return lapResult;
    }
    // Fall back to stream-based analysis
    return analyzeRunStream(data.time, data.distance, data.velocity, data.heartrate);
  }, [data]);

  if (!analysis) return null;

  const { typeColor, trainingType, confidence, warmupKm, cooldownKm, sets, intervals, avgHR } = analysis;

  const warmupHR   = hrForPhase(data, warmupKm, false);
  const cooldownHR = hrForPhase(data, cooldownKm, true);

  const isSteady   = trainingType !== 'Trening interwałowy'
                  && trainingType !== 'Trening interwałowy mieszany'
                  && trainingType !== 'Bieg tempo';

  return (
    <div style={{
      border:       `1.5px solid ${typeColor}55`,
      borderLeft:   `4px solid ${typeColor}`,
      borderRadius: 'var(--radius-lg)',
      overflow:     'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: `${typeColor}18`,
        padding:    '10px 14px',
        display:    'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏃</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: typeColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {trainingType}
            </div>
            {!isSteady && sets > 1 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                {sets} {sets === 1 ? 'seria' : sets < 5 ? 'serie' : 'serii'}
                {intervals.length > 1 ? ` · ${intervals.length} typy interwałów` : ''}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {avgHR && <HRBadge bpm={avgHR} hrZones={data.hrZones} />}
          {confidence !== 'high' && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.7 }}>szacunkowo</span>
          )}
        </div>
      </div>

      {/* Steady run */}
      {isSteady && intervals[0] && (
        <div style={{ padding: '10px 14px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{analysis.totalKm} km</span>
          </div>
          {intervals[0].paceMinKm > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: typeColor }}>{fmtPace(intervals[0].paceMinKm)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>śr. tempo</div>
            </div>
          )}
          {avgHR && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f87171' }}>{avgHR} bpm</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>śr. HR</div>
            </div>
          )}
        </div>
      )}

      {/* Interval/tempo structure */}
      {!isSteady && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Warmup */}
          <PhaseRow label="Rozgrzewka" distKm={warmupKm} avgHR={warmupHR} hrZones={data.hrZones} color={typeColor} />

          {/* Intervals */}
          <div style={{ padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sets > 1 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                {sets}× powtórzenie bloku:
              </div>
            )}
            {intervals.map((iv, i) => (
              <IntervalRow key={i} iv={iv} color={typeColor} hrZones={data.hrZones} />
            ))}
          </div>

          {/* Cooldown */}
          <PhaseRow label="Schłodzenie" distKm={cooldownKm} avgHR={cooldownHR} hrZones={data.hrZones} color={typeColor} />
        </div>
      )}
    </div>
  );
}
