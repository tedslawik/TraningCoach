import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import HeroSm from '../components/HeroSm';
import CtaBanner from '../components/CtaBanner';
import WeekCalendar, { WeekZoneSummaryBar, type CalendarActivity } from '../components/shared/WeekCalendar';
import ActivityDetailModal from '../components/athlete/ActivityDetailModal';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import TrainingPlanSection from '../components/training/TrainingPlanSection';
import { supabase } from '../lib/supabase';

/* ── types & helpers ── */
interface RunActivity { id:number; name:string; sportType:string; date:string; distanceKm:number; timeFormatted:string; pace:string|null; movingTimeSec:number; sufferScore:number|null; avgHeartRate:number|null; maxHeartRate:number|null; elevationGain:number; hasHeartRate:boolean; zoneTimes:number[]|null; }
interface RunTotals  { distanceKm:number; timeFormatted:string; avgPace:string|null; avgHeartRate:number|null; sufferScore:number; sessions:number; longestRunKm:number; zoneTimes:number[]; }
interface RunData    { weekStart:string; activities:RunActivity[]; totals:RunTotals; }

function getMonday(d: Date) { const day=d.getDay()===0?7:d.getDay(); const m=new Date(d); m.setDate(m.getDate()-(day-1)); m.setHours(0,0,0,0); return m; }
function addDays(d: Date, n: number) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function toKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtRange(mon: Date) { const sun=addDays(mon,6); return `${mon.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})} – ${sun.toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'})}`; }

function assessRuns(totals: RunTotals): Array<{ type: 'ok'|'warn'; text: string }> {
  const items: Array<{ type:'ok'|'warn'; text:string }> = [];
  if      (totals.distanceKm < 15)  items.push({ type:'warn', text:`Niski wolumen — ${totals.distanceKm} km. Dla Half IM cel to min. 30 km/tydzień.` });
  else if (totals.distanceKm >= 30) items.push({ type:'ok',  text:`Dobry wolumen tygodniowy — ${totals.distanceKm} km.` });
  if (totals.sessions < 2)           items.push({ type:'warn', text:`Tylko ${totals.sessions} bieg — dla triathlonu min. 3 sesje tygodniowo.` });
  else                                items.push({ type:'ok',  text:`${totals.sessions} sesje biegowe — dobra regularność.` });
  if (totals.longestRunKm < 10)      items.push({ type:'warn', text:`Brak długiego biegu (najdłuższy: ${totals.longestRunKm} km). Dla Half IM powinien być > 14 km.` });
  const zt=totals.zoneTimes; const ztTotal=zt.reduce((s,v)=>s+v,0);
  if (ztTotal>60) {
    const highPct=Math.round(((zt[2]+zt[3]+zt[4])/ztTotal)*100);
    if (highPct>25) items.push({ type:'warn', text:`Za dużo intensywności — ${highPct}% czasu w Z3+. Więcej łatwych biegów.` });
    else            items.push({ type:'ok',   text:`Dobra dystrybucja intensywności.` });
  }
  return items;
}

