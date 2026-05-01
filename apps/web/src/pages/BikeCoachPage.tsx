import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import HeroSm from '../components/HeroSm';
import CtaBanner from '../components/CtaBanner';
import WeekCalendar, { WeekZoneSummaryBar, type CalendarActivity } from '../components/shared/WeekCalendar';
import ActivityDetailModal from '../components/athlete/ActivityDetailModal';
import { useAuth } from '../context/AuthContext';

const PWR_ZONE_COLORS = ['#60a5fa','#34d399','#fbbf24','#fb923c','#f87171','#e11d48','#7c3aed'];
const PWR_ZONE_LABELS = ['Z1','Z2','Z3 Tempo','Z4 Próg','Z5 VO2','Z6 Anaer.','Z7 Sprint'];

interface BikeActivity { id:number; name:string; sportType:string; date:string; distanceKm:number; elevationGain:number; timeFormatted:string; speed:string|null; sufferScore:number|null; avgHeartRate:number|null; avgWatts:number|null; normalizedWatts:number|null; kilojoules:number|null; avgCadence:number|null; tss:number|null; if_:number|null; hasHeartRate:boolean; deviceWatts:boolean; zoneTimes:number[]|null; powerZoneTimes:number[]|null; }
interface BikeTotals  { distanceKm:number; timeFormatted:string; avgSpeed:string|null; avgWatts:number|null; kilojoules:number; sufferScore:number; tss:number; sessions:number; longestKm:number; weeklyPwrZones:number[]; weeklyHRZones:number[]; }
interface BikeData    { weekStart:string; ftp:number|null; powerZones:Array<{min:number;max:number}>|null; activities:BikeActivity[]; totals:BikeTotals; }

function getMonday(d: Date) { const day=d.getDay()===0?7:d.getDay(); const m=new Date(d); m.setDate(m.getDate()-(day-1)); m.setHours(0,0,0,0); return m; }
function addDays(d: Date, n: number) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function toKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtRange(mon: Date) { const sun=addDays(mon,6); return `${mon.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})} – ${sun.toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'})}`; }

function assessBikes(totals: BikeTotals, ftp: number|null): Array<{ type:'ok'|'warn'; text:string }> {
  const items: Array<{ type:'ok'|'warn'; text:string }> = [];
  if      (totals.distanceKm < 50)  items.push({ type:'warn', text:`Niski wolumen — ${totals.distanceKm} km. Dla Half IM cel to min. 100 km/tydzień.` });
  else if (totals.distanceKm >= 100) items.push({ type:'ok',  text:`Dobry wolumen tygodniowy — ${totals.distanceKm} km.` });
  if (totals.tss>0) {
    if      (totals.tss < 200) items.push({ type:'warn', text:`TSS ${totals.tss} — niskie obciążenie (cel: 300–600 dla Half IM).` });
    else if (totals.tss <= 600) items.push({ type:'ok',  text:`TSS ${totals.tss} — dobre obciążenie treningowe.` });
    else                        items.push({ type:'warn', text:`TSS ${totals.tss} — bardzo wysokie. Zadbaj o regenerację.` });
  }
  const pz=totals.weeklyPwrZones; const pzTotal=pz.reduce((s,v)=>s+v,0);
  if (pzTotal>60 && ftp && totals.avgWatts) {
    const IF=Math.round((totals.avgWatts/ftp)*100);
    items.push({ type: IF<=78?'ok':'warn', text:`Intensity Factor: ${IF}% FTP${IF<=78?' — ekonomiczna jazda.':' — dość intensywnie.'}` });
  }
  return items;
}

