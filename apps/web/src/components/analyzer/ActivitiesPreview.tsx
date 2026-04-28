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

const META: Record<string, { label: string; icon: string; border: string; badge: string; badgeText: string }> = {
  swim:  { label: 'Pływanie',  icon: '🏊', border: '#378add', badge: '#ddeeff', badgeText: '#0a4a8f' },
  bike:  { label: 'Rower',     icon: '🚴', border: '#639922', badge: '#dff2d8', badgeText: '#1e5c0e' },
  run:   { label: 'Bieg',      icon: '🏃', border: '#d85a30', badge: '#fde8de', badgeText: '#7a2e10' },
  other: { label: 'Trening',   icon: '💪', border: '#9ca3af', badge: '#f3f4f6', badgeText: '#374151' },
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
      <div className="card-title">Ostatnie treningi ze Stravy</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {activities.map((a, i) => {
          const meta = META[a.type] ?? META.other;
          return (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px',
                borderLeft: `3px solid ${meta.border}`,
                background: 'var(--bg-secondary)',
                borderRadius: i === 0
                  ? 'var(--radius-md) var(--radius-md) 0 0'
                  : i === activities.length - 1
                  ? '0 0 var(--radius-md) var(--radius-md)'
                  : '0',
                marginTop: i === 0 ? 0 : 2,
              }}
            >
              {/* Icon */}
              <div style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center' }}>
                {meta.icon}
              </div>

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{ background: meta.badge, color: meta.badgeText, padding: '1px 7px', borderRadius: 4, fontWeight: 600, fontSize: 11, letterSpacing: '0.03em' }}
                  >
                    {meta.label}
                  </span>
                  <span>{a.distanceKm} km</span>
                  <span>·</span>
                  <span>{a.timeFormatted}</span>
                  <span>·</span>
                  <span>{a.paceOrSpeed}</span>
                </div>
              </div>

              {/* Date */}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0, textAlign: 'right' }}>
                {relativeDate(a.date)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
