import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import ActivityCharts, { type StreamData } from '../charts/ActivityCharts';
import RunSummaryNote from './RunSummaryNote';

interface Props {
  activityId: number;
  activityName: string;
  sportType: string;
  onClose: () => void;
}

const TYPE_META: Record<string, { icon: string; color: string }> = {
  swim:  { icon: '🏊', color: 'var(--swim)' },
  bike:  { icon: '🚴', color: 'var(--bike)' },
  run:   { icon: '🏃', color: 'var(--run)' },
  other: { icon: '💪', color: 'var(--text-secondary)' },
};

function typeKey(sport: string): 'swim'|'bike'|'run'|'other' {
  if (['Swim','OpenWaterSwim'].includes(sport)) return 'swim';
  if (['Ride','VirtualRide','EBikeRide','Velomobile','Handcycle'].includes(sport)) return 'bike';
  if (['Run','TrailRun','VirtualRun'].includes(sport)) return 'run';
  return 'other';
}

export default function ActivityDetailModal({ activityId, activityName, sportType, onClose }: Props) {
  const { session } = useAuth();
  const [data, setData]       = useState<StreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchStream = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/strava/stream?activityId=${activityId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Nie można pobrać danych strumienia');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania');
    } finally {
      setLoading(false);
    }
  }, [activityId, session]);

  useEffect(() => {
    fetchStream();
    // Close on Escape
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fetchStream, onClose]);

  const meta = TYPE_META[typeKey(sportType)];

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', zIndex:300, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'2rem 1rem', overflowY:'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background:'var(--bg)', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-xl)', width:'100%', maxWidth:900, boxShadow:'0 32px 80px rgba(0,0,0,0.25)', marginBottom:'2rem' }}>

        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'0.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:28 }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{activityName}</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>{sportType}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width:32, height:32, borderRadius:'50%', border:'0.5px solid var(--border-md)', background:'var(--bg-secondary)', cursor:'pointer', fontSize:16, color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'var(--font)' }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding:'1.5rem' }}>
          {loading && (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)', fontSize:14 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📡</div>
              Pobieranie danych strumienia ze Stravy…
            </div>
          )}
          {error && (
            <div className="alert alert-warn">{error}</div>
          )}
          {data && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <RunSummaryNote data={data} />
              <ActivityCharts data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
