import { useState, useRef } from 'react';
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
  if (sport === 'Ride' || sport === 'VirtualRide' || sport === 'EBikeRide') {
    return `${(ms * 3.6).toFixed(1)} km/h`;
  }
  if (ms <= 0) return '—';
  if (sport === 'Swim' || sport === 'OpenWaterSwim') {
    const secPer100m = 100 / ms;
    const m = Math.floor(secPer100m / 60), s = Math.round(secPer100m % 60);
    return `${m}:${String(s).padStart(2,'0')} /100m`;
  }
  const secPerKm = 1000 / ms;
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2,'0')} /km`;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}:${String(s).padStart(2,'0')} min`;
  return `${s} s`;
}

/* ── Range selection (brush) ── */
const BRUSH_COLOR = '#7c3aed';

interface Selection { startPct: number; endPct: number; }
type BrushProps = { selection?: Selection | null; onSelect?: (s: Selection | null) => void };

function useBrush(W: number, pL: number, pR: number, selection: Selection | null | undefined, onSelect: ((s: Selection | null) => void) | undefined) {
  const svgRef       = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef<number | null>(null);

  const svgX = (clientX: number) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  };
  const xToPct = (x: number) => Math.max(0, Math.min(1, (x - pL) / (W - pL - pR)));

  if (!onSelect) return { svgRef, handlers: {} as React.SVGAttributes<SVGSVGElement> };

  return {
    svgRef,
    handlers: {
      style: { cursor: 'crosshair' as const, userSelect: 'none' as const },
      onMouseDown: (e: React.MouseEvent) => {
        const p = xToPct(svgX(e.clientX));
        dragStartRef.current = p;
        onSelect({ startPct: p, endPct: p });
      },
      onMouseMove: (e: React.MouseEvent) => {
        if (dragStartRef.current === null) return;
        const p = xToPct(svgX(e.clientX));
        const start = dragStartRef.current;
        onSelect({ startPct: Math.min(start, p), endPct: Math.max(start, p) });
      },
      onMouseUp: () => {
        if (dragStartRef.current !== null && selection && Math.abs(selection.endPct - selection.startPct) < 0.005) {
          onSelect(null);
        }
        dragStartRef.current = null;
      },
      onMouseLeave: () => { dragStartRef.current = null; },
    } as React.SVGAttributes<SVGSVGElement>,
  };
}

function BrushOverlay({ sel, W, pL, pR, pT, ch }: { sel: Selection | null | undefined; W: number; pL: number; pR: number; pT: number; ch: number }) {
  if (!sel) return null;
  const pctToX = (p: number) => pL + p * (W - pL - pR);
  const x1 = pctToX(sel.startPct);
  const x2 = pctToX(sel.endPct);
  if (x2 - x1 < 1) return null;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x1} y={pT} width={x2 - x1} height={ch} fill={BRUSH_COLOR} opacity={0.16} />
      <line x1={x1} y1={pT} x2={x1} y2={pT + ch} stroke={BRUSH_COLOR} strokeWidth={1.2} />
      <line x1={x2} y1={pT} x2={x2} y2={pT + ch} stroke={BRUSH_COLOR} strokeWidth={1.2} />
    </g>
  );
}

/* Per-chart range stats helper */
function rangeIndices(time: number[], sel: Selection) {
  const N = time.length;
  if (N < 2) return null;
  const startIdx = Math.max(0, Math.floor(sel.startPct * (N - 1)));
  const endIdx   = Math.min(N - 1, Math.ceil(sel.endPct * (N - 1)));
  if (endIdx - startIdx < 1) return null;
  return { startIdx, endIdx, duration: (time[endIdx] ?? 0) - (time[startIdx] ?? 0) };
}

