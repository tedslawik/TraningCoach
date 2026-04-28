import { useState, useEffect, useCallback, useRef } from 'react';
import HeroSm from '../components/HeroSm';
import SectionLabel from '../components/SectionLabel';
import CtaBanner from '../components/CtaBanner';
import WeekCalendar, { WeekZoneSummaryBar, type CalendarActivity } from '../components/shared/WeekCalendar';
import { useAuth } from '../context/AuthContext';

/* ── Helpers (shared pattern) ── */
function getMonday(d: Date) { const day = d.getDay()===0?7:d.getDay(); const m=new Date(d); m.setDate(m.getDate()-(day-1)); m.setHours(0,0,0,0); return m; }
function addDays(d: Date, n: number) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function toKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtRange(mon: Date) { const sun=addDays(mon,6); return `${mon.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})} – ${sun.toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'})}`; }

interface SwimTotals { distanceKm:number; timeFormatted:string; avgPace:string|null; avgHeartRate:number|null; sufferScore:number; sessions:number; longestKm:number; zoneTimes:number[]; }
interface SwimActivity { id:number; name:string; date:string; distanceKm:number; distanceM:number; timeFormatted:string; pace:string|null; sufferScore:number|null; avgHeartRate:number|null; hasHeartRate:boolean; zoneTimes:number[]|null; }
interface SwimData { weekStart:string; activities:SwimActivity[]; totals:SwimTotals; }

function assessSwims(totals: SwimTotals): Array<{ type:'ok'|'warn'; text:string }> {
  const items: Array<{ type:'ok'|'warn'; text:string }> = [];
  if      (totals.distanceKm < 3)  items.push({ type:'warn', text:`Niski wolumen — ${totals.distanceKm} km. Dla Half IM cel to min. 5 km/tydzień.` });
  else if (totals.distanceKm >= 6)  items.push({ type:'ok',  text:`Dobry wolumen tygodniowy — ${totals.distanceKm} km.` });
  if (totals.sessions < 2)          items.push({ type:'warn', text:`Tylko ${totals.sessions} sesja — dla triathlonu min. 2–3 sesje w basenie tygodniowo.` });
  else                               items.push({ type:'ok',  text:`${totals.sessions} sesje pływackie — dobra regularność.` });
  if (totals.longestKm < 1.5)       items.push({ type:'warn', text:`Najdłuższa sesja: ${totals.longestKm} km — dla Half IM powinno być > 2 km.` });
  else                               items.push({ type:'ok',  text:`Najdłuższa sesja ${totals.longestKm} km — dobry bodziec wytrzymałościowy.` });
  const zt=totals.zoneTimes; const ztTotal=zt.reduce((s,v)=>s+v,0);
  if (ztTotal>60) {
    const z2pct=Math.round((zt[1]/ztTotal)*100);
    if (z2pct>50) items.push({ type:'ok', text:`${z2pct}% czasu w strefie aerobowej — doskonały trening tlenowy.` });
  }
  return items;
}

