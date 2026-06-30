import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

/**
 * Comprehensive AI training analysis: technique + cross-discipline proportions.
 * Pulls last 7 runs (cadence, EF, suffer, temp, workout type) and 4 weeks
 * of S/B/R proportions, sends to Claude for narrative analysis.
 */
export default function TrainingInsights() {
  const { session, user } = useAuth();
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string|null>(null);
  const [usage, setUsage]     = useState<{tokens:number;cost:string}|null>(null);

  // Load saved insights from DB
  useEffect(() => {
    if (!session) return;
    fetch('/api/training/run-zones', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.insights?.content) setText(d.insights.content); })
      .catch(() => {});
  }, [session]);

  const analyze = async () => {
    if (!session || !user) return;
    setLoading(true); setText(''); setError(null); setUsage(null);
    try {
      const [actsRes, summariesRes] = await Promise.all([
        fetch('/api/strava/discipline?sport=run&daysBack=30', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        supabase.from('weekly_summaries').select('*').eq('user_id', user.id).order('week_start', { ascending:false }).limit(4),
      ]);

      if (!actsRes.ok) throw new Error('Brak danych biegowych');
      const actsData = await actsRes.json();
      const acts = (actsData.activities ?? [])
        .filter((a: Record<string,unknown>) => a.avgCadence || a.avgHeartRate)
        .slice(0, 7);

      if (!acts.length) throw new Error('Brak aktywności biegowych z danymi');

      const summaries = summariesRes.data ?? [];
      const wkSum = (k: string) => summaries.reduce((s: number, w: Record<string,unknown>) => s + ((w[k] as number) ?? 0), 0);
      const swimMin = wkSum('swim_time_min'),  bikeMin = wkSum('bike_time_min'),  runMin = wkSum('run_time_min');
      const totalMin = swimMin + bikeMin + runMin;
      const proportions = totalMin > 0 ? {
        weeks: summaries.length,
        totalHours: Math.round((totalMin / 60) * 10) / 10,
        swimPct: Math.round((swimMin / totalMin) * 100),
        bikePct: Math.round((bikeMin / totalMin) * 100),
        runPct:  Math.round((runMin  / totalMin) * 100),
        swimSessions: summaries.reduce((s: number, w: Record<string,unknown>) => s + ((w.swim_sessions as number) ?? 0), 0),
        bikeSessions: summaries.reduce((s: number, w: Record<string,unknown>) => s + ((w.bike_sessions as number) ?? 0), 0),
        runSessions:  summaries.reduce((s: number, w: Record<string,unknown>) => s + ((w.run_sessions  as number) ?? 0), 0),
        avgWeeklyTSS: summaries.length ? Math.round(summaries.reduce((s: number, w: Record<string,unknown>) => s + ((w.tss as number) ?? 0), 0) / summaries.length) : 0,
        targetSwim: 20, targetBike: 45, targetRun: 35,
      } : null;

      const n          = acts.length;
      const cadences   = acts.map((a: Record<string,unknown>) => a.avgCadence as number).filter(Boolean) as number[];
      const hrValues   = acts.map((a: Record<string,unknown>) => a.avgHeartRate as number).filter(Boolean) as number[];
      const paceValues = acts.map((a: Record<string,unknown>) => {
        const d = a.distanceKm as number, t = (a.movingTimeSec as number) / 60;
        return d > 0 && t > 0 ? t / d : null;
      }).filter(Boolean) as number[];
      const distValues = acts.map((a: Record<string,unknown>) => a.distanceKm as number).filter(Boolean) as number[];

      const avgOf = (arr: number[]) => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;
      const avgCad    = cadences.length  ? Math.round(avgOf(cadences)!)  : null;
      const avgHRNum  = hrValues.length  ? Math.round(avgOf(hrValues)!)  : null;
      const avgPaceMS = paceValues.length ? avgOf(paceValues)! : null;
      const avgDistKm = distValues.length ? +(avgOf(distValues)!.toFixed(1)) : null;
      const avgTimeSec = avgDistKm && avgPaceMS ? Math.round(avgDistKm * avgPaceMS * 60) : null;

      const groupActs = (minPace: number, maxPace: number) => {
        const g = acts.filter((a: Record<string,unknown>) => {
          const d = a.distanceKm as number, t = (a.movingTimeSec as number)/60;
          if (!d || !t) return false;
          const pace = t/d;
          return pace >= minPace && pace < maxPace;
        });
        const gCads = g.map((a: Record<string,unknown>) => a.avgCadence as number).filter(Boolean) as number[];
        const gPaces = g.map((a: Record<string,unknown>) => { const d=a.distanceKm as number,t=(a.movingTimeSec as number)/60; return d>0?t/d:null; }).filter(Boolean) as number[];
        const ac = gCads.length ? Math.round(avgOf(gCads)!) : null;
        const ap = gPaces.length ? avgOf(gPaces)! : null;
        const apStr = ap ? `${Math.floor(ap)}:${String(Math.round((ap%1)*60)).padStart(2,'0')}` : null;
        return { count: g.length, avgCad: ac, avgPace: apStr };
      };

      const zoneEasy = groupActs(5.5, 99);
      const zoneMod  = groupActs(4.5, 5.5);
      const zoneFast = groupActs(0,   4.5);

      const lowCadPct  = cadences.length ? Math.round(cadences.filter(c=>c<165).length/cadences.length*100) : null;
      const highCadPct = cadences.length ? Math.round(cadences.filter(c=>c>=170&&c<=185).length/cadences.length*100) : null;

      const sufferScores = acts.map((a: Record<string,unknown>) => a.sufferScore as number).filter((v: unknown): v is number => typeof v === 'number');
      const temps        = acts.map((a: Record<string,unknown>) => a.avgTemp as number).filter((v: unknown): v is number => typeof v === 'number');
      const elevGains    = acts.map((a: Record<string,unknown>) => a.elevationGain as number).filter((v: unknown): v is number => typeof v === 'number' && v > 0);
      const workoutTypes = acts.map((a: Record<string,unknown>) => a.workoutType as number | null).filter((v: number | null): v is number => v !== null);
      const wtCounts = { race: 0, longRun: 0, workout: 0 };
      workoutTypes.forEach((t: number) => { if (t === 1) wtCounts.race++; else if (t === 2) wtCounts.longRun++; else if (t === 3) wtCounts.workout++; });

      const aiRes = await fetch('/api/ai/analyze-workout', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({
          activityName: `Kompleksowa analiza treningowa — ${n} ostatnich biegów`,
          sportType:    'Run',
          startDate:    new Date().toISOString(),
          totalDistKm:  avgDistKm,
          totalTimeSec: avgTimeSec,
          elevGain:     elevGains.length ? Math.round(elevGains.reduce((s: number, v: number) => s+v, 0)/elevGains.length) : 0,
          avgHR:        avgHRNum,
          maxHR:        null, avgWatts: null,
          avgVelocityMs: avgPaceMS ? 1000 / (avgPaceMS * 60) : null,
          avgCadence:   avgCad,
          hrZones:      actsData.hrZones,
          lapAnalysis:  null, laps: [],
          multiRunContext: {
            runsAnalyzed:  n,
            avgDistKm,
            avgPaceMinKm:  avgPaceMS ? `${Math.floor(avgPaceMS)}:${String(Math.round((avgPaceMS%1)*60)).padStart(2,'0')}` : null,
            avgCadence:    avgCad,
            pctBelow165spm:  lowCadPct,
            pctOptimal170_185spm: highCadPct,
            minCadence:    cadences.length ? Math.min(...cadences) : null,
            maxCadence:    cadences.length ? Math.max(...cadences) : null,
            cadenceByPaceZone: {
              easy:     { label:'>5:30/km (Z1-Z2 spokojny)',    ...zoneEasy,  optimalRange:'160–172' },
              moderate: { label:'4:30–5:30/km (Z3 umiarkowany)',...zoneMod,   optimalRange:'166–178' },
              fast:     { label:'<4:30/km (Z4-Z5 szybki)',       ...zoneFast, optimalRange:'172–184' },
            },
            avgSufferScore: sufferScores.length ? Math.round(sufferScores.reduce((s: number, v: number)=>s+v,0)/sufferScores.length) : null,
            maxSufferScore: sufferScores.length ? Math.max(...sufferScores) : null,
            avgTempC:       temps.length ? Math.round(temps.reduce((s: number, v: number)=>s+v,0)/temps.length) : null,
            workoutMix:     workoutTypes.length ? wtCounts : null,
            elevGainsSum:   elevGains.length ? elevGains.reduce((s: number, v: number)=>s+v,0) : 0,
          },
          trainingProportions: proportions,
          techniqueFocus: true,
        }),
      });

      if (!aiRes.ok || !aiRes.body) throw new Error('Błąd AI');
      const reader  = aiRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
      }
      const nullIdx = buf.indexOf('\x00');
      if (nullIdx >= 0) {
        const insightsText = buf.slice(0, nullIdx).trim();
        setText(insightsText);
        try {
          const u = JSON.parse(buf.slice(nullIdx+1));
          setUsage({ tokens: u.inputTokens+u.outputTokens, cost: `$${u.costUsd.toFixed(4)}` });
        } catch { /* ignore */ }
        if (insightsText && session) {
          fetch('/api/training/run-zones', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
            body: JSON.stringify({ insights: insightsText }),
          }).catch(() => {});
        }
      } else {
        const insightsText = buf.trim();
        setText(insightsText);
        if (insightsText && session) {
          fetch('/api/training/run-zones', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
            body: JSON.stringify({ insights: insightsText }),
          }).catch(() => {});
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Błąd'); }
    finally { setLoading(false); }
  };

  if (!session) return null;

  const SECTIONS = [
    { keys:['OGÓLNA OCENA'],                          label:'Ogólna ocena',          color:'#60a5fa', icon:'📊' },
    { keys:['PROPORCJE TRENINGOWE','PROPORCJE'],      label:'Proporcje S/B/R',       color:'#a855f7', icon:'⚖️' },
    { keys:['TECHNIKA I FIZJOLOGIA','TECHNIKA'],      label:'Technika i fizjologia', color:'#34d399', icon:'🏃' },
    { keys:['WSKAZÓWKI NA PRZYSZŁOŚĆ','WSKAZÓWKI'],   label:'Wskazówki',             color:'#fb923c', icon:'💡' },
  ];

  const upperText = text.toUpperCase();
  const parsed = SECTIONS.map(s => {
    for (const key of s.keys) {
      const idx = upperText.indexOf(key);
      if (idx !== -1) return { def:s, start:idx, headerLen:key.length };
    }
    return null;
  }).filter(Boolean).sort((a,b)=>a!.start-b!.start) as Array<{def:typeof SECTIONS[0];start:number;headerLen:number}>;

  const sections = parsed.map((p,i) => ({
    def: p.def,
    content: text.slice(p.start+p.headerLen, parsed[i+1]?.start ?? text.length).replace(/^\s*[:\-–]\s*/,'').trim(),
  }));

  return (
    <section className="alt">
      <div className="section-inner">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:12 }}>
          <div>
            <p style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--tri)', marginBottom:4 }}>AI Coach</p>
            <h2 style={{ fontSize:'clamp(18px,2.5vw,24px)', fontWeight:700, letterSpacing:-0.5 }}>Analiza treningowa</h2>
          </div>
          {!loading && <button onClick={analyze} style={{ padding:'9px 20px', borderRadius:'var(--radius-md)', background:'linear-gradient(135deg,var(--tri),#5b21b6)', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:8 }}>
            <span>🤖</span> {text ? 'Odśwież analizę' : 'Analizuj treningi'}
          </button>}
        </div>

        {loading && <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-secondary)', fontSize:14 }}>✨ Analizuję Twoje biegi…</div>}
        {error  && <div className="alert alert-warn">{error}</div>}

        {sections.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {sections.map(({ def, content }) => (
              <div key={def.label} style={{ borderLeft:`4px solid ${def.color}`, borderRadius:'var(--radius-md)', background:`${def.color}0d`, padding:'12px 16px' }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:def.color, marginBottom:7, display:'flex', alignItems:'center', gap:6 }}>
                  {def.icon} {def.label}
                </div>
                <div style={{ fontSize:14, lineHeight:1.7, color:'var(--text)' }}>{content}</div>
              </div>
            ))}
            {usage && (
              <div style={{ fontSize:11, color:'var(--text-secondary)', textAlign:'right', marginTop:4 }}>
                {usage.cost} · {usage.tokens} tokenów
              </div>
            )}
          </div>
        )}

        {!text && !loading && !error && (
          <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-secondary)', fontSize:14, lineHeight:1.6 }}>
            Kliknij przycisk powyżej — AI przeanalizuje 7 ostatnich biegów (kadencja, EF, suffer, temperatura, typ treningu) <br/>
            oraz proporcje treningowe S/B/R z ostatnich 4 tygodni.
          </div>
        )}
      </div>
    </section>
  );
}
