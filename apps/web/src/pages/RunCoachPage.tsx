import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import HeroSm from '../components/HeroSm';
import CtaBanner from '../components/CtaBanner';
import WeekCalendar, { WeekZoneSummaryBar, type CalendarActivity } from '../components/shared/WeekCalendar';
import ActivityDetailModal from '../components/athlete/ActivityDetailModal';
import { useAuth } from '../context/AuthContext';

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
  const [loading,setLoading]=useState(false);
  const [weekLoading,setWeekLoading]=useState(false);
  const autoFetched=useRef(false);
  const navBtn: React.CSSProperties = { padding:'7px 14px',borderRadius:'var(--radius-md)',border:'0.5px solid var(--border-md)',background:'var(--bg)',color:'var(--text)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap' };

  const doFetch=useCallback((week:Date,initial=false)=>{
    if(!session)return;
    if(initial)setLoading(true); else setWeekLoading(true);
    fetch(`/api/strava/runs?weekStart=${toKey(week)}`,{headers:{Authorization:`Bearer ${session.access_token}`}})
      .then(r=>r.ok?r.json():null).then(d=>{if(d)setData(d);}).catch(()=>{})
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
  const assessment = assessRuns(totals);
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
            <WeekZoneSummaryBar zoneTimes={totals.zoneTimes} totalLabel="Strefy tętna — biegi tygodnia" />
            <WeekCalendar activities={calActs} weekStart={weekStart} loading={weekLoading} emptyLabel="REST" onActivityClick={onActivityClick} />
            {assessment.length>0&&(
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
export default function RunCoachPage() {
  const [selected, setSelected] = useState<CalendarActivity | null>(null);

  return (
    <>
      <HeroSm
        discipline="run"
        label="Run Coach"
        title={<>Finiszuj mocno,<br /><em className="run">zawsze</em></>}
        subtitle="Biegasz po 90 lub 180 km w siodle. Twój bieg triathlonowy wymaga specjalnego przygotowania — nie tylko kondycji, ale i adaptacji nerwowo-mięśniowej."
      />
      <RunLiveSection onActivityClick={setSelected} />
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
