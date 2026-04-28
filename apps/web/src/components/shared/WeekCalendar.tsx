export interface CalendarActivity {
  id: number;
  name: string;
  type: 'swim' | 'bike' | 'run' | 'other';
  date: string;             // ISO local date
  distanceKm: number;
  timeFormatted: string;
  paceOrSpeed?: string | null;
  sufferScore?: number | null;
  avgHeartRate?: number | null;
  avgWatts?: number | null;
  elevationGain?: number;
  zoneTimes?: number[] | null;  // seconds per HR zone
}

interface Props {
  activities: CalendarActivity[];
  weekStart: Date;           // Monday of the week
  loading?: boolean;
  emptyLabel?: string;      // label for rest days
}

const ZONE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171'];

const TYPE_META = {
  swim:  { icon: '🏊', color: '#378add' },
  bike:  { icon: '🚴', color: '#639922' },
  run:   { icon: '🏃', color: '#d85a30' },
  other: { icon: '💪', color: '#9ca3af' },
};

const DAY_NAMES = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

export default function WeekCalendar({ activities, weekStart, loading = false, emptyLabel = '—' }: Props) {
  const today = toDateKey(new Date());

  const grouped: Record<string, CalendarActivity[]> = {};
  activities.forEach(a => {
    const key = (a.date as string).split('T')[0];
    grouped[key] = grouped[key] ?? [];
    grouped[key].push(a);
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 8, minWidth: 700, opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {days.map((day, i) => {
          const key     = toDateKey(day);
          const isToday = key === today;
          const dayActs = grouped[key] ?? [];
          return (
            <div key={key} style={{
              border:        isToday ? '2px solid var(--tri)' : '0.5px solid var(--border-md)',
              borderRadius:  'var(--radius-lg)',
              background:    isToday ? '#ede9fd22' : 'var(--bg)',
              display:       'flex',
              flexDirection: 'column',
            }}>
              {/* Header */}
              <div style={{ padding: '8px 10px 6px', borderBottom: '0.5px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isToday ? 'var(--tri)' : 'var(--text-secondary)' }}>
                  {DAY_NAMES[i]}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: isToday ? 'var(--tri)' : 'var(--text)' }}>
                  {day.getDate()}
                </div>
                {dayActs.length > 1 && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {dayActs.length} treningi
                  </div>
                )}
              </div>

              {/* Activities */}
              <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                {dayActs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--border-md)', fontSize: 18, padding: '10px 0', userSelect: 'none' }}>
                    {emptyLabel}
                  </div>
                ) : (
                  dayActs.map(a => <ActivityCard key={a.id} activity={a} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityCard({ activity: a }: { activity: CalendarActivity }) {
  const meta = TYPE_META[a.type] ?? TYPE_META.other;
  const totalZoneSec = a.zoneTimes ? a.zoneTimes.reduce((s, v) => s + v, 0) : 0;

  return (
    <div style={{ background: 'var(--bg-secondary)', border: `0.5px solid ${meta.color}55`, borderLeft: `3px solid ${meta.color}`, borderRadius: 'var(--radius-sm)', padding: '7px 8px' }}>
      {/* Name */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
        {meta.icon} {a.name}
      </div>

      {/* Distance · time · pace */}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {a.distanceKm > 0 ? `${a.distanceKm} km · ` : ''}{a.timeFormatted}
        {a.paceOrSpeed ? ` · ${a.paceOrSpeed}` : ''}
      </div>

      {/* Quick metrics */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
        {a.avgHeartRate != null && <span style={{ fontSize: 10, color: '#d85a30' }}>❤️ {Math.round(a.avgHeartRate)}</span>}
        {a.avgWatts     != null && <span style={{ fontSize: 10, color: '#639922' }}>⚡{Math.round(a.avgWatts)}W</span>}
        {a.sufferScore  != null && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>🔥{a.sufferScore}</span>}
        {(a.elevationGain ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>↑{a.elevationGain}m</span>}
      </div>

      {/* HR Zone bar */}
      {a.zoneTimes && totalZoneSec > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1, marginBottom: 4 }}>
            {a.zoneTimes.map((sec, i) => {
              const pct = (sec / totalZoneSec) * 100;
              return pct >= 1 ? <div key={i} style={{ width: `${pct}%`, background: ZONE_COLORS[i], flexShrink: 0 }} /> : null;
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {a.zoneTimes.map((sec, i) => {
              const pct = Math.round((sec / totalZoneSec) * 100);
              if (pct < 1) return null;
              const min = Math.floor(sec / 60), s = Math.round(sec % 60);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    Z{i + 1} <strong style={{ color: ZONE_COLORS[i] }}>{pct}%</strong>
                    <span style={{ opacity: 0.65 }}> ({min > 0 ? `${min}min` : `${s}s`})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function WeekZoneSummaryBar({ zoneTimes, totalLabel }: { zoneTimes: number[]; totalLabel?: string }) {
  const LABELS = ['Z1 Regeneracja', 'Z2 Aerobowa', 'Z3 Tempo', 'Z4 Próg', 'Z5 VO2max'];
  const total  = zoneTimes.reduce((s, v) => s + v, 0);
  if (total < 60) return null;

  const fmtMin = (sec: number) => {
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), rem = m % 60;
    return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
  };

  return (
    <div style={{ marginBottom: '1.25rem', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 10 }}>
        {totalLabel ?? 'Strefy tętna — tydzień łącznie'} · {fmtMin(total)}
      </div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 10, gap: 1 }}>
        {zoneTimes.map((sec, i) => {
          const pct = (sec / total) * 100;
          return pct >= 1 ? <div key={i} style={{ width: `${pct}%`, background: ZONE_COLORS[i], flexShrink: 0, transition: 'width 0.4s ease' }} title={`${LABELS[i]}: ${Math.round(pct)}% (${fmtMin(sec)})`} /> : null;
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {zoneTimes.map((sec, i) => {
          const pct = total > 0 ? Math.round((sec / total) * 100) : 0;
          return pct >= 1 ? (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: ZONE_COLORS[i], flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {LABELS[i]}
                <strong style={{ color: ZONE_COLORS[i], marginLeft: 4 }}>{pct}%</strong>
                <span style={{ marginLeft: 4, opacity: 0.65 }}>({fmtMin(sec)})</span>
              </span>
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}