function RangeTooltip({ sel, W, pL, pR, pT, lines, color }: {
  sel: Selection | null | undefined;
  W: number; pL: number; pR: number; pT: number;
  lines: string[];
  color: string;
}) {
  if (!sel || !lines.length) return null;
  const pctToX = (p: number) => pL + p * (W - pL - pR);
  const cx = (pctToX(sel.startPct) + pctToX(sel.endPct)) / 2;

  const padX = 7, padY = 5, lineH = 12, fontSize = 10.5;
  // ~5.8 px per character at fontSize 10.5
  const maxChars = Math.max(...lines.map(l => l.length));
  const boxW = Math.max(60, maxChars * 5.8 + padX * 2);
  const boxH = lines.length * lineH + padY * 2;
  // Clamp inside chart area
  let boxX = cx - boxW / 2;
  boxX = Math.max(pL + 2, Math.min(W - pR - boxW - 2, boxX));
  const boxY = pT + 3;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={boxX} y={boxY} width={boxW} height={boxH}
        fill="var(--bg)" stroke={color} strokeWidth={1}
        rx={4} ry={4} opacity={0.97} />
      {lines.map((line, i) => (
        <text key={i}
          x={boxX + boxW / 2}
          y={boxY + padY + (i + 0.82) * lineH}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={600}
          fill="var(--text)">
          {line}
        </text>
      ))}
    </g>
  );
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
function HeartRateChart({ time, heartrate, hrZones, selection, onSelect }: { time: number[]; heartrate: number[]; hrZones: Array<{min:number;max:number}> | null } & BrushProps) {
  if (!heartrate.length) return null;
  const W = 800, H = 150, pL = 44, pR = 12, pT = 10, pB = 22;
  const { svgRef, handlers } = useBrush(W, pL, pR, selection, onSelect);

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
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} {...handlers} style={{ width: '100%', display: 'block', ...handlers.style }}>
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
        <BrushOverlay sel={selection} W={W} pL={pL} pR={pR} pT={pT} ch={ch} />
        {(() => {
          if (!selection) return null;
          const r = rangeIndices(time, selection);
          if (!r) return null;
          const hr = heartrate.slice(r.startIdx, r.endIdx + 1).filter(v => v > 0);
          if (!hr.length) return null;
          const avg = Math.round(hr.reduce((s,v)=>s+v,0)/hr.length);
          const max = Math.round(Math.max(...hr));
          const min = Math.round(Math.min(...hr));
          return <RangeTooltip sel={selection} W={W} pL={pL} pR={pR} pT={pT} color="#f87171"
            lines={[fmtTime(r.duration), `Śr ${avg} bpm`, `${min} – ${max}`]} />;
        })()}
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
function PaceChart({ time, velocity, sportType, selection, onSelect }: { time: number[]; velocity: number[]; sportType: string } & BrushProps) {
  if (!velocity.length || velocity.every(v => v === 0)) return null;
  const W = 800, H = 140, pL = 44, pR = 12, pT = 10, pB = 22;
  const { svgRef, handlers } = useBrush(W, pL, pR, selection, onSelect);
  const ch = H - pT - pB;

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
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} {...handlers} style={{ width: '100%', display: 'block', ...handlers.style }}>
        {yTicks.map(({ v, label, yNorm: yn }) => {
          const y = pT + (1 - yn) * (H - pT - pB);
          return <g key={v}>
            <line x1={pL} y1={y} x2={W - pR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,4" />
            <text x={pL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{label}</text>
          </g>;
        })}
        <polyline points={pts} fill="none" stroke={SPEED_COLOR} strokeWidth={1.5} strokeLinejoin="round" />
        <BrushOverlay sel={selection} W={W} pL={pL} pR={pR} pT={pT} ch={ch} />
        {(() => {
          if (!selection) return null;
          const r = rangeIndices(time, selection);
          if (!r) return null;
          const vel = velocity.slice(r.startIdx, r.endIdx + 1).filter(v => v > 0);
          if (!vel.length) return null;
          const avg = vel.reduce((s,v)=>s+v,0)/vel.length;
          // Distance via velocity * time integration (or zero if not avail)
          let dist = 0;
          for (let i = r.startIdx; i < r.endIdx; i++) {
            const dt = (time[i+1] ?? 0) - (time[i] ?? 0);
            if (dt > 0 && dt < 60) dist += (velocity[i] ?? 0) * dt;
          }
          const label = isRide ? 'Śr. prędkość' : isSwim ? 'Tempo /100m' : 'Śr. tempo';
          const lines = [
            fmtTime(r.duration),
            ...(dist > 30 ? [`${(dist/1000).toFixed(2)} km`] : []),
            `${label.replace('Śr. ', 'Śr ')} ${fmtPace(avg, sportType).replace(' ', '')}`,
          ];
          return <RangeTooltip sel={selection} W={W} pL={pL} pR={pR} pT={pT} color={SPEED_COLOR} lines={lines} />;
        })()}
        {timeTicks.map(({ p, label }) => (
          <text key={p} x={pL + p * cw} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{label}</text>
        ))}
      </svg>
    </div>
  );
}

