export interface CalendarActivity {
  id: number;
  name: string;
  type: 'swim' | 'bike' | 'run' | 'other';
  date: string;
  distanceKm: number;
  timeFormatted: string;
  paceOrSpeed?: string | null;
  sufferScore?: number | null;
  avgHeartRate?: number | null;
  avgWatts?: number | null;
  normalizedWatts?: number | null;
  elevationGain?: number;
  tss?: number | null;
  zoneTimes?: number[] | null;       // HR zone times — 5 zones
  powerZoneTimes?: number[] | null;  // Power zone times — 7 zones
}

interface Props {
  activities: CalendarActivity[];
  weekStart: Date;
  loading?: boolean;
  emptyLabel?: string;
}

const HR_ZONE_COLORS  = ['#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171'];
const PWR_ZONE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#e11d48', '#7c3aed'];

const HR_ZONE_LABELS  = ['Z1 Regen.', 'Z2 Aerob.', 'Z3 Tempo', 'Z4 Próg', 'Z5 VO2max'];
const PWR_ZONE_LABELS = ['Z1', 'Z2', 'Z3 Tempo', 'Z4 Próg', 'Z5 VO2', 'Z6 Anaer.', 'Z7 Sprint'];

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', gap: 8, minWidth: 760, opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {days.map((day, i) => {
          const key     = toDateKey(day);
          const isToday = key === today;
          const dayActs = grouped[key] ?? [];
          return (
            <div key={key} style={{ border: isToday ? '2px solid var(--tri)' : '0.5px solid var(--border-md)', borderRadius: 'var(--radius-lg)', background: isToday ? '#ede9fd22' : 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 10px 6px', borderBottom: '0.5px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isToday ? 'var(--tri)' : 'var(--text-secondary)' }}>{DAY_NAMES[i]}</div>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: isToday ? 'var(--tri)' : 'var(--text)' }}>{day.getDate()}</div>
                {dayActs.length > 1 && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{dayActs.length} treningi</div>}
              </div>
              <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                {dayActs.length === 0
                  ? <div style={{ textAlign: 'center', color: 'var(--border-md)', fontSize: 18, padding: '10px 0', userSelect: 'none' }}>{emptyLabel}</div>
                  : dayActs.map(a => <ActivityCard key={a.id} activity={a} />)
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ZoneBar({ times, colors, labels, title }: { times: number[]; colors: string[]; labels: string[]; title: string }) {
  const total = times.reduce((s, v) => s + v, 0);
  if (total < 30) return null;
  const fmtSec = (sec: number) => { const m = Math.floor(sec / 60); return m > 0 ? `${m}min` : `${Math.round(sec)}s`; };
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 3 }}>{title}</div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1, marginBottom: 3 }}>
        {times.map((sec, i) => { const pct = (sec / total) * 100; return pct >= 1 ? <div key={i} style={{ width: `${pct}%`, background: colors[i], flexShrink: 0 }} /> : null; })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {times.map((sec, i) => {
          const pct = Math.round((sec / total) * 100);
          if (pct < 2) return null;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: colors[i], flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {labels[i]} <strong style={{ color: colors[i] }}>{pct}%</strong>
                <span style={{ opacity: 0.65 }}> ({fmtSec(sec)})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityCard({ activity: a }: { activity: CalendarActivity }) {
  const meta = TYPE_META[a.type] ?? TYPE_META.other;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: `0.5px solid ${meta.color}55`, borderLeft: `3px solid ${meta.color}`, borderRadius: 'var(--radius-sm)', padding: '7px 8px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
        {meta.icon} {a.name}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {a.distanceKm > 0 ? `${a.distanceKm} km · ` : ''}{a.timeFormatted}{a.paceOrSpeed ? ` · ${a.paceOrSpeed}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
        {a.avgHeartRate    != null && <span style={{ fontSize: 10, color: '#d85a30' }}>❤️ {Math.round(a.avgHeartRate)}</span>}
        {a.avgWatts        != null && <span style={{ fontSize: 10, color: '#639922' }}>⚡{Math.round(a.avgWatts)}W</span>}
        {a.normalizedWatts != null && a.normalizedWatts !== a.avgWatts && <span style={{ fontSize: 10, color: '#639922' }}>NP {Math.round(a.normalizedWatts)}W</span>}
        {a.tss             != null && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>TSS {Math.round(a.tss)}</span>}
        {a.sufferScore     != null && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>🔥{a.sufferScore}</span>}
        {(a.elevationGain ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>↑{a.elevationGain}m</span>}
      </div>
      {/* Power zones first (bike), HR zones second */}
      {a.powerZoneTimes && <ZoneBar times={a.powerZoneTimes} colors={PWR_ZONE_COLORS} labels={PWR_ZONE_LABELS} title="Strefy mocy" />}
      {a.zoneTimes      && <ZoneBar times={a.zoneTimes}      colors={HR_ZONE_COLORS}  labels={HR_ZONE_LABELS}  title="Strefy tętna" />}
    </div>
  );
}

export function WeekZoneSummaryBar({ zoneTimes, colors, labels, totalLabel }: { zoneTimes: number[]; colors?: string[]; labels?: string[]; totalLabel?: string }) {
  const COLORS = colors ?? HR_ZONE_COLORS;
  const LABELS = labels ?? HR_ZONE_LABELS;
  const total  = zoneTimes.reduce((s, v) => s + v, 0);
  if (total < 60) return null;
  const fmtMin = (sec: number) => { const m = Math.floor(sec / 60); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), rem = m % 60; return rem > 0 ? `${h}h ${rem}min` : `${h}h`; };
  return (
    <div style={{ marginBottom: '1.25rem', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 10 }}>
        {totalLabel ?? 'Strefy — tydzień łącznie'} · {fmtMin(total)}
      </div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 10, gap: 1 }}>
        {zoneTimes.map((sec, i) => { const pct = (sec / total) * 100; return pct >= 1 ? <div key={i} style={{ width: `${pct}%`, background: COLORS[i], flexShrink: 0, transition: 'width 0.4s ease' }} title={`${LABELS[i]}: ${Math.round(pct)}%`} /> : null; })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {zoneTimes.map((sec, i) => { const pct = total > 0 ? Math.round((sec / total) * 100) : 0; return pct >= 1 ? (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i], flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {LABELS[i]}<strong style={{ color: COLORS[i], marginLeft: 4 }}>{pct}%</strong>
              <span style={{ marginLeft: 4, opacity: 0.65 }}>({fmtMin(sec)})</span>
            </span>
          </div>
        ) : null; })}
      </div>
    </div>
  );
}
