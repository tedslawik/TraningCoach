import type { PMCPoint } from '@tricoach/core';

interface Props { data: PMCPoint[]; height?: number; }

function weekLabel(ws: string) {
  return new Date(ws).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function linePath(points: [number, number][]) {
  if (!points.length) return '';
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

export default function PMCChart({ data, height = 200 }: Props) {
  if (data.length < 2) return null;

  const W      = 800;
  const padL   = 42;
  const padR   = 12;
  const padT   = 8;
  const padB   = 28;
  const chartW = W - padL - padR;
  const chartH = height - padT - padB;

  const allVals  = data.flatMap(d => [d.ctl, d.atl, d.tsb]);
  const rawMin   = Math.min(...allVals);
  const rawMax   = Math.max(...allVals);

  // Nice scale: pick a step size that gives ~5-6 ticks
  function niceStep(range: number): number {
    const rough = range / 5;
    const candidates = [1, 2, 5, 10, 20, 25, 50, 100];
    return candidates.find(c => c >= rough) ?? 100;
  }
  const range_  = rawMax - rawMin || 40;
  const step    = niceStep(range_);
  const minVal  = Math.floor((rawMin - step * 0.3) / step) * step;
  const maxVal  = Math.ceil ((rawMax + step * 0.3) / step) * step;
  const range   = maxVal - minVal || 1;

  const toY = (v: number) => padT + chartH - ((v - minVal) / range) * chartH;
  const toX = (i: number) => padL + (i / (data.length - 1)) * chartW;

  const zeroY = toY(0);

  const ctlPts: [number, number][] = data.map((d, i) => [toX(i), toY(d.ctl)]);
  const atlPts: [number, number][] = data.map((d, i) => [toX(i), toY(d.atl)]);
  const tsbPts: [number, number][] = data.map((d, i) => [toX(i), toY(d.tsb)]);

  const tsbAreaPos = tsbPts.map(([x, y]) => [x, Math.min(y, zeroY)] as [number, number]);
  const tsbAreaNeg = tsbPts.map(([x, y]) => [x, Math.max(y, zeroY)] as [number, number]);

  const yTicks: number[] = [];
  for (let v = minVal; v <= maxVal; v += step) yTicks.push(Math.round(v));
  const last   = data.length - 1;
  const latest = data[last];

  return (
    <div>
      {/* Chart */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', minWidth: 480, display: 'block' }}>
          <defs>
            <linearGradient id="tsb-pos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="tsb-neg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.30" />
            </linearGradient>
          </defs>

          {/* Y grid */}
          {yTicks.map(tick => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL} y1={y} x2={W - padR} y2={y}
                  stroke={tick === 0 ? 'var(--border-md)' : 'var(--border)'}
                  strokeWidth={tick === 0 ? 1 : 0.5}
                  strokeDasharray={tick === 0 ? '0' : '3,5'}
                />
                <text x={padL - 5} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text-secondary)">{tick}</text>
              </g>
            );
          })}

          {/* TSB gradient fills */}
          <polyline
            points={[`${toX(0)},${zeroY}`, ...tsbAreaPos.map(([x, y]) => `${x},${y}`), `${toX(last)},${zeroY}`].join(' ')}
            fill="url(#tsb-pos)" stroke="none"
          />
          <polyline
            points={[`${toX(0)},${zeroY}`, ...tsbAreaNeg.map(([x, y]) => `${x},${y}`), `${toX(last)},${zeroY}`].join(' ')}
            fill="url(#tsb-neg)" stroke="none"
          />

          {/* Form / TSB — dashed green */}
          <path d={linePath(tsbPts)} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5,3" />

          {/* ATL — orange */}
          <path d={linePath(atlPts)} fill="none" stroke="#fb923c" strokeWidth={1.5} />

          {/* CTL — blue, thicker */}
          <path d={linePath(ctlPts)} fill="none" stroke="#60a5fa" strokeWidth={2.5} strokeLinejoin="round" />

          {/* End-point dots */}
          <circle cx={toX(last)} cy={toY(latest.ctl)} r={4.5} fill="#60a5fa" stroke="var(--bg)" strokeWidth={1.5} />
          <circle cx={toX(last)} cy={toY(latest.atl)} r={3.5} fill="#fb923c" stroke="var(--bg)" strokeWidth={1.5} />
          <circle cx={toX(last)} cy={toY(latest.tsb)} r={3.5} fill={latest.tsb >= 0 ? '#22c55e' : '#ef4444'} stroke="var(--bg)" strokeWidth={1.5} />

          {/* End-point value labels */}
          <text x={toX(last) + 8} y={toY(latest.ctl) + 4} fontSize={10} fontWeight={700} fill="#60a5fa">{latest.ctl}</text>
          <text x={toX(last) + 8} y={toY(latest.atl) + 4} fontSize={10} fontWeight={700} fill="#fb923c">{latest.atl}</text>
          <text x={toX(last) + 8} y={toY(latest.tsb) + 4} fontSize={10} fontWeight={700} fill={latest.tsb >= 0 ? '#22c55e' : '#ef4444'}>
            {latest.tsb > 0 ? '+' : ''}{latest.tsb}
          </text>

          {/* X labels every 2 weeks */}
          {data.map((d, i) => {
            if (i % 2 !== 0 && i !== last) return null;
            return (
              <text key={i} x={toX(i)} y={padT + chartH + 18} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
                {weekLabel(d.weekStart)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend — HTML below chart */}
      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <LegendLine color="#60a5fa" strokeWidth={3} label="CTL — forma bazowa" />
        <LegendLine color="#fb923c" strokeWidth={2} label="ATL — zmęczenie" />
        <LegendDashed color="#22c55e" label="Form (CTL − ATL)" />
        <LegendArea colorPos="#22c55e" colorNeg="#ef4444" label="Obszar formy" />
      </div>
    </div>
  );
}

function LegendLine({ color, strokeWidth, label }: { color: string; strokeWidth: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={28} height={14}>
        <line x1={0} y1={7} x2={28} y2={7} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function LegendDashed({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={28} height={14}>
        <line x1={0} y1={7} x2={28} y2={7} stroke={color} strokeWidth={2} strokeDasharray="5,3" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function LegendArea({ colorPos, colorNeg, label }: { colorPos: string; colorNeg: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <div style={{ width: 12, height: 14, background: colorPos, opacity: 0.35, borderRadius: '2px 0 0 2px' }} />
        <div style={{ width: 12, height: 14, background: colorNeg, opacity: 0.30, borderRadius: '0 2px 2px 0' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}
