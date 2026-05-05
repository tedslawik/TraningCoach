import type { LapSummary } from '@tricoach/core';

export interface StreamData {
  activityId: number;
  name:       string;
  sportType:  string;
  startDate:  string;
  time:       number[];
  distance:   number[];
  altitude:   number[];
  heartrate:  number[];
  velocity:   number[];
  cadence:    number[];
  watts:      number[];
  hrZones:    Array<{min:number; max:number}> | null;
  laps:       LapSummary[];
  stats: {
    totalDistKm:   number;
    totalTimeSec:  number;
    elevGain:      number;
    avgHeartRate:  number | null;
    maxHeartRate:  number | null;
    avgVelocityMs:   number | null;
    avgWatts:        number | null;
    normalizedPower: number | null;
  };
}

const HR_ZONE_COLORS  = ['#93c5fd','#86efac','#fde047','#fb923c','#f87171'];
const HR_ZONE_LABELS  = ['Z1','Z2','Z3','Z4','Z5'];
const ELEV_COLOR      = '#4ade80';
const SPEED_COLOR     = '#60a5fa';

/* ── helpers ── */
function normalize(arr: number[], min?: number, max?: number) {
  const lo = min ?? Math.min(...arr);
  const hi = max ?? Math.max(...arr);
  const range = hi - lo || 1;
  return arr.map(v => (v - lo) / range);
}

function toPolyline(xs: number[], ys: number[], W: number, H: number, padL: number, padR: number, padT: number, padB: number) {
  const cw = W - padL - padR;
  const ch = H - padT - padB;
  return xs.map((x, i) => `${(padL + x * cw).toFixed(1)},${(padT + (1 - ys[i]) * ch).toFixed(1)}`).join(' ');
}

function smoothed(arr: number[], window = 5): number[] {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window), i + window + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