function SwimLiveSection() {
  const { session, stravaToken } = useAuth();
  const [weekStart,setWeekStart]=useState(()=>getMonday(new Date()));
  const [data,setData]=useState<SwimData|null>(null);
  const [loading,setLoading]=useState(false);
  const [weekLoading,setWeekLoading]=useState(false);
  const autoFetched=useRef(false);
  const navBtn: React.CSSProperties = { padding:'7px 14px',borderRadius:'var(--radius-md)',border:'0.5px solid var(--border-md)',background:'var(--bg)',color:'var(--text)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap' };

  const doFetch=useCallback((week:Date,initial=false)=>{
    if(!session)return;
    if(initial)setLoading(true); else setWeekLoading(true);
    fetch(`/api/strava/swims?weekStart=${toKey(week)}`,{headers:{Authorization:`Bearer ${session.access_token}`}})
      .then(r=>r.ok?r.json():null).then(d=>{if(d)setData(d);}).catch(()=>{})
      .finally(()=>{setLoading(false);setWeekLoading(false);});
  },[session]);

  useEffect(()=>{ if(session&&stravaToken&&!autoFetched.current){autoFetched.current=true;doFetch(weekStart,true);} },[session,stravaToken,doFetch,weekStart]);
  useEffect(()=>{ if(data)doFetch(weekStart); },[weekStart]); // eslint-disable-line

  const isCurrentWeek=toKey(weekStart)===toKey(getMonday(new Date()));
  if(!session||!stravaToken) return null;
  if(loading) return <section className="alt"><div className="section-inner"><p style={{fontSize:13,color:'var(--text-secondary)'}}>Pobieranie pływań ze Stravy…</p></div></section>;
  if(!data) return null;

  const { totals, activities } = data;
  const assessment = assessSwims(totals);
  const calActs: CalendarActivity[] = activities.map(a=>({ id:a.id, name:a.name, type:'swim' as const, date:a.date, distanceKm:a.distanceKm, timeFormatted:a.timeFormatted, paceOrSpeed:a.pace, sufferScore:a.sufferScore, avgHeartRate:a.avgHeartRate, zoneTimes:a.zoneTimes }));

  return (
    <section className="alt">
      <div className="section-inner">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
          <div>
            <SectionLabel discipline="swim">Twoje pływania</SectionLabel>
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
              {[['Dystans',`${totals.distanceKm} km`],['Czas',totals.timeFormatted],['Śr. tempo /100m',totals.avgPace??'—'],['Śr. HR',totals.avgHeartRate?`${totals.avgHeartRate} bpm`:'—'],['Suffer Score',totals.sufferScore>0?String(totals.sufferScore):'—'],['Sesje',String(totals.sessions)],['Najdłuższa',`${totals.longestKm} km`]].map(([lbl,val])=>(
                <div key={lbl} style={{background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-md)',padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--swim)'}}>{val}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{lbl}</div>
                </div>
              ))}
            </div>
            <WeekZoneSummaryBar zoneTimes={totals.zoneTimes} totalLabel="Strefy tętna — pływania tygodnia" />
            <WeekCalendar activities={calActs} weekStart={weekStart} loading={weekLoading} emptyLabel="REST" />
            {assessment.length>0&&(
              <div style={{marginTop:'1.25rem',display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-secondary)',marginBottom:2}}>Ocena tygodnia pływackiego</div>
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

const pacingTable = [
  { level: 'Początkujący',          pace: '2:15–2:30', him: '~43–48 min' },
  { level: 'Średniozaawansowany',   pace: '1:50–2:10', him: '~35–41 min' },
  { level: 'Zaawansowany',          pace: '1:30–1:50', him: '~28–35 min' },
  { level: 'Bardzo zaawansowany',   pace: '< 1:30',    him: '< 28 min' },
];

const drills = [
  { name: 'Catch-Up',         desc: 'Jedna ręka czeka wyciągnięta z przodu, aż druga ją "dotknie". Ćwiczy długi, pełny zasięg i rotację bioder. Idealny dryл na rozgrzewkę.' },
  { name: 'High Elbow',       desc: 'W fazie ciągnięcia utrzymuj łokieć wyżej niż dłoń. To klucz do efektywnego "złapania" wody (catch). Trudny technicznie, ale zmienia wszystko.' },
  { name: 'Finger Drag',      desc: 'Podczas wymachu ramienia nad wodą przeciągaj palce po powierzchni. Uczy krótkiej trajektorii wymachu i właściwej rotacji barku.' },
  { name: 'Side Kick',        desc: 'Płyniesz na boku z dolną ręką wyciągniętą, górna przy biodrze. Ćwiczy rotację, pozycję głowy podczas oddychania i stabilność bioder.' },
  { name: 'Foka (pull buoy)', desc: 'Boja między udami unosi biodra i eliminuje pracę nóg. Pozwala skupić się wyłącznie na pracy ramion. Użyj z paddles dla maksymalnej siły.' },
  { name: 'Deska do nóg',     desc: 'Deska w wyciągniętych ramionach, kopanie nogami. Ćwiczy silną, rytmiczną pracę nóg. Kopiemy od bioder, nie od kolan.' },
];

const plans = [
  { race: 'Sprint (0.75 km)',        min: '2–3 km',  rec: '4–6 km',   sess: '2',   key: 'Interwały 10×50m szybko + technika' },
  { race: 'Olympic (1.5 km)',        min: '4–5 km',  rec: '6–9 km',   sess: '2–3', key: '4×400m w tempie wyścigowym' },
  { race: 'Half Ironman (1.9 km)',   min: '5–6 km',  rec: '8–12 km',  sess: '3',   key: 'Ciągły dystans 1×2000m co 2 tyg.' },
  { race: 'Full Ironman (3.8 km)',   min: '8–10 km', rec: '14–20 km', sess: '3–4', key: 'Ciągły dystans 1×3500m co 2 tyg.' },
];

const openWater = [
  { title: 'Sighting — widzenie kierunku', desc: 'W basenie masz linię na dnie. Na jeziorze nie masz nic. Sighting to technika unoszenia głowy co 6–8 pociągnięć. Ćwicz w basenie: co 4 długości unieś głowę i spójrz przed siebie, nie przerywając ruchu. Dodaje ~3 sek/100m — warto.' },
  { title: 'Start masowy',                 desc: 'Pierwsza minuta wyścigu w tłumie to chaos. Strategie: start z boku tłumu (spokojniej, trochę dłuższa trasa), start z tyłu (spokojny wjazd), lub start z przodu (dla pewnych siebie). Zawsze wejdź do wody przed startem — 2–3 minuty acclimatyzacji.' },
  { title: 'Pianka neoprenowa',            desc: 'Podnosi pozycję ciała i daje ~5–10% przyspieszenia. Zacznij używać 4–6 tygodni przed wyścigiem. Sprawdź limit temperatury wody w regulaminie wyścigu.' },
  { title: 'Trening w wodach otwartych',   desc: 'Minimum 3–4 sesje w sezonie. Najlepiej z grupą — bezpieczeństwo i symulacja warunków wyścigowych. Ćwicz sighting i pływanie w "brudnej wodzie" za innymi zawodnikami (drafting dozwolony w triathlonie).' },
];

const fundamentals = [
  'Głowa w linii kręgosłupa — patrz na dno, nie przed siebie',
  'Biodra wysoko — aktywny bark i core, nie tylko kopanie nogami',
  'Rotacja bioder 35–45° — to generuje moc, nie ramiona',
  'Wejście ręki w wodę przed głową, nie za szeroko po bokach',
  'Wydech pod wodą — wdech tylko przez usta, nie nosem',
];

export default function SwimCoachPage() {
  return (
    <>
      <HeroSm
        discipline="swim"
        label="Swim Coach"
        title={<>Technika bije<br /><em className="swim">kondycję</em></>}
        subtitle="Pływanie to jedyna dyscyplina triathlonu, gdzie siła i fitness mają drugorzędne znaczenie. Zawodnik z doskonałą techniką i słabym silnikiem pokona silnego amatora o złej technice. Każdym razem."
      />

      <SwimLiveSection />

      {/* FUNDAMENTY */}
      <section className="alt">
        <div className="section-inner">
          <div className="coach-layout">
            <div className="coach-text">
              <SectionLabel discipline="swim">Fundamenty</SectionLabel>
              <h2>Pozycja ciała — wszystko zaczyna się tu</h2>
              <p>Opór wody rośnie z kwadratem prędkości. Ciało leżące wysoko i poziomo na wodzie potrzebuje kilkukrotnie mniej siły niż ciało w pozycji "kopiącego się psa". Zanim zaczniesz ćwiczyć ruch ramion — sprawdź pozycję.</p>
              <ul className="coach-features">
                {fundamentals.map(f => (
                  <li key={f}><span className="check swim">✓</span>{f}</li>
                ))}
              </ul>
              <a href="/#analyzer" className="btn-coach swim">Oblicz tempo /100m →</a>
            </div>
            <div className="coach-visual">
              <div className="visual-icon">🌊</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Orientacyjne tempa dla triathlonistów amatorów</p>
              <table className="data-table" style={{ marginTop: '0.5rem' }}>
                <thead><tr><th>Poziom</th><th>Tempo /100m</th><th>1.9 km (HIM)</th></tr></thead>
                <tbody>
                  {pacingTable.map(r => (
                    <tr key={r.level}><td>{r.level}</td><td>{r.pace}</td><td>{r.him}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* DRYLE */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="swim">Dryle techniczne</SectionLabel>
            <h2>Ćwiczenia, które zmieniają technikę</h2>
            <p>Dryle izolują elementy ruchu i pozwalają skupić się na jednym aspekcie naraz. Dodaj 15–20 minut dryli do każdej sesji technicznej.</p>
          </div>
          <div className="drill-grid">
            {drills.map(d => (
              <div key={d.name} className="drill-card">
                <h4>{d.name}</h4>
                <p>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANY */}
      <section className="alt">
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="swim">Plany tygodniowe</SectionLabel>
            <h2>Ile pływać w tygodniu?</h2>
            <p>Optymalny wolumen zależy od docelowego dystansu.</p>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Wyścig docelowy</th><th>Minimum km/tydzień</th><th>Zalecane km/tydzień</th><th>Sesje/tydzień</th><th>Kluczowy trening</th></tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.race}><td>{p.race}</td><td>{p.min}</td><td>{p.rec}</td><td>{p.sess}</td><td>{p.key}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* WODY OTWARTE */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="swim">Wody otwarte</SectionLabel>
            <h2>Z basenu na jezioro — inna gra</h2>
            <p>Większość triathlonistów trenuje w basenie, ale wyścig odbywa się w wodach otwartych.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {openWater.map(o => (
              <div key={o.title} className="info-card"><h4>{o.title}</h4><p>{o.desc}</p></div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        title="Oblicz swoje tempo pływania"
        description="Wpisz dystans i czas z ostatnich treningów — analizator wyliczy Twoje tempo na 100m i szacowany czas wyścigu."
      />
    </>
  );
}
