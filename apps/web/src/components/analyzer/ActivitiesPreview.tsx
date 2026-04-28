export interface ActivityItem {
  id: number;
  name: string;
  type: 'swim' | 'bike' | 'run' | 'other';
  sportType: string;
  date: string;
  distanceKm: number;
  timeFormatted: string;
  paceOrSpeed: string;
}

interface Props {
  activities: ActivityItem[];
}

const META: Record<string, { label: string; icon: string; color: string; badge: string; badgeText: string }> = {
  swim:  { label: 'Pływanie', icon: '🏊', color: '#378add', badge: '#ddeeff', badgeText: '#0a4a8f' },
  bike:  { label: 'Rower',    icon: '🚴', color: '#639922', badge: '#dff2d8', badgeText: '#1e5c0e' },
  run:   { label: 'Bieg',     icon: '🏃', color: '#d85a30', badge: '#fde8de', badgeText: '#7a2e10' },
  other: { label: 'Trening',  icon: '💪', color: '#9ca3af', badge: '#f3f4f6', badgeText: '#374151' },
};

function relativeDate(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'dziś';
  if (diff === 1) return 'wczoraj';
  if (diff < 7)  return `${diff} dni temu`;
  return new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

export default function ActivitiesPreview({ activities }: Props) {
  if (activities.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title">
        Treningi z ostatnich 7 dni
        <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-secondary)' }}>
          ({activities.length})
        </span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
      }}>
        {activities.map(a => {
          const meta = META[a.type] ?? META.other;
          return (
            <div
              key={a.id}
              style={{
                borderLeft: `3px solid ${meta.color}`,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {meta.icon} {a.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 4 }}>
                  {relativeDate(a.date)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ background: meta.badge, color: meta.badgeText, padding: '1px 6px', borderRadius: 4, fontWeight: 600, fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                  {meta.label}
                </span>
                {a.distanceKm > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.distanceKm} km</span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.timeFormatted}</span>
                {a.paceOrSpeed && a.paceOrSpeed !== a.timeFormatted && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--border-md)' }}>·</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.paceOrSpeed}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
