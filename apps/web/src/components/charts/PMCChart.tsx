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
  const padT   = 16;
  const padB   = 28;
  const chartW = W - padL - padR;
  const chartH = height - padT - padB;

  const allVals  = data.flatMap(d => [d.ctl, d.atl, d.tsb]);
  const minVal   = Math.min(...allVals, -20);
  const maxVal   = Math.max(...allVals, 10);
  const range    = maxVal - minVal || 1;

  const toY = (v: number) => padT + chartH - ((v - minVal) / range) * chartH;
  const toX = (i: number) => padL + (i / (data.length - 1)) * chartW;

  const zeroY = toY(0);

  const ctlPts: [number, number][]  = data.map((d, i) => [toX(i), toY(d.ctl)]);
  const atlPts: [number, number][]  = data.map((d, i) => [toX(i), toY(d.atl)]);
  const tsbPts: [number, number][]  = data.map((d, i) => [toX(i), toY(d.tsb)]);

  // TSB fill area (positive = green, negative = red)
  const tsbAreaPos = tsbPts.map(([x, y]) => [x, Math.min(y, zeroY)] as [number, number]);
  const tsbAreaNeg = tsbPts.map(([x, y]) => [x, Math.max(y, zeroY)] as [number, number]);

  const yTicks = [-20, 0, 20, 40, 60, 80, 100].filter(v => v >= minVal - 5 && v <= maxVal + 5);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', minWidth: 480, display: 'block' }}>
        <defs>
          <linearGradient id="tsb-pos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" /><stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" /></linearGradient>
          <linearGradient id="tsb-neg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity="0.05" /><stop offset="100%" stopColor="#ef4444" stopOpacity="0.35" /></linearGradient>
        </defs>

        {/* Y grid */}
        {yTicks.map(tick => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={tick === 0 ? 'var(--border-md)' : 'var(--border)'} strokeWidth={tick === 0 ? 1 : 0.5} strokeDasharray={tick === 0 ? '0' : '3,4'} />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">{tick}</text>
            </g>
          );
        })}

        {/* TSB fill areas */}
        <polyline
          points={[`${toX(0)},${zeroY}`, ...tsbAreaPos.map(([x, y]) => `${x},${y}`), `${toX(data.length - 1)},${zeroY}`].join(' ')}
          fill="url(#tsb-pos)" stroke="none"
        />
        <polyline
          points={[`${toX(0)},${zeroY}`, ...tsbAreaNeg.map(([x, y]) => `${x},${y}`), `${toX(data.length - 1)},${zeroY}`].join(' ')}
          fill="url(#tsb-neg)" stroke="none"
        />

        {/* TSB (Form) dashed line */}
        <path d={linePath(tsbPts)} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4,3" />

        {/* ATL (orange) */}
        <path d={linePath(atlPts)} fill="none" stroke="#fb923c" strokeWidth={1.5} />

        {/* CTL (blue, thick) */}
        <path d={linePath(ctlPts)} fill="none" stroke="#60a5fa" strokeWidth={2.5} strokeLinejoin="round" />

        {/* Dots for current week */}
        {(() => { const last = data.length - 1; return (
          <>
            <circle cx={toX(last)} cy={toY(data[last].ctl)} r={4} fill="#60a5fa" />
            <circle cx={toX(last)} cy={toY(data[last].atl)} r={3} fill="#fb923c" />
            <circle cx={toX(last)} cy={toY(data[last].tsb)} r={3} fill={data[last].tsb >= 0 ? '#22c55e' : '#ef4444'} />
          </>
        ); })()}

        {/* X labels (every 2 weeks) */}
        {data.map((d, i) => {
          if (i % 2 !== 0 && i !== data.length - 1) return null;
          return <text key={i} x={toX(i)} y={padT + chartH + 18} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{weekLabel(d.weekStart)}</text>;
        })}

        {/* Legend */}
        {[['CTL — forma bazowa', '#60a5fa', '0'], ['ATL — zmęczenie', '#fb923c', '90'], ['Form (CTL−ATL)', '#22c55e', '180']].map(([label, color, x]) => (
          <g key={label} transform={`translate(${padL + +x}, 4)`}>
            <line x1={0} y1={6} x2={14} y2={6} stroke={color} strokeWidth={label.includes('Form') ? 1.5 : 2} strokeDasharray={label.includes('Form') ? '4,3' : '0'} />
            <text x={18} y={10} fontSize={9} fill="var(--text-secondary)">{label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
