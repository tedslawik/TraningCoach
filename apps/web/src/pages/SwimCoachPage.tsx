import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import HeroSm from '../components/HeroSm';
import CtaBanner from '../components/CtaBanner';
import WeekCalendar, { WeekZoneSummaryBar, type CalendarActivity } from '../components/shared/WeekCalendar';
import ActivityDetailModal from '../components/athlete/ActivityDetailModal';
import { useAuth } from '../context/AuthContext';

interface SwimActivity { id:number; name:string; sportType:string; date:string; distanceKm:number; distanceM:number; timeFormatted:string; pace:string|null; sufferScore:number|null; avgHeartRate:number|null; hasHeartRate:boolean; zoneTimes:number[]|null; }
interface SwimTotals  { distanceKm:number; timeFormatted:string; avgPace:string|null; avgHeartRate:number|null; sufferScore:number; sessions:number; longestKm:number; zoneTimes:number[]; }
interface SwimData    { weekStart:string; activities:SwimActivity[]; totals:SwimTotals; }

function getMonday(d: Date) { const day=d.getDay()===0?7:d.getDay(); const m=new Date(d); m.setDate(m.getDate()-(day-1)); m.setHours(0,0,0,0); return m; }
function addDays(d: Date, n: number) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function toKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtRange(mon: Date) { const sun=addDays(mon,6); return `${mon.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})} – ${sun.toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'})}`; }

function assessSwims(totals: SwimTotals): Array<{ type:'ok'|'warn'; text:string }> {
  const items: Array<{ type:'ok'|'warn'; text:string }> = [];
  if      (totals.distanceKm < 3)  items.push({ type:'warn', text:`Niski wolumen — ${totals.distanceKm} km. Dla Half IM cel to min. 5 km/tydzień.` });
  else if (totals.distanceKm >= 6)  items.push({ type:'ok',  text:`Dobry wolumen tygodniowy — ${totals.distanceKm} km.` });
  if (totals.sessions < 2)           items.push({ type:'warn', text:`Tylko ${totals.sessions} sesja — min. 2–3 sesje tygodniowo.` });
  else                                items.push({ type:'ok',  text:`${totals.sessions} sesje pływackie — dobra regularność.` });
  if (totals.longestKm < 1.5)        items.push({ type:'warn', text:`Najdłuższa sesja ${totals.longestKm} km — dla Half IM powinno być > 2 km.` });
  return items;
}