/* ── Cadence: optimal range depends on sport and pace ── */
const BIKE_SPORTS = new Set(['Ride','VirtualRide','EBikeRide','Velomobile','Handcycle']);

function optimalCadenceRange(avgVelMs: number | null, sportType?: string): [number, number] {
  if (BIKE_SPORTS.has(sportType ?? '')) return [85, 95]; // cycling RPM
  // Running — pace-dependent
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
const SWIM_SPORTS_C = new Set(['Swim','OpenWaterSwim']);

function CadenceChart({ time, cadence, avgVelocityMs, sportType, selection, onSelect }: { time: number[]; cadence: number[]; avgVelocityMs?: number | null; sportType?: string } & BrushProps) {
  const isSwimC = SWIM_SPORTS_C.has(sportType ?? '');
  if (!cadence.length) return null;
  const W = 800, H = 130, pL = 44, pR = 12, pT = 10, pB = 22;
  const { svgRef, handlers } = useBrush(W, pL, pR, selection, onSelect);

  const sm = smoothed(cadence, 12);
  const validCad = sm.filter(v => v > 60 && v < 250);
  if (!validCad.length) return null;

  const isBike = BIKE_SPORTS.has(sportType ?? '');
  const [optLoRaw, optHiRaw] = isSwimC ? [55, 75] : optimalCadenceRange(avgVelocityMs ?? null, sportType);
  const [optLo, optHi] = [optLoRaw, optHiRaw];
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

  const cadColor = isBike
    ? (avgC < 75 ? '#f87171' : avgC < optLo ? '#fbbf24' : avgC <= optHi ? '#34d399' : '#fbbf24')
    : (avgC < 165 ? '#f87171' : avgC < 175 ? '#fbbf24' : '#34d399');

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
        <span>{isSwimC ? 'Tempo uderzeń' : isBike ? 'Kadencja (RPM)' : 'Kadencja (spm)'}</span>
        <span style={{ color: cadColor }}>
          śr. {avgC} {isSwimC ? 'ud/min' : isBike ? 'RPM' : 'spm'}{' '}
          {avgC < optLo ? '↓ za niska' : avgC <= optHi ? '✓ optymalna' : '↑ wysoka'}
        </span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} {...handlers} style={{ width:'100%', display:'block', ...handlers.style }}>
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
        <BrushOverlay sel={selection} W={W} pL={pL} pR={pR} pT={pT} ch={ch} />
        {(() => {
          if (!selection) return null;
          const r = rangeIndices(time, selection);
          if (!r) return null;
          const c = cadence.slice(r.startIdx, r.endIdx + 1).filter(v => v > 60);
          if (!c.length) return null;
          const avg = Math.round(c.reduce((s,v)=>s+v,0)/c.length);
          const unit = isSwimC ? 'ud/min' : isBike ? 'RPM' : 'spm';
          return <RangeTooltip sel={selection} W={W} pL={pL} pR={pR} pT={pT} color={cadColor}
            lines={[fmtTime(r.duration), `Śr ${avg} ${unit}`]} />;
        })()}

        {timeTicks.map(({ p, label }) => (
          <text key={p} x={pL + p*cw} y={H-4} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{label}</text>
        ))}
      </svg>
      <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:4 }}>
        {isSwimC ? (
          <>Typowy zakres: <span style={{ color:'#34d399', fontWeight:600 }}>{optLo}–{optHi} ud/min</span>
          {avgC < optLo && ' — wolne uderzenia, pracuj nad szybkością cyklu'}
          {avgC >= optLo && avgC <= optHi && ' ✓ tempo uderzeń w typowym zakresie'}
          {avgC > optHi && ' — szybkie uderzenia (charakter pływaka sprintującego)'}</>
        ) : isBike ? (
          <>Optymalny zakres: <span style={{ color:'#34d399', fontWeight:600 }}>{optLo}–{optHi} RPM</span>
          {avgC < optLo && ' — zwiększ kadencję, mniejszy opór na pedały'}
          {avgC >= optLo && avgC <= optHi && ' ✓ kadencja w optymalnym zakresie'}
          {avgC > optHi && ' — wysoka kadencja, ok na sprint/płaski teren'}</>
        ) : (
          <>Optymalny zakres dla tego tempa: <span style={{ color:'#34d399', fontWeight:600 }}>{optLo}–{optHi} spm</span>
          {avgC < optLo - 5 && ' — kadencja poniżej optymalnej (skróć krok)'}
          {avgC >= optLo && avgC <= optHi && ' ✓ kadencja w optymalnym zakresie'}
          {avgC > optHi && ' — nieco powyżej normy (ok dla intensywnych treningów)'}</>
        )}
      </div>
    </div>
  );
}