/* ── live section ── */
function RunLiveSection({ onActivityClick }: { onActivityClick?: (a: CalendarActivity) => void }) {
  const { session, stravaToken } = useAuth();
  const [weekStart,setWeekStart]=useState(()=>getMonday(new Date()));
  const [data,setData]=useState<RunData|null>(null);
  const [prevData,setPrevData]=useState<RunData|null>(null);
  const [loading,setLoading]=useState(false);
  const [weekLoading,setWeekLoading]=useState(false);
  const autoFetched=useRef(false);
  const navBtn: React.CSSProperties = { padding:'7px 14px',borderRadius:'var(--radius-md)',border:'0.5px solid var(--border-md)',background:'var(--bg)',color:'var(--text)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap' };

  const doFetch=useCallback((week:Date,initial=false)=>{
    if(!session)return;
    if(initial)setLoading(true); else setWeekLoading(true);
    const prevWeek = addDays(week, -7);
    Promise.all([
      fetch(`/api/strava/discipline?sport=run&weekStart=${toKey(week)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}).then(r=>r.ok?r.json():null),
      fetch(`/api/strava/discipline?sport=run&weekStart=${toKey(prevWeek)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}).then(r=>r.ok?r.json():null),
    ]).then(([cur,prev])=>{
      if(cur) setData(cur);
      if(prev) setPrevData(prev);
    }).catch(()=>{})
    .finally(()=>{setLoading(false);setWeekLoading(false);});
  },[session]);

  useEffect(()=>{ if(session&&stravaToken&&!autoFetched.current){autoFetched.current=true;doFetch(weekStart,true);} },[session,stravaToken,doFetch,weekStart]);
  useEffect(()=>{ if(data)doFetch(weekStart); },[weekStart]); // eslint-disable-line

  const isCurrentWeek=toKey(weekStart)===toKey(getMonday(new Date()));

  if(!session||!stravaToken) return (
    <div style={{textAlign:'center',padding:'2rem',fontSize:14,color:'var(--text-secondary)'}}>
      Połącz Stravę w <Link to="/athlete" style={{color:'var(--run)',fontWeight:600}}>Profilu Zawodnika →</Link>, aby zobaczyć swoje biegi.
    </div>
  );
  if(loading) return <section className="alt"><div className="section-inner"><p style={{fontSize:13,color:'var(--text-secondary)'}}>Pobieranie biegów…</p></div></section>;
  if(!data) return null;

  const { totals, activities } = data;
  const { isEnabled } = usePreferences();
  const assessment = assessRuns(totals);

  // Deficit vs previous week (only shown when current week is active)
  const deficit = isCurrentWeek && prevData ? (() => {
    const pt = prevData.totals;
    const items: string[] = [];
    const dKm = pt.distanceKm - totals.distanceKm;
    if (dKm > 0.5) items.push(`🏃 ${dKm.toFixed(1)} km`);
    const dSess = pt.sessions - totals.sessions;
    if (dSess > 0) items.push(`${dSess} ${dSess === 1 ? 'sesja' : 'sesje'}`);
    return items.length ? items.join(' · ') : null;
  })() : null;
  const calActs: CalendarActivity[] = activities.map(a=>({ id:a.id, name:a.name, type:'run' as const, date:a.date, distanceKm:a.distanceKm, timeFormatted:a.timeFormatted, paceOrSpeed:a.pace, sufferScore:a.sufferScore, avgHeartRate:a.avgHeartRate, elevationGain:a.elevationGain, zoneTimes:a.zoneTimes, ...(a as unknown as Record<string,unknown>) }));

  return (
    <section className="alt">
      <div className="section-inner">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
          <div>
            <p style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--run)',marginBottom:4}}>Twoje biegi</p>
            <h2 style={{fontSize:'clamp(20px,3vw,28px)',fontWeight:700,letterSpacing:-0.8}}>{weekLoading?'Ładowanie…':fmtRange(weekStart)}</h2>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setWeekStart(w=>addDays(w,-7))} style={navBtn}>← Poprzedni</button>
            <button onClick={()=>{if(!isCurrentWeek)setWeekStart(w=>addDays(w,7));}} disabled={isCurrentWeek} style={{...navBtn,opacity:isCurrentWeek?0.35:1}}>Następny →</button>
          </div>
        </div>

        {totals.sessions>0?(
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,marginBottom:'1.25rem'}}>
              {[['Dystans',`${totals.distanceKm} km`],['Czas',totals.timeFormatted],['Śr. tempo',totals.avgPace??'—'],['Śr. HR',totals.avgHeartRate?`${totals.avgHeartRate} bpm`:'—'],['Suffer',totals.sufferScore>0?String(totals.sufferScore):'—'],['Sesje',String(totals.sessions)],['Najdłuższy',`${totals.longestRunKm} km`]].map(([lbl,val])=>(
                <div key={lbl} style={{background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-md)',padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--run)'}}>{val}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{lbl}</div>
                </div>
              ))}
            </div>
            {/* Deficit vs previous week */}
            {isEnabled('run_weekly_comparison') && deficit && (
              <div style={{background:'#fef9e0',border:'0.5px solid #fbbf24',borderLeft:'3px solid #f59e0b',borderRadius:'var(--radius-md)',padding:'9px 14px',marginBottom:'1rem',fontSize:13,color:'#92400e',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:700}}>💡 Do poziomu poprzedniego tygodnia brakuje:</span>
                <span>{deficit}</span>
              </div>
            )}
            {/* Previous week reference */}
            {isEnabled('run_weekly_comparison') && isCurrentWeek && prevData && (
              <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:8,textAlign:'right'}}>
                Poprzedni tydzień: {prevData.totals.distanceKm} km · {prevData.totals.sessions} sesji · śr. {prevData.totals.avgPace ?? '—'}
              </div>
            )}
            <WeekZoneSummaryBar zoneTimes={totals.zoneTimes} totalLabel="Strefy tętna — biegi tygodnia" />
            <WeekCalendar activities={calActs} weekStart={weekStart} loading={weekLoading} emptyLabel="REST" onActivityClick={onActivityClick} />
            {isEnabled('run_assessment') && assessment.length>0&&(
              <div style={{marginTop:'1.25rem',display:'flex',flexDirection:'column',gap:8}}>
                {assessment.map((item,i)=><div key={i} className={`alert alert-${item.type}`} style={{margin:0}}>{item.type==='ok'?'✅':'⚠️'} {item.text}</div>)}
              </div>
            )}
          </>
        ):(
          <p style={{fontSize:14,color:'var(--text-secondary)',textAlign:'center',padding:'2rem 0'}}>Brak biegów w tym tygodniu.</p>
        )}
      </div>
    </section>
  );
}