function fmtPace(ms: number, sport: string): string {
  if (sport === 'Ride' || sport === 'VirtualRide') {
    return `${(ms * 3.6).toFixed(1)} km/h`;
  }
  if (ms <= 0) return '—';
  const secPerKm = 1000 / ms;
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2,'0')} /km`;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

/* ── Elevation chart ── */
function ElevationChart({ distance, altitude, elevGain }: { distance: number[]; altitude: number[]; elevGain: number }) {
  if (!altitude.length || !distance.length) return null;
  const W = 800, H = 140, pL = 44, pR = 12, pT = 10, pB = 22;
  const minAlt = Math.min(...altitude), maxAlt = Math.max(...altitude);

  const xNorm = normalize(distance);
  const yNorm = normalize(altitude, minAlt, maxAlt);
  const pts   = toPolyline(xNorm, yNorm, W, H, pL, pR, pT, pB);

  const cw = W - pL - pR, ch = H - pT - pB;
  const polyFill = `${pL},${pT + ch} ` + pts + ` ${pL + cw},${pT + ch}`;

  const altRange = maxAlt - minAlt;
  const yTicks   = [minAlt, minAlt + altRange * 0.5, maxAlt].map(v => Math.round(v));
  const distTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const v = distance[Math.floor(p * (distance.length - 1))] / 1000;
    return { p, label: `${v.toFixed(0)}km` };
  });

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>Profil terenu</span>
        <span style={{ color: ELEV_COLOR }}>↑ {elevGain} m przewyższenia</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <linearGradient id="elev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ELEV_COLOR} stopOpacity="0.6" />
            <stop offset="100%" stopColor={ELEV_COLOR} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {yTicks.map(v => {
          const y = pT + (1 - (v - minAlt) / (altRange || 1)) * (H - pT - pB);
          return <g key={v}>
            <line x1={pL} y1={y} x2={W - pR} y2={y} stroke="var(--border)" strokeWidth={0.5} />
            <text x={pL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{v}m</text>
          </g>;
        })}
        <polygon points={polyFill} fill="url(#elev-grad)" />
        <polyline points={pts} fill="none" stroke={ELEV_COLOR} strokeWidth={1.5} strokeLinejoin="round" />
        {distTicks.map(({ p, label }) => (
          <text key={p} x={pL + p * (W - pL - pR)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{label}</text>
        ))}
      </svg>
    </div>
  );
}

/* ── HR chart ── */
function HeartRateChart({ time, heartrate, hrZones }: { time: number[]; heartrate: number[]; hrZones: Array<{min:number;max:number}> | null }) {
  if (!heartrate.length) return null;
  const W = 800, H = 150, pL = 44, pR = 12, pT = 10, pB = 22;

  const maxHR = Math.max(...heartrate);
  const minHR = Math.max(0, Math.min(...heartrate) - 10);
  const sm    = smoothed(heartrate, 8);

  const xNorm = normalize(time);
  const yNorm = sm.map(v => (v - minHR) / (maxHR - minHR || 1));
  const pts   = toPolyline(xNorm, yNorm, W, H, pL, pR, pT, pB);
  const cw = W - pL - pR, ch = H - pT - pB;

  const hrRange = maxHR - minHR || 1;

  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const sec = time[Math.floor(p * (time.length - 1))] ?? 0;
    const m = Math.floor(sec / 60);
    return { p, label: `${m}min` };
  });

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 6 }}>
        Tętno (uśrednione)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {/* HR zone bands */}
        {hrZones && hrZones.map((z, i) => {
          const lo = Math.max(minHR, z.min <= 0 ? 0 : z.min);
          const hi = Math.min(maxHR + 20, z.max <= 0 ? maxHR + 20 : z.max);
          if (hi <= minHR) return null;
          const y1 = pT + (1 - (hi - minHR) / hrRange) * ch;
          const y2 = pT + (1 - (lo - minHR) / hrRange) * ch;
          return <rect key={i} x={pL} y={Math.max(pT, y1)} width={cw} height={Math.min(ch, y2 - Math.max(pT, y1))} fill={HR_ZONE_COLORS[i]} opacity={0.15} />;
        })}
        {/* Zone labels on right */}
        {hrZones && hrZones.map((z, i) => {
          const mid = ((z.min <= 0 ? 0 : z.min) + (z.max <= 0 ? maxHR + 20 : z.max)) / 2;
          if (mid < minHR || mid > maxHR + 20) return null;
          const y = pT + (1 - (mid - minHR) / hrRange) * ch;
          return <text key={i} x={W - pR + 2} y={y + 3} fontSize={8} fill={HR_ZONE_COLORS[i]} fontWeight={700}>{HR_ZONE_LABELS[i]}</text>;
        })}
        {/* Grid */}
        {[minHR, Math.round((minHR + maxHR) / 2), maxHR].map(v => {
          const y = pT + (1 - (v - minHR) / hrRange) * ch;
          return <g key={v}>
            <line x1={pL} y1={y} x2={W - pR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,4" />
            <text x={pL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{Math.round(v)}</text>
          </g>;
        })}
        <polyline points={pts} fill="none" stroke="#f87171" strokeWidth={1.5} strokeLinejoin="round" />
        {timeTicks.map(({ p, label }) => (
          <text key={p} x={pL + p * cw} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{label}</text>
        ))}
      </svg>
      {/* Zone legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
        {hrZones && hrZones.map((z, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, background: HR_ZONE_COLORS[i], borderRadius: 2 }} />
            {HR_ZONE_LABELS[i]}: {z.min <= 0 ? '<' : z.min}–{z.max <= 0 ? 'max' : z.max} bpm
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Pace / Speed chart ── */
function PaceChart({ time, velocity, sportType }: { time: number[]; velocity: number[]; sportType: string }) {
  if (!velocity.length || velocity.every(v => v === 0)) return null;
  const W = 800, H = 140, pL = 44, pR = 12, pT = 10, pB = 22;

  const isRide = ['Ride','VirtualRide','EBikeRide'].includes(sportType);
  const isSwim = ['Swim','OpenWaterSwim'].includes(sportType);

  // Convert velocity m/s → display units
  const converted = velocity.map(v => {
    if (isRide) return v * 3.6; // km/h
    if (isSwim) return v > 0 ? (100 / v) / 60 : 0; // min/100m
    return v > 0 ? (1000 / v) / 60 : 0; // min/km
  });

  const sm      = smoothed(converted, 10);
  const validSm = sm.filter(v => v > 0 && v < (isRide ? 80 : isSwim ? 10 : 20));
  if (!validSm.length) return null;

  const minV = Math.min(...validSm), maxV = Math.max(...validSm);
  // For pace (lower = better), flip Y axis
  const yNorm = sm.map(v => {
    const clamped = Math.max(minV, Math.min(maxV, v));
    return isRide ? (clamped - minV) / (maxV - minV || 1) : 1 - (clamped - minV) / (maxV - minV || 1);
  });
  const xNorm = normalize(time);
  const pts   = toPolyline(xNorm, yNorm, W, H, pL, pR, pT, pB);
  const cw    = W - pL - pR;
  const unit  = isRide ? 'km/h' : isSwim ? 'min/100m' : 'min/km';

  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const sec = time[Math.floor(p * (time.length - 1))] ?? 0;
    return { p, label: `${Math.floor(sec / 60)}min` };
  });

  const yTicks = [minV, (minV + maxV) / 2, maxV].map(v => ({
    v,
    label: isRide
      ? `${v.toFixed(0)}km/h`
      : (() => { const m = Math.floor(v), s = Math.round((v - m) * 60); return `${m}:${String(s).padStart(2,'0')}`; })(),
    yNorm: isRide ? (v - minV) / (maxV - minV || 1) : 1 - (v - minV) / (maxV - minV || 1),
  }));

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 6 }}>
        {isRide ? 'Prędkość' : isSwim ? 'Tempo (/100m)' : 'Tempo (/km)'} · {unit}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {yTicks.map(({ v, label, yNorm: yn }) => {
          const y = pT + (1 - yn) * (H - pT - pB);
          return <g key={v}>
            <line x1={pL} y1={y} x2={W - pR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,4" />
            <text x={pL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{label}</text>
          </g>;
        })}
        <polyline points={pts} fill="none" stroke={SPEED_COLOR} strokeWidth={1.5} strokeLinejoin="round" />
        {timeTicks.map(({ p, label }) => (
          <text key={p} x={pL + p * cw} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{label}</text>
        ))}
      </svg>
    </div>
  );
}

/* ── Cadence: optimal range depends on pace ── */
function optimalCadenceRange(avgVelMs: number | null): [number, number] {
  if (!avgVelMs || avgVelMs <= 0) return [170, 180];
  const paceMinKm = 1000 / (avgVelMs * 60);
  if (paceMinKm > 7.0)  return [155, 168];
  if (paceMinKm > 6.0)  return [160, 172];
  if (paceMinKm > 5.0)  return [165, 176];
  if (paceMinKm > 4.5)  return [170, 180];
  if (paceMinKm > 4.0)  return [172, 182];
  return [175, 186];
}

/* ── Cadence chart ── */
function CadenceChart({ time, cadence, avgVelocityMs }: { time: number[]; cadence: number[]; avgVelocityMs?: number | null }) {
  if (!cadence.length) return null;
  const W = 800, H = 130, pL = 44, pR = 12, pT = 10, pB = 22;

  const sm = smoothed(cadence, 12);
  const validCad = sm.filter(v => v > 60 && v < 250);
  if (!validCad.length) return null;

  const [optLo, optHi] = optimalCadenceRange(avgVelocityMs ?? null);
  const minC = Math.max(120, Math.min(...validCad, optLo) - 5);
  const maxC = Math.min(220, Math.max(...validCad, optHi) + 5);
  const avgC = Math.round(validCad.reduce((s,v)=>s+v,0)/validCad.length);

  const xNorm = normalize(time);
  const yNorm = sm.map(v => Math.max(0, Math.min(1, (v - minC) / (maxC - minC || 1))));
  const pts   = toPolyline(xNorm, yNorm, W, H, pL, pR, pT, pB);
  const cw = W - pL - pR, ch = H - pT - pB;

  // Dynamic optimal zone based on pace
  const yOptLo  = pT + (1 - (optLo - minC) / (maxC - minC || 1)) * ch;
  const yOptHi  = pT + (1 - (optHi - minC) / (maxC - minC || 1)) * ch;
  const optTop  = Math.max(pT, Math.min(yOptLo, yOptHi));
  const optH    = Math.abs(yOptHi - yOptLo);

  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const sec = time[Math.floor(p * (time.length - 1))] ?? 0;
    return { p, label: `${Math.floor(sec/60)}min` };
  });

  const cadColor = avgC < 165 ? '#f87171' : avgC < 175 ? '#fbbf24' : '#34d399';

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
        <span>Kadencja</span>
        <span style={{ color: cadColor }}>śr. {avgC} spm {avgC < 165 ? '↓ za niska' : avgC >= 170 && avgC <= 185 ? '✓ optymalna' : avgC > 185 ? '↑ wysoka' : '→ zbliżona do optymalnej'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', display:'block' }}>
        {/* Dynamic optimal zone band */}
        <rect x={pL} y={Math.max(pT, optTop)} width={cw} height={Math.min(ch, optH)} fill="#34d399" opacity={0.15} />
        <text x={W - pR + 2} y={Math.min(pT + ch - 2, optTop + optH/2 + 3)} fontSize={8} fill="#34d399" fontWeight={700}>OPT</text>

        {/* Y ticks */}
        {[minC, Math.round((minC+maxC)/2), maxC].map(v => {
          const y = pT + (1 - (v - minC)/(maxC - minC || 1)) * ch;
          return <g key={v}>
            <line x1={pL} y1={y} x2={W-pR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,4" />
            <text x={pL-4} y={y+4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{v}</text>
          </g>;
        })}

        <polyline points={pts} fill="none" stroke={cadColor} strokeWidth={1.5} strokeLinejoin="round" />

        {timeTicks.map(({ p, label }) => (
          <text key={p} x={pL + p*cw} y={H-4} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{label}</text>
        ))}
      </svg>
      <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:4 }}>
        Optymalny zakres dla tego tempa: <span style={{ color:'#34d399', fontWeight:600 }}>{optLo}–{optHi} spm</span>
        {avgC < optLo - 5 && ' — kadencja poniżej optymalnej dla tego tempa (skróć krok)'}
        {avgC >= optLo && avgC <= optHi && ' ✓ kadencja w optymalnym zakresie'}
        {avgC > optHi && ' — kadencja nieco powyżej normy (akceptowalne dla intensywnych treningów)'}
      </div>
    </div>
  );
}

/* ── Power chart ── */
function PowerChart({ time, watts, avgWatts, normalizedWatts }: {
  time: number[]; watts: number[];
  avgWatts: number | null; normalizedWatts: number | null;
}) {
  if (!watts.length || watts.every(v => v === 0)) return null;
  const W = 800, H = 150, pL = 48, pR = 12, pT = 10, pB = 22;

  const sm      = smoothed(watts, 10);
  const valid   = sm.filter(v => v > 0 && v < 2000);
  if (!valid.length) return null;

  const minW  = Math.max(0, Math.min(...valid) - 20);
  const maxW  = Math.max(...valid) + 20;
  const xNorm = normalize(time);
  const yNorm = sm.map(v => Math.max(0, Math.min(1, (Math.max(0, v) - minW) / (maxW - minW || 1))));
  const pts   = toPolyline(xNorm, yNorm, W, H, pL, pR, pT, pB);
  const cw    = W - pL - pR, ch = H - pT - pB;

  const avg = avgWatts ?? (valid.length ? Math.round(valid.reduce((s,v)=>s+v,0)/valid.length) : null);
  const np  = normalizedWatts;

  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const sec = time[Math.floor(p*(time.length-1))] ?? 0;
    return { p, label: `${Math.floor(sec/60)}min` };
  });

  const yTicks = [minW, Math.round((minW+maxW)/2), maxW].map(v => ({
    v, y: pT + (1-(v-minW)/(maxW-minW||1))*ch,
  }));

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:6, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <span>Moc</span>
        <div style={{ display:'flex', gap:14 }}>
          {avg && <span style={{ color:'#34d399' }}>śr. <strong>{avg} W</strong></span>}
          {np  && <span style={{ color:'#7c3aed' }}>NP <strong>{np} W</strong></span>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', display:'block' }}>
        {/* Y grid */}
        {yTicks.map(({ v, y }) => (
          <g key={v}>
            <line x1={pL} y1={y} x2={W-pR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,4" />
            <text x={pL-4} y={y+4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{v}W</text>
          </g>
        ))}

        {/* Average watts line */}
        {avg && (() => {
          const y = pT + (1-(avg-minW)/(maxW-minW||1))*ch;
          return <line x1={pL} y1={y} x2={W-pR} y2={y} stroke="#34d399" strokeWidth={1} strokeDasharray="5,3" />;
        })()}

        {/* NP line */}
        {np && (() => {
          const y = pT + (1-(np-minW)/(maxW-minW||1))*ch;
          return <line x1={pL} y1={y} x2={W-pR} y2={y} stroke="#7c3aed" strokeWidth={1} strokeDasharray="2,4" />;
        })()}

        {/* Power line */}
        <polyline points={pts} fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeLinejoin="round" />

        {/* X labels */}
        {timeTicks.map(({ p, label }) => (
          <text key={p} x={pL+p*cw} y={H-4} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{label}</text>
        ))}
      </svg>
      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--text-secondary)', marginTop:4, flexWrap:'wrap' }}>
        <span><span style={{ color:'#fbbf24' }}>—</span> Moc bieżąca (smooth)</span>
        {avg && <span><span style={{ color:'#34d399' }}>- -</span> Śr. moc {avg} W</span>}
        {np  && <span><span style={{ color:'#7c3aed' }}>· ·</span> NP {np} W</span>}
      </div>
    </div>
  );
}

/* ── Main export ── */
export default function ActivityCharts({ data }: { data: StreamData }) {
  const { stats, sportType } = data;
  const isRide = ['Ride','VirtualRide','EBikeRide'].includes(sportType);

  const avgCadence = data.cadence.length > 0
    ? Math.round(data.cadence.reduce((s, v) => s + v, 0) / data.cadence.length)
    : null;

  // Efficiency Factor = pace_m_per_min / avg_HR × 100 (higher = more efficient)
  const ef = stats.avgVelocityMs && stats.avgHeartRate && stats.avgHeartRate > 0
    ? Math.round((stats.avgVelocityMs * 60 / stats.avgHeartRate) * 1000) / 10
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Key stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10 }}>
        {[
          ['Dystans',  `${stats.totalDistKm} km`],
          ['Czas',     fmtTime(stats.totalTimeSec)],
          ['Przewyżs.', stats.elevGain > 0 ? `${stats.elevGain} m` : null],
          ['Śr. HR',   stats.avgHeartRate ? `${stats.avgHeartRate} bpm` : null],
          ['Max HR',   stats.maxHeartRate ? `${stats.maxHeartRate} bpm` : null],
          isRide
            ? ['Śr. moc', stats.avgWatts ? `${stats.avgWatts} W` : null]
            : ['Śr. tempo', stats.avgVelocityMs ? fmtPace(stats.avgVelocityMs, sportType) : null],
          isRide ? ['NP', (stats as unknown as Record<string,unknown>).normalizedPower ? `${(stats as unknown as Record<string,number>).normalizedPower} W` : null] : ['', null],
          ['Kadencja', avgCadence ? `${avgCadence} spm` : null],
          ['EF',       ef ? `${ef}` : null],
        ].filter(([, v]) => v).map(([l, v]) => (
          <div key={l as string} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {data.altitude.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <ElevationChart distance={data.distance} altitude={data.altitude} elevGain={stats.elevGain} />
        </div>
      )}
      {data.heartrate.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <HeartRateChart time={data.time} heartrate={data.heartrate} hrZones={data.hrZones} />
        </div>
      )}
      {data.velocity.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <PaceChart time={data.time} velocity={data.velocity} sportType={sportType} />
        </div>
      )}

      {data.watts.length > 0 && data.watts.some(v => v > 0) && (
        <div className="card" style={{ marginBottom: 0 }}>
          <PowerChart
            time={data.time}
            watts={data.watts}
            avgWatts={data.stats.avgWatts}
            normalizedWatts={data.stats.normalizedPower}
          />
        </div>
      )}
      {data.cadence.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <CadenceChart time={data.time} cadence={data.cadence} avgVelocityMs={data.stats.avgVelocityMs} />
        </div>
      )}

      {data.altitude.length === 0 && data.heartrate.length === 0 && data.velocity.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
          Brak danych strumieniowych dla tej aktywności.
        </p>
      )}
    </div>
  );
}