/* ── Swim laps chart (per marked segment, width ∝ distance) ── */
function SwimLapsChart({ laps }: { laps: LapSummary[] }) {
  const valid = laps.filter(l => l.distM >= 5 && l.timeSec > 0);
  if (!valid.length) return null;

  const W = 800, H = 200, pL = 44, pR = 14, pT = 28, pB = 32;
  const cw = W - pL - pR, ch = H - pT - pB;
  const N = valid.length;

  const fmtSec = (s: number) => {
    const m = Math.floor(s / 60), ss = Math.round(s % 60);
    return m > 0 ? `${m}:${String(ss).padStart(2,'0')}` : `${ss}s`;
  };
  const fmtPaceS100 = (sec100: number) => {
    const m = Math.floor(sec100 / 60), s = Math.round(sec100 % 60);
    return `${m}:${String(s).padStart(2,'0')}/100m`;
  };

  const totalDist = valid.reduce((s, l) => s + l.distM, 0);
  const totalTime = valid.reduce((s, l) => s + l.timeSec, 0);
  const lapPace100 = (l: LapSummary) => (l.timeSec / l.distM) * 100;
  const avgPace    = (totalTime / totalDist) * 100;
  const fastestPace = Math.min(...valid.map(lapPace100));
  const maxTime    = Math.max(...valid.map(l => l.timeSec));
  const yMax       = maxTime * 1.1;

  // Pool length detection (uniform → show, varied → skip)
  const distBuckets = new Set(valid.map(l => Math.round(l.distM / 5) * 5));
  const poolLen = distBuckets.size <= 2 ? valid[0].distM : null;

  // Bar layout — width proportional to distance
  const gap     = N > 30 ? 0 : 1;
  const usableW = cw - gap * (N - 1);
  let cumD = 0;
  const bars = valid.map((l, i) => {
    const x = pL + (cumD / totalDist) * usableW + i * gap;
    cumD += l.distM;
    const w = Math.max(3, (l.distM / totalDist) * usableW);
    const h = (l.timeSec / yMax) * ch;
    const y = pT + ch - h;
    const pace = lapPace100(l);
    const dev  = (pace - avgPace) / avgPace;
    const color = dev < -0.05 ? '#22c55e'
                : dev >  0.10 ? '#f87171'
                : dev >  0.05 ? '#fbbf24'
                : '#60a5fa';
    return { x, y, w, h, color, l, i, pace };
  });

  // Stroke / SWOLF aggregates (per length normalized for varied distances:
  // strokes_per_100m for comparison — but classic SWOLF still useful per lap)
  const withCad = valid.filter(l => l.avgCadence && l.avgCadence > 0);
  const swolfsPer100 = withCad.map(l => {
    const strokes100 = (l.avgCadence! / 60) * (l.timeSec * 100 / l.distM);
    const time100    = (l.timeSec * 100) / l.distM;
    return Math.round(strokes100 + time100);
  });
  const avgSwolf = swolfsPer100.length ? Math.round(swolfsPer100.reduce((a,b)=>a+b,0)/swolfsPer100.length) : null;
  const minSwolf = swolfsPer100.length ? Math.min(...swolfsPer100) : null;
  const allStrokesPer100 = withCad.map(l => (l.avgCadence! / 60) * (l.timeSec * 100 / l.distM));
  const avgStrokes100 = allStrokesPer100.length ? Math.round(allStrokesPer100.reduce((a,b)=>a+b,0)/allStrokesPer100.length) : null;

  const yTicks = [0, Math.round(maxTime/2), maxTime];

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:6, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <span>Czas / odcinek</span>
        <span style={{ color:'var(--text-secondary)', fontWeight:600, textTransform:'none', letterSpacing:0 }}>
          {poolLen ? `${poolLen} m basen · ` : ''}{N} {N === 1 ? 'odcinek' : N < 5 ? 'odcinki' : 'odcinków'} · szerokość = dystans
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', display:'block' }}>
        {/* Y ticks (time) */}
        {yTicks.map(v => {
          const y = pT + (1 - v / yMax) * ch;
          return <g key={v}>
            <line x1={pL} y1={y} x2={W-pR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,4" />
            <text x={pL-4} y={y+3} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{fmtSec(v)}</text>
          </g>;
        })}

        {/* Bars */}
        {bars.map(b => {
          const strokes = b.l.avgCadence ? Math.round((b.l.avgCadence/60) * b.l.timeSec) : null;
          const swolf   = strokes !== null ? strokes + b.l.timeSec : null;
          return (
            <g key={b.i}>
              <rect x={b.x} y={b.y} width={b.w} height={Math.max(0, b.h)} fill={b.color} opacity={0.88} rx={1}>
                <title>{`Odcinek ${b.i+1}: ${b.l.distM}m w ${fmtSec(b.l.timeSec)} (${fmtPaceS100(b.pace)})${strokes !== null ? ` · ${strokes} ruchów` : ''}${swolf !== null ? ` · SWOLF ${swolf}` : ''}${b.l.avgHR ? ` · ${Math.round(b.l.avgHR)} bpm` : ''}`}</title>
              </rect>
              {/* Distance label inside bar if wide enough */}
              {b.w > 36 && (
                <text x={b.x + b.w/2} y={b.y + Math.min(b.h - 4, 14)} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff" opacity={0.92}>
                  {b.l.distM}m
                </text>
              )}
            </g>
          );
        })}

        {/* X labels: lap index */}
        {bars.map(b => {
          const step = N <= 8 ? 1 : N <= 20 ? 2 : N <= 40 ? 5 : 10;
          if ((b.i + 1) % step !== 0 && b.i !== 0 && b.i !== N - 1) return null;
          if (b.w < 8 && b.i !== 0 && b.i !== N - 1) return null;
          return (
            <text key={b.i} x={b.x + b.w/2} y={H - 16} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
              {b.i + 1}
            </text>
          );
        })}
        <text x={pL} y={H - 4} fontSize={9} fill="var(--text-secondary)" fontStyle="italic">numer odcinka →</text>
      </svg>

      {/* Bottom stats */}
      <div style={{ display:'flex', gap:14, fontSize:11, color:'var(--text-secondary)', marginTop:6, flexWrap:'wrap' }}>
        <span>Najszybsze: <strong style={{ color:'#22c55e' }}>{fmtPaceS100(fastestPace)}</strong></span>
        <span>Średnie: <strong style={{ color:'var(--text)' }}>{fmtPaceS100(avgPace)}</strong></span>
        {avgStrokes100 !== null && <span>Śr. ruchów: <strong style={{ color:'var(--text)' }}>{avgStrokes100}</strong>/100m</span>}
        {avgSwolf !== null && <span>SWOLF /100m: <strong style={{ color:'var(--text)' }}>{avgSwolf}</strong> (najlepszy {minSwolf})</span>}
      </div>
      <div style={{ display:'flex', gap:10, fontSize:10, color:'var(--text-secondary)', marginTop:6, flexWrap:'wrap', alignItems:'center' }}>
        <span><span style={{ display:'inline-block', width:10, height:8, background:'#22c55e', borderRadius:2, marginRight:3, verticalAlign:'middle' }} />szybsze</span>
        <span><span style={{ display:'inline-block', width:10, height:8, background:'#60a5fa', borderRadius:2, marginRight:3, verticalAlign:'middle' }} />średnio</span>
        <span><span style={{ display:'inline-block', width:10, height:8, background:'#fbbf24', borderRadius:2, marginRight:3, verticalAlign:'middle' }} />wolniejsze</span>
        <span><span style={{ display:'inline-block', width:10, height:8, background:'#f87171', borderRadius:2, marginRight:3, verticalAlign:'middle' }} />dużo wolniejsze</span>
        <span style={{ marginLeft:'auto', lineHeight:1.5, textAlign:'right' }}>kolor wg tempa /100m · wysokość = czas · szerokość = dystans</span>
      </div>
    </div>
  );
}

