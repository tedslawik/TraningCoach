import type { WeeklySummary } from '@tricoach/core';

interface Props {
  data: WeeklySummary[];
  metric?: 'distance' | 'time';
  height?: number;
}

function weekLabel(ws: string) {
  const d = new Date(ws);
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

export default function TrendsChart({ data, metric = 'distance', height = 180 }: Props) {
  if (!data.length) return null;

  const last12 = [...data].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-12);

  const getValue = (s: WeeklySummary) => metric === 'distance'
    ? s.swimDistKm + s.bikeDistKm + s.runDistKm
    : (s.swimTimeMin + s.bikeTimeMin + s.runTimeMin) / 60;

  const maxVal = Math.max(...last12.map(getValue), 1);

  const W      = 800;
  const padL   = 40;
  const padR   = 12;
  const padT   = 12;
  const padB   = 28;
  const chartW = W - padL - padR;
  const chartH = height - padT - padB;
  const barW   = (chartW / last12.length) * 0.75;
  const gap    = chartW / last12.length;

  const barH = (val: number) => (val / maxVal) * chartH;

  const SWIM_COLOR = '#93c5fd';
  const BIKE_COLOR = '#86efac';
  const RUN_COLOR  = '#fca5a5';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(maxVal * p));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', minWidth: 480, display: 'block' }}>
        {/* Y grid + labels */}
        {yTicks.map(tick => {
          const y = padT + chartH - (tick / maxVal) * chartH;
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth={0.5} />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-secondary)">
                {metric === 'distance' ? `${tick} km` : `${tick}h`}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {last12.map((s, i) => {
          const x     = padL + i * gap + (gap - barW) / 2;
          const swimH = metric === 'distance' ? barH(s.swimDistKm) : barH(s.swimTimeMin / 60);
          const bikeH = metric === 'distance' ? barH(s.bikeDistKm) : barH(s.bikeTimeMin / 60);
          const runH  = metric === 'distance' ? barH(s.runDistKm)  : barH(s.runTimeMin  / 60);
          const baseY = padT + chartH;

          const isCurrentWeek = i === last12.length - 1;

          return (
            <g key={s.weekStart}>
              {/* Background for current week */}
              {isCurrentWeek && (
                <rect x={x - 4} y={padT} width={barW + 8} height={chartH} fill="var(--tri)" opacity={0.06} rx={4} />
              )}
              {/* Stacked bars: run on top, bike middle, swim bottom */}
              <rect x={x} y={baseY - swimH} width={barW} height={swimH} fill={SWIM_COLOR} rx={2} />
              <rect x={x} y={baseY - swimH - bikeH} width={barW} height={bikeH} fill={BIKE_COLOR} />
              <rect x={x} y={baseY - swimH - bikeH - runH} width={barW} height={runH} fill={RUN_COLOR} rx={[2, 2, 0, 0] as unknown as number} />
              {/* X label */}
              <text x={x + barW / 2} y={padT + chartH + 18} textAnchor="middle" fontSize={9} fill={isCurrentWeek ? 'var(--tri)' : 'var(--text-secondary)'} fontWeight={isCurrentWeek ? 700 : 400}>
                {weekLabel(s.weekStart)}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        {[['Pływanie', SWIM_COLOR], ['Rower', BIKE_COLOR], ['Bieg', RUN_COLOR]].map(([label, color], i) => (
          <g key={label} transform={`translate(${padL + i * 90}, 4)`}>
            <rect width={10} height={10} fill={color} rx={2} />
            <text x={14} y={9} fontSize={9} fill="var(--text-secondary)">{label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