function SwimLiveSection({ onActivityClick }: { onActivityClick?: (a: CalendarActivity) => void }) {
  const { session, stravaToken } = useAuth();
  const [weekStart,setWeekStart]=useState(()=>getMonday(new Date()));
  const [data,setData]=useState<SwimData|null>(null);
  const [prevData,setPrevData]=useState<SwimData|null>(null);
  const [loading,setLoading]=useState(false);
  const [weekLoading,setWeekLoading]=useState(false);
  const autoFetched=useRef(false);
  const navBtn: React.CSSProperties = { padding:'7px 14px',borderRadius:'var(--radius-md)',border:'0.5px solid var(--border-md)',background:'var(--bg)',color:'var(--text)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap' };

  const doFetch=useCallback((week:Date,initial=false)=>{
    if(!session)return;
    if(initial)setLoading(true); else setWeekLoading(true);
    const prev = addDays(week, -7);
    Promise.all([
      fetch(`/api/strava/discipline?sport=swim&weekStart=${toKey(week)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}).then(r=>r.ok?r.json():null),
      fetch(`/api/strava/discipline?sport=swim&weekStart=${toKey(prev)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}).then(r=>r.ok?r.json():null),
    ]).then(([cur,p])=>{ if(cur)setData(cur); if(p)setPrevData(p); }).catch(()=>{})
    .finally(()=>{setLoading(false);setWeekLoading(false);});
  },[session]);

  useEffect(()=>{ if(session&&stravaToken&&!autoFetched.current){autoFetched.current=true;doFetch(weekStart,true);} },[session,stravaToken,doFetch,weekStart]);
  useEffect(()=>{ if(data)doFetch(weekStart); },[weekStart]); // eslint-disable-line

  const isCurrentWeek=toKey(weekStart)===toKey(getMonday(new Date()));

  if(!session||!stravaToken) return (
    <div style={{textAlign:'center',padding:'2rem',fontSize:14,color:'var(--text-secondary)'}}>
      Połącz Stravę w <Link to="/athlete" style={{color:'var(--swim)',fontWeight:600}}>Profilu Zawodnika →</Link>, aby zobaczyć swoje pływania.
    </div>
  );
  if(loading) return <section className="alt"><div className="section-inner"><p style={{fontSize:13,color:'var(--text-secondary)'}}>Pobieranie pływań…</p></div></section>;
  if(!data) return null;

  const { totals, activities } = data;
  const deficit = isCurrentWeek && prevData ? (() => {
    const items: string[] = [];
    const dKm = prevData.totals.distanceKm - totals.distanceKm;
    if (dKm > 0.1) items.push(`🏊 ${dKm.toFixed(1)} km`);
    const dS = prevData.totals.sessions - totals.sessions;
    if (dS > 0) items.push(`${dS} ${dS === 1 ? 'sesja' : 'sesje'}`);
    return items.length ? items.join(' · ') : null;
  })() : null;
  const assessment = assessSwims(totals);
  const calActs: CalendarActivity[] = activities.map(a=>({ id:a.id, name:a.name, type:'swim' as const, date:a.date, distanceKm:a.distanceKm, timeFormatted:a.timeFormatted, paceOrSpeed:a.pace, sufferScore:a.sufferScore, avgHeartRate:a.avgHeartRate, zoneTimes:a.zoneTimes, ...(a as unknown as Record<string,unknown>) }));

  return (
    <section className="alt">
      <div className="section-inner">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
          <div>
            <p style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--swim)',marginBottom:4}}>Twoje pływania</p>
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
              {[['Dystans',`${totals.distanceKm} km`],['Czas',totals.timeFormatted],['Śr. tempo /100m',totals.avgPace??'—'],['Śr. HR',totals.avgHeartRate?`${totals.avgHeartRate} bpm`:'—'],['Suffer',totals.sufferScore>0?String(totals.sufferScore):'—'],['Sesje',String(totals.sessions)],['Najdłuższa',`${totals.longestKm} km`]].map(([lbl,val])=>(
                <div key={lbl} style={{background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-md)',padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--swim)'}}>{val}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{lbl}</div>
                </div>
              ))}
            </div>
            {deficit && (
              <div style={{background:'#fef9e0',border:'0.5px solid #fbbf24',borderLeft:'3px solid #f59e0b',borderRadius:'var(--radius-md)',padding:'9px 14px',marginBottom:'1rem',fontSize:13,color:'#92400e',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:700}}>💡 Do poziomu poprzedniego tygodnia brakuje:</span>
                <span>{deficit}</span>
              </div>
            )}
            {isCurrentWeek && prevData && (
              <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:8,textAlign:'right'}}>
                Poprzedni tydzień: {prevData.totals.distanceKm} km · {prevData.totals.sessions} sesji
              </div>
            )}
            <WeekZoneSummaryBar zoneTimes={totals.zoneTimes} totalLabel="Strefy tętna — pływania tygodnia" />
            <WeekCalendar activities={calActs} weekStart={weekStart} loading={weekLoading} emptyLabel="REST" onActivityClick={onActivityClick} />
            {assessment.length>0&&(
              <div style={{marginTop:'1.25rem',display:'flex',flexDirection:'column',gap:8}}>
                {assessment.map((item,i)=><div key={i} className={`alert alert-${item.type}`} style={{margin:0}}>{item.type==='ok'?'✅':'⚠️'} {item.text}</div>)}
              </div>
            )}
          </>
        ):(
          <p style={{fontSize:14,color:'var(--text-secondary)',textAlign:'center',padding:'2rem 0'}}>Brak pływań w tym tygodniu.</p>
        )}
      </div>
    </section>
  );
}

export default function SwimCoachPage() {
  const [selected, setSelected] = useState<CalendarActivity | null>(null);

  return (
    <>
      <HeroSm
        discipline="swim"
        label="Swim Coach"
        title={<>Technika bije<br /><em className="swim">kondycję</em></>}
        subtitle="Pływanie to jedyna dyscyplina triathlonu, gdzie siła i fitness mają drugorzędne znaczenie. Zawodnik z doskonałą techniką pokona silniejszego amatora o złej technice."
      />
      <SwimLiveSection onActivityClick={setSelected} />
      <CtaBanner
        title="Oblicz swoje tempo pływania"
        description="Wpisz dystans i czas — analizator wyliczy Twoje tempo na 100m i szacowany czas wyścigu."
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
