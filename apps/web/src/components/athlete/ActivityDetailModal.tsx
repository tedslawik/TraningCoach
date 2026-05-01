import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import ActivityCharts, { type StreamData } from '../charts/ActivityCharts';
import RunSummaryNote from './RunSummaryNote';
import { analyzeRunLaps, analyzeRunStream, type RunAnalysis } from '@tricoach/core';

interface Props {
  activityId:   number;
  activityName: string;
  sportType:    string;
  onClose:      () => void;
}

const TYPE_META: Record<string, { icon: string; color: string }> = {
  swim:  { icon: '🏊', color: 'var(--swim)' },
  bike:  { icon: '🚴', color: 'var(--bike)' },
  run:   { icon: '🏃', color: 'var(--run)'  },
  other: { icon: '💪', color: 'var(--text-secondary)' },
};

function typeKey(sport: string): 'swim'|'bike'|'run'|'other' {
  if (['Swim','OpenWaterSwim'].includes(sport)) return 'swim';
  if (['Ride','VirtualRide','EBikeRide','Velomobile','Handcycle'].includes(sport)) return 'bike';
  if (['Run','TrailRun','VirtualRun'].includes(sport)) return 'run';
  return 'other';
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

export default function ActivityDetailModal({ activityId, activityName, sportType, onClose }: Props) {
  const { session } = useAuth();
  const [data, setData]           = useState<StreamData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [aiText, setAiText]       = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState<string | null>(null);
  const [aiUsage, setAiUsage]     = useState<{inputTokens:number;outputTokens:number;costUsd:number}|null>(null);
  const aiBoxRef = useRef<HTMLDivElement>(null);

  const fetchStream = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/strava/stream?activityId=${activityId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Nie można pobrać danych');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setLoading(false);
    }
  }, [activityId, session]);

  useEffect(() => {
    fetchStream();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fetchStream, onClose]);

  // Scroll AI box as text arrives
  useEffect(() => {
    if (aiBoxRef.current) aiBoxRef.current.scrollTop = aiBoxRef.current.scrollHeight;
  }, [aiText]);

  const handleAiAnalysis = async () => {
    if (!session || !data) return;
    setAiLoading(true);
    setAiText('');
    setAiError(null);
    setAiUsage(null);

    // Build lapAnalysis from available data
    let lapAnalysis: RunAnalysis | null = null;
    if (data.laps?.length >= 4) {
      lapAnalysis = analyzeRunLaps(data.laps);
    }
    if (!lapAnalysis) {
      lapAnalysis = analyzeRunStream(data.time, data.distance, data.velocity, data.heartrate);
    }

    try {
      const res = await fetch('/api/ai/analyze-workout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          activityName,
          sportType,
          startDate:    data.startDate,
          totalDistKm:  data.stats.totalDistKm,
          totalTimeSec: data.stats.totalTimeSec,
          elevGain:     data.stats.elevGain,
          avgHR:        data.stats.avgHeartRate,
          maxHR:        data.stats.maxHeartRate,
          avgWatts:     data.stats.avgWatts,
          hrZones:      data.hrZones,
          lapAnalysis,
          laps:         data.laps ?? [],
        }),
      });

      if (!res.ok || !res.body) throw new Error('Błąd API');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      // Split on null-byte separator: text \x00 usage-json
      const nullIdx = buffer.indexOf('\x00');
      if (nullIdx >= 0) {
        setAiText(buffer.slice(0, nullIdx).trim());
        try { setAiUsage(JSON.parse(buffer.slice(nullIdx + 1))); } catch { /* ignore */ }
      } else {
        setAiText(buffer.trim());
      }
    } catch {
      setAiError('Nie udało się wygenerować analizy. Sprawdź klucz ANTHROPIC_API_KEY w Vercel.');
    } finally {
      setAiLoading(false);
    }
  };

  const meta = TYPE_META[typeKey(sportType)];

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', zIndex:300, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'2rem 1rem', overflowY:'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background:'var(--bg)', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-xl)', width:'100%', maxWidth:920, boxShadow:'0 32px 80px rgba(0,0,0,0.25)', marginBottom:'2rem' }}>

        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'0.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:28 }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{activityName}</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
                {sportType}
                {data && ` · ${data.stats.totalDistKm} km · ${fmtTime(data.stats.totalTimeSec)}`}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width:32, height:32, borderRadius:'50%', border:'0.5px solid var(--border-md)', background:'var(--bg-secondary)', cursor:'pointer', fontSize:16, color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'var(--font)' }}
          >×</button>
        </div>

        {/* Content */}
        <div style={{ padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          {loading && (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)', fontSize:14 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📡</div>
              Pobieranie danych ze Stravy…
            </div>
          )}
          {error && <div className="alert alert-warn">{error}</div>}

          {data && !loading && (
            <>
              <RunSummaryNote data={data} />
              <ActivityCharts data={data} />

              {/* AI Analysis */}
              <div style={{ borderTop:'0.5px solid var(--border)', paddingTop:'1.25rem' }}>
                {!aiText && !aiLoading && (
                  <button
                    onClick={handleAiAnalysis}
                    style={{
                      width:'100%', padding:'14px', borderRadius:'var(--radius-lg)',
                      background:'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                      color:'#fff', border:'none', fontSize:15, fontWeight:600,
                      cursor:'pointer', fontFamily:'var(--font)',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                      transition:'opacity 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <span style={{ fontSize:20 }}>🤖</span>
                    Analizuj trening z AI
                  </button>
                )}

                {aiLoading && !aiText && (
                  <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-secondary)', fontSize:14 }}>
                    <div style={{ marginBottom:8, fontSize:20 }}>✨</div>
                    Claude analizuje Twój trening…
                  </div>
                )}

                {(aiText || aiLoading) && (
                  <div style={{ background:'var(--bg-secondary)', borderRadius:'var(--radius-lg)', padding:'1.25rem', border:'0.5px solid var(--border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                      <span style={{ fontSize:16 }}>🤖</span>
                      <span style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)' }}>
                        Analiza Claude · claude-sonnet-4-6
                      </span>
                      {aiLoading && (
                        <span style={{ fontSize:10, color:'#7c3aed', animation:'pulse 1.5s infinite' }}>● generowanie…</span>
                      )}
                    </div>
                    <div
                      ref={aiBoxRef}
                      style={{ fontSize:14, lineHeight:1.75, color:'var(--text)', whiteSpace:'pre-wrap', maxHeight:400, overflowY:'auto' }}
                    >
                      {aiText}
                      {aiLoading && <span style={{ opacity:0.5 }}>▍</span>}
                    </div>
                    {!aiLoading && aiText && (
                      <div style={{ marginTop:12, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                        <button
                          onClick={handleAiAnalysis}
                          style={{ fontSize:12, color:'var(--text-secondary)', background:'none', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-md)', padding:'5px 12px', cursor:'pointer', fontFamily:'var(--font)' }}
                        >
                          ↻ Wygeneruj ponownie
                        </button>
                        {aiUsage && (
                          <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:11, color:'var(--text-secondary)' }}>
                            <span>Koszt analizy: <strong style={{ color:'var(--text)' }}>${aiUsage.costUsd.toFixed(4)}</strong></span>
                            <span style={{ opacity:0.4 }}>·</span>
                            <span>{aiUsage.inputTokens + aiUsage.outputTokens} tokenów</span>
                            <span style={{ opacity:0.4 }}>·</span>
                            <a
                              href="https://console.anthropic.com/settings/billing"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color:'#7c3aed', fontWeight:600, textDecoration:'none' }}
                            >
                              Sprawdź saldo →
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {aiError && (
                  <div className="alert alert-warn" style={{ marginTop:8 }}>{aiError}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