function BikeLiveSection({ onActivityClick }: { onActivityClick?: (a: CalendarActivity) => void }) {
  const { session, stravaToken } = useAuth();
  const [weekStart,setWeekStart]=useState(()=>getMonday(new Date()));
  const [data,setData]=useState<BikeData|null>(null);
  const [loading,setLoading]=useState(false);
  const [weekLoading,setWeekLoading]=useState(false);
  const autoFetched=useRef(false);
  const navBtn: React.CSSProperties = { padding:'7px 14px',borderRadius:'var(--radius-md)',border:'0.5px solid var(--border-md)',background:'var(--bg)',color:'var(--text)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap' };

  const doFetch=useCallback((week:Date,initial=false)=>{
    if(!session)return;
    if(initial)setLoading(true); else setWeekLoading(true);
    fetch(`/api/strava/bikes?weekStart=${toKey(week)}`,{headers:{Authorization:`Bearer ${session.access_token}`}})
      .then(r=>r.ok?r.json():null).then(d=>{if(d)setData(d);}).catch(()=>{})
      .finally(()=>{setLoading(false);setWeekLoading(false);});
  },[session]);

  useEffect(()=>{ if(session&&stravaToken&&!autoFetched.current){autoFetched.current=true;doFetch(weekStart,true);} },[session,stravaToken,doFetch,weekStart]);
  useEffect(()=>{ if(data)doFetch(weekStart); },[weekStart]); // eslint-disable-line

  const isCurrentWeek=toKey(weekStart)===toKey(getMonday(new Date()));

  if(!session||!stravaToken) return (
    <div style={{textAlign:'center',padding:'2rem',fontSize:14,color:'var(--text-secondary)'}}>
      Połącz Stravę w <Link to="/athlete" style={{color:'var(--bike)',fontWeight:600}}>Profilu Zawodnika →</Link>, aby zobaczyć swoje jazdy.
    </div>
  );
  if(loading) return <section className="alt"><div className="section-inner"><p style={{fontSize:13,color:'var(--text-secondary)'}}>Pobieranie jazd…</p></div></section>;
  if(!data) return null;

  const { totals, activities, ftp, powerZones } = data;
  const assessment = assessBikes(totals, ftp);
  const calActs: CalendarActivity[] = activities.map(a=>({ id:a.id, name:a.name, type:'bike' as const, date:a.date, distanceKm:a.distanceKm, timeFormatted:a.timeFormatted, paceOrSpeed:a.speed, sufferScore:a.sufferScore, avgHeartRate:a.avgHeartRate, avgWatts:a.avgWatts, normalizedWatts:a.normalizedWatts, elevationGain:a.elevationGain, tss:a.tss, zoneTimes:a.zoneTimes, powerZoneTimes:a.powerZoneTimes, ...(a as Record<string,unknown>) }));

  return (
    <section className="alt">
      <div className="section-inner">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
          <div>
            <p style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--bike)',marginBottom:4}}>
              Twoje jazdy{ftp&&<span style={{fontWeight:400,marginLeft:8,color:'var(--text-secondary)'}}>· FTP {ftp} W</span>}
            </p>
            <h2 style={{fontSize:'clamp(20px,3vw,28px)',fontWeight:700,letterSpacing:-0.8}}>{weekLoading?'Ładowanie…':fmtRange(weekStart)}</h2>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setWeekStart(w=>addDays(w,-7))} style={navBtn}>← Poprzedni</button>
            <button onClick={()=>{if(!isCurrentWeek)setWeekStart(w=>addDays(w,7));}} disabled={isCurrentWeek} style={{...navBtn,opacity:isCurrentWeek?0.35:1}}>Następny →</button>
          </div>
        </div>

        {totals.sessions>0?(
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10,marginBottom:'1.25rem'}}>
              {[['Dystans',`${totals.distanceKm} km`],['Czas',totals.timeFormatted],['Śr. prędkość',totals.avgSpeed??'—'],['Śr. moc',totals.avgWatts?`${totals.avgWatts} W`:'—'],['Energia',totals.kilojoules?`${(totals.kilojoules/1000).toFixed(1)} MJ`:'—'],['TSS',totals.tss>0?String(totals.tss):'—'],['Sesje',String(totals.sessions)]].map(([lbl,val])=>(
                <div key={lbl} style={{background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-md)',padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--bike)'}}>{val}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{lbl}</div>
                </div>
              ))}
            </div>
            {totals.weeklyPwrZones.some(v=>v>0)&&<WeekZoneSummaryBar zoneTimes={totals.weeklyPwrZones} colors={PWR_ZONE_COLORS} labels={PWR_ZONE_LABELS} totalLabel="Strefy mocy — jazdy tygodnia" />}
            {totals.weeklyHRZones.some(v=>v>0)&&<WeekZoneSummaryBar zoneTimes={totals.weeklyHRZones} totalLabel="Strefy tętna — jazdy tygodnia" />}
            {ftp&&powerZones&&(
              <div style={{marginBottom:'1.25rem',background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'14px 16px'}}>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-secondary)',marginBottom:10}}>Twoje strefy mocy (FTP {ftp} W)</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:6}}>
                  {powerZones.slice(0,7).map((z,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:'var(--radius-sm)',background:'var(--bg-secondary)'}}>
                      <div style={{width:10,height:10,borderRadius:2,background:PWR_ZONE_COLORS[i],flexShrink:0}}/>
                      <div>
                        <div style={{fontSize:11,fontWeight:600,color:'var(--text)'}}>{PWR_ZONE_LABELS[i]}</div>
                        <div style={{fontSize:10,color:'var(--text-secondary)'}}>{z.min<=0?`< ${z.max} W`:z.max<=0?`> ${z.min} W`:`${z.min}–${z.max} W`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <WeekCalendar activities={calActs} weekStart={weekStart} loading={weekLoading} emptyLabel="REST" onActivityClick={onActivityClick} />
            {assessment.length>0&&(
              <div style={{marginTop:'1.25rem',display:'flex',flexDirection:'column',gap:8}}>
                {assessment.map((item,i)=><div key={i} className={`alert alert-${item.type}`} style={{margin:0}}>{item.type==='ok'?'✅':'⚠️'} {item.text}</div>)}
              </div>
            )}
          </>
        ):(
          <p style={{fontSize:14,color:'var(--text-secondary)',textAlign:'center',padding:'2rem 0'}}>Brak jazd rowerowych w tym tygodniu.</p>
        )}
      </div>
    </section>
  );
}

export default function BikeCoachPage() {
  const [selected, setSelected] = useState<CalendarActivity | null>(null);

  return (
    <>
      <HeroSm
        discipline="bike"
        label="Bike Coach"
        title={<>Rower to największy<br /><em className="bike">rezerwuar czasu</em></>}
        subtitle="W Half Ironmanie spędzasz na rowerze 2.5–3 godziny. Tu wygrywasz lub tracisz wyścig — i tu możesz zdobyć najwięcej bez kontuzji."
      />
      <BikeLiveSection onActivityClick={setSelected} />
      <CtaBanner
        title="Sprawdź swoją prędkość na rowerze"
        description="Analizator wyliczy Twoją średnią prędkość i proporcję czasu na rowerze względem wyścigu docelowego."
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