/* ── page ── */
/* ── AI Technique Insights ── */
function RunTrainingInsights() {
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
      // Parallel: fetch runs + 4 weeks of weekly summaries (for proportions context)
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
        .slice(0, 7); // last 7 runs (Strava returns most recent first)

      if (!acts.length) throw new Error('Brak aktywności biegowych z danymi');

      // Training proportions from last 4 weeks (target: Half IM 20/45/35)
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
        targetSwim: 20, targetBike: 45, targetRun: 35, // Half IM defaults
      } : null;

      // Per-run stats (not totals — multiple separate runs)
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
      const avgPaceMS = paceValues.length ? avgOf(paceValues)! : null; // min/km
      const avgDistKm = distValues.length ? +(avgOf(distValues)!.toFixed(1)) : null;
      const avgTimeSec = avgDistKm && avgPaceMS ? Math.round(avgDistKm * avgPaceMS * 60) : null;

      // Cadence by pace zone (key insight: optimal cadence depends on pace)
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

      const zoneEasy     = groupActs(5.5, 99);   // > 5:30/km
      const zoneMod      = groupActs(4.5, 5.5);  // 4:30–5:30/km
      const zoneFast     = groupActs(0,   4.5);  // < 4:30/km

      const lowCadPct  = cadences.length ? Math.round(cadences.filter(c=>c<165).length/cadences.length*100) : null;
      const highCadPct = cadences.length ? Math.round(cadences.filter(c=>c>=170&&c<=185).length/cadences.length*100) : null;

      // Per-run extended metrics (suffer, temp, workout type, elevation)
      const sufferScores = acts.map((a: Record<string,unknown>) => a.sufferScore as number).filter((v: unknown): v is number => typeof v === 'number');
      const temps        = acts.map((a: Record<string,unknown>) => a.avgTemp as number).filter((v: unknown): v is number => typeof v === 'number');
      const elevGains    = acts.map((a: Record<string,unknown>) => a.elevationGain as number).filter((v: unknown): v is number => typeof v === 'number' && v > 0);
      const workoutTypes = acts.map((a: Record<string,unknown>) => a.workoutType as number | null).filter((v): v is number => v !== null);
      // Strava workout_type for runs: 1=race, 2=long run, 3=workout
      const wtCounts = { race: 0, longRun: 0, workout: 0 };
      workoutTypes.forEach(t => { if (t === 1) wtCounts.race++; else if (t === 2) wtCounts.longRun++; else if (t === 3) wtCounts.workout++; });

      const aiRes = await fetch('/api/ai/analyze-workout', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({
          activityName: `Kompleksowa analiza treningowa — ${n} ostatnich biegów`,
          sportType:    'Run',
          startDate:    new Date().toISOString(),
          totalDistKm:  avgDistKm,
          totalTimeSec: avgTimeSec,
          elevGain:     elevGains.length ? Math.round(elevGains.reduce((s,v)=>s+v,0)/elevGains.length) : 0,
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
            // NEW: physiological and effort context
            avgSufferScore: sufferScores.length ? Math.round(sufferScores.reduce((s: number, v: number)=>s+v,0)/sufferScores.length) : null,
            maxSufferScore: sufferScores.length ? Math.max(...sufferScores) : null,
            avgTempC:       temps.length ? Math.round(temps.reduce((s: number, v: number)=>s+v,0)/temps.length) : null,
            workoutMix:     workoutTypes.length ? wtCounts : null,
            elevGainsSum:   elevGains.length ? elevGains.reduce((s: number, v: number)=>s+v,0) : 0,
          },
          // NEW: training proportions context (cross-discipline)
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
        // Auto-save insights to DB
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
    { keys:['OGÓLNA OCENA'],                          label:'Ogólna ocena',         color:'#60a5fa', icon:'📊' },
    { keys:['PROPORCJE TRENINGOWE','PROPORCJE'],      label:'Proporcje S/B/R',      color:'#a855f7', icon:'⚖️' },
    { keys:['TECHNIKA I FIZJOLOGIA','TECHNIKA'],      label:'Technika i fizjologia', color:'#34d399', icon:'🏃' },
    { keys:['WSKAZÓWKI NA PRZYSZŁOŚĆ','WSKAZÓWKI'],   label:'Wskazówki',            color:'#fb923c', icon:'💡' },
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
    <section>
      <div className="section-inner">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:12 }}>
          <div>
            <p style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--run)', marginBottom:4 }}>AI Coach</p>
            <h2 style={{ fontSize:'clamp(18px,2.5vw,24px)', fontWeight:700, letterSpacing:-0.5 }}>Analiza treningowa</h2>
          </div>
          {!loading && <button onClick={analyze} style={{ padding:'9px 20px', borderRadius:'var(--radius-md)', background:'linear-gradient(135deg,var(--run),#b91c1c)', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:8 }}>
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

export default function RunCoachPage() {
  const [selected, setSelected] = useState<CalendarActivity | null>(null);
  const { isEnabled } = usePreferences();

  return (
    <>
      <HeroSm
        discipline="run"
        label="Run Coach"
        title={<>Finiszuj mocno,<br /><em className="run">zawsze</em></>}
        subtitle="Biegasz po 90 lub 180 km w siodle. Twój bieg triathlonowy wymaga specjalnego przygotowania — nie tylko kondycji, ale i adaptacji nerwowo-mięśniowej."
      />
      <RunLiveSection onActivityClick={setSelected} />
      {isEnabled('run_technique_ai') && <RunTrainingInsights />}
      <TrainingPlanSection sport="run" />
      <CtaBanner
        title="Sprawdź swoje proporcje treningowe"
        description="Analizator wyliczy czy Twoje treningi mają odpowiedni podział między dyscypliny."
      />
      {selected && (
        <ActivityDetailModal
          activityId={selected.id}
          activityName={selected.name}
          sportType={(selected as unknown as {sportType?: string}).sportType ?? selected.type}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
