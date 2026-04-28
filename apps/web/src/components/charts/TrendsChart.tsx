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

const SWIM_COLOR = '#93c5fd';
const BIKE_COLOR = '#86efac';
const RUN_COLOR  = '#fca5a5';

export default function TrendsChart({ data, metric = 'distance', height = 180 }: Props) {
  if (!data.length) return null;

  const last12 = [...data].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-12);

  const getValue = (s: WeeklySummary) => metric === 'distance'
    ? s.swimDistKm + s.bikeDistKm + s.runDistKm
    : (s.swimTimeMin + s.bikeTimeMin + s.runTimeMin) / 60;

  const rawMax = Math.max(...last12.map(getValue), 1);

  // Round up to a nice ceiling so bars never touch the top
  function niceMax(v: number): number {
    const step = v <= 20 ? 5 : v <= 50 ? 10 : v <= 200 ? 25 : v <= 500 ? 50 : 100;
    return Math.ceil(v / step) * step;
  }
  const maxVal = niceMax(rawMax);

  // Generate 5 evenly-spaced nice ticks
  const step    = maxVal / 4;
  const yTicks  = [0, 1, 2, 3, 4].map(i => Math.round(i * step));

  const W      = 800;
  const padL   = 40;
  const padR   = 12;
  const padT   = 8;
  const padB   = 28;
  const chartW = W - padL - padR;
  const chartH = height - padT - padB;
  const barW   = (chartW / last12.length) * 0.72;
  const gap    = chartW / last12.length;

  const barH = (val: number) => (val / maxVal) * chartH;

  return (
    <div>
      {/* Chart */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', minWidth: 480, display: 'block' }}>
          {/* Y grid + labels */}
          {yTicks.map(tick => {
            const y = padT + chartH - (tick / maxVal) * chartH;
            return (
              <g key={tick}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth={0.5} />
                <text x={padL - 5} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text-secondary)">
                  {metric === 'distance' ? `${tick}km` : `${tick}h`}
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
                {isCurrentWeek && (
                  <rect x={x - 4} y={padT} width={barW + 8} height={chartH} fill="var(--tri)" opacity={0.06} rx={4} />
                )}
                <rect x={x} y={baseY - swimH} width={barW} height={Math.max(swimH, 0)} fill={SWIM_COLOR} rx={2} />
                <rect x={x} y={baseY - swimH - bikeH} width={barW} height={Math.max(bikeH, 0)} fill={BIKE_COLOR} />
                <rect x={x} y={baseY - swimH - bikeH - runH} width={barW} height={Math.max(runH, 0)} fill={RUN_COLOR} />
                <text
                  x={x + barW / 2} y={padT + chartH + 18}
                  textAnchor="middle" fontSize={9}
                  fill={isCurrentWeek ? 'var(--tri)' : 'var(--text-secondary)'}
                  fontWeight={isCurrentWeek ? 700 : 400}
                >
                  {weekLabel(s.weekStart)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend — HTML below chart */}
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        {[
          ['Pływanie', SWIM_COLOR],
          ['Rower',    BIKE_COLOR],
          ['Bieg',     RUN_COLOR],
        ].map(([label, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: color, borderRadius: 3, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, background: 'var(--tri)', opacity: 0.25, borderRadius: 3, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aktualny tydzień</span>
        </div>
      </div>
    </div>
  );
}