/* ── Power chart ── */
function PowerChart({ time, watts, avgWatts, normalizedWatts, selection, onSelect }: {
  time: number[]; watts: number[];
  avgWatts: number | null; normalizedWatts: number | null;
} & BrushProps) {
  if (!watts.length || watts.every(v => v === 0)) return null;
  const W = 800, H = 150, pL = 48, pR = 12, pT = 10, pB = 22;
  const { svgRef, handlers } = useBrush(W, pL, pR, selection, onSelect);

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
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} {...handlers} style={{ width:'100%', display:'block', ...handlers.style }}>
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
        <BrushOverlay sel={selection} W={W} pL={pL} pR={pR} pT={pT} ch={ch} />
        {(() => {
          if (!selection) return null;
          const r = rangeIndices(time, selection);
          if (!r) return null;
          const w = watts.slice(r.startIdx, r.endIdx + 1).filter(v => v > 0);
          if (!w.length) return null;
          const avg = Math.round(w.reduce((s,v)=>s+v,0)/w.length);
          const max = Math.round(Math.max(...w));
          return <RangeTooltip sel={selection} W={W} pL={pL} pR={pR} pT={pT} color="#fbbf24"
            lines={[fmtTime(r.duration), `Śr ${avg} W`, `Max ${max} W`]} />;
        })()}

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
  const [selection, setSelection] = useState<Selection | null>(null);
  const { stats, sportType } = data;
  const isRide = BIKE_SPORTS.has(sportType);
  const isSwim = new Set(['Swim','OpenWaterSwim']).has(sportType);
  const isRun  = new Set(['Run','TrailRun','VirtualRun']).has(sportType);

  const avgCadence = data.cadence.length > 0
    ? Math.round(data.cadence.reduce((s, v) => s + v, 0) / data.cadence.length)
    : null;

  const np = (stats as unknown as Record<string,number>).normalizedPower ?? null;

  // EF only meaningful for running (pace/HR)
  const ef = isRun && stats.avgVelocityMs && stats.avgHeartRate && stats.avgHeartRate > 0
    ? Math.round((stats.avgVelocityMs * 60 / stats.avgHeartRate) * 1000) / 10
    : null;

  // Swim-specific aggregates from laps
  const swimLapStats = (() => {
    if (!isSwim || !data.laps?.length) return null;
    const valid = data.laps.filter(l => l.distM >= 5 && l.timeSec > 0);
    if (!valid.length) return null;
    const N = valid.length;
    const distBuckets = new Set(valid.map(l => Math.round(l.distM / 5) * 5));
    const poolLen = distBuckets.size <= 2 ? valid[0].distM : null;
    // Fastest pace /100m
    const fastestPaceS100 = Math.min(...valid.map(l => (l.timeSec / l.distM) * 100));
    // SWOLF normalized to /100m for comparison across varied distances
    const withC = valid.filter(l => l.avgCadence && l.avgCadence > 0);
    const strokes100 = withC.map(l => (l.avgCadence! / 60) * (l.timeSec * 100 / l.distM));
    const swolfs100  = withC.map((l, i) => strokes100[i] + (l.timeSec * 100 / l.distM));
    return {
      poolLen,
      segmentsCount: N,
      fastestPaceS100,
      avgStrokes100: strokes100.length ? Math.round(strokes100.reduce((s,v)=>s+v,0)/strokes100.length) : null,
      avgSwolf100:   swolfs100.length  ? Math.round(swolfs100.reduce((s,v)=>s+v,0)/swolfs100.length)   : null,
    };
  })();

  // Distance: show in meters for swimming <1km
  const distLabel = isSwim && stats.totalDistKm < 1
    ? `${Math.round(stats.totalDistKm * 1000)} m`
    : `${stats.totalDistKm} km`;

  // Sport-specific stat rows
  const statItems: Array<[string, string | null]> = [
    ['Dystans', distLabel],
    ['Czas',    fmtTime(stats.totalTimeSec)],
    // Elevation — NOT for swimming
    ...(!isSwim ? [['Przewyżs.', stats.elevGain > 0 ? `${stats.elevGain} m` : null] as [string, string|null]] : []),
    // Swim: pace in min/100m only
    ...(isSwim ? [['Tempo /100m', stats.avgVelocityMs ? fmtPace(stats.avgVelocityMs, sportType) : null] as [string, string|null]] : []),
    // Swim: lap-based stats (pace-normalized to /100m for varied-distance sets)
    ...(swimLapStats ? [
      ...(swimLapStats.poolLen ? [['Basen', `${swimLapStats.poolLen} m`] as [string, string|null]] : []),
      ['Odcinki', `${swimLapStats.segmentsCount}`],
      ['Najszybsze /100m', (() => { const t = swimLapStats.fastestPaceS100; const m = Math.floor(t/60), s = Math.round(t%60); return `${m}:${String(s).padStart(2,'0')}`; })()],
      ...(swimLapStats.avgSwolf100 !== null ? [['SWOLF /100m',  `${swimLapStats.avgSwolf100}`] as [string, string|null]] : []),
      ...(swimLapStats.avgStrokes100 !== null ? [['Ruchy /100m', `${swimLapStats.avgStrokes100}`] as [string, string|null]] : []),
    ] as Array<[string, string|null]> : []),
    // Bike: speed in km/h
    ...(isRide ? [['Śr. prędkość', stats.avgVelocityMs ? `${(stats.avgVelocityMs * 3.6).toFixed(1)} km/h` : null] as [string, string|null]] : []),
    // Run: pace in min/km
    ...(isRun ? [['Śr. tempo', stats.avgVelocityMs ? fmtPace(stats.avgVelocityMs, sportType) : null] as [string, string|null]] : []),
    ['Śr. HR',   stats.avgHeartRate ? `${stats.avgHeartRate} bpm` : null],
    ['Max HR',   stats.maxHeartRate ? `${stats.maxHeartRate} bpm` : null],
    // Bike: power metrics
    ...(isRide ? [
      ['Śr. moc', stats.avgWatts ? `${stats.avgWatts} W` : null],
      ['NP',      np ? `${np} W` : null],
    ] as Array<[string, string|null]> : []),
    // Run: power (if Stryd etc.)
    ...(isRun && stats.avgWatts ? [['Moc bieg.', `${stats.avgWatts} W`] as [string, string|null]] : []),
    // Cadence with sport-specific unit
    ...(avgCadence ? [[
      isRide ? 'Kadencja (RPM)' : isSwim ? 'Tempo uderzeń' : 'Kadencja (spm)',
      isRide ? `${avgCadence} RPM` : isSwim ? `${avgCadence} ud/min` : `${avgCadence} spm`
    ] as [string, string|null]] : []),
    // EF only for running
    ...(ef ? [['EF', `${ef}`] as [string, string|null]] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Key stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10 }}>
        {statItems.filter(([, v]) => v).map(([l, v]) => (
          <div key={l as string} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {!isSwim && data.altitude.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <ElevationChart distance={data.distance} altitude={data.altitude} elevGain={stats.elevGain} />
        </div>
      )}
      {isSwim && data.laps?.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <SwimLapsChart laps={data.laps} />
        </div>
      )}
      {data.heartrate.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <HeartRateChart time={data.time} heartrate={data.heartrate} hrZones={data.hrZones} selection={selection} onSelect={setSelection} />
        </div>
      )}
      {data.velocity.length > 0 && data.velocity.some(v => v > 0) && (
        <div className="card" style={{ marginBottom: 0 }}>
          <PaceChart time={data.time} velocity={data.velocity} sportType={sportType} selection={selection} onSelect={setSelection} />
        </div>
      )}
      {/* Power — not applicable for swimming */}
      {!isSwim && data.watts.length > 0 && data.watts.some(v => v > 0) && (
        <div className="card" style={{ marginBottom: 0 }}>
          <PowerChart
            time={data.time}
            watts={data.watts}
            avgWatts={data.stats.avgWatts}
            normalizedWatts={data.stats.normalizedPower}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
      )}
      {data.cadence.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <CadenceChart time={data.time} cadence={data.cadence} avgVelocityMs={data.stats.avgVelocityMs} sportType={sportType} selection={selection} onSelect={setSelection} />
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
