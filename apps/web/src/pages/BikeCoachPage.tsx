import { useState, useEffect, useCallback, useRef } from 'react';
import HeroSm from '../components/HeroSm';
import SectionLabel from '../components/SectionLabel';
import CtaBanner from '../components/CtaBanner';
import WeekCalendar, { WeekZoneSummaryBar, type CalendarActivity } from '../components/shared/WeekCalendar';
import { useAuth } from '../context/AuthContext';

/* ── Helpers ── */
function getMonday(d: Date) { const day=d.getDay()===0?7:d.getDay(); const m=new Date(d); m.setDate(m.getDate()-(day-1)); m.setHours(0,0,0,0); return m; }
function addDays(d: Date, n: number) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function toKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtRange(mon: Date) { const sun=addDays(mon,6); return `${mon.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})} – ${sun.toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'})}`; }

const PWR_ZONE_COLORS  = ['#60a5fa','#34d399','#fbbf24','#fb923c','#f87171','#e11d48','#7c3aed'];
const PWR_ZONE_LABELS  = ['Z1 Regen.','Z2 Wytrzym.','Z3 Tempo','Z4 Próg','Z5 VO2max','Z6 Anaer.','Z7 Sprint'];
const PWR_ZONE_NAMES   = ['Regeneracja aktywna','Wytrzymałość','Tempo','Próg mleczanowy','VO2max','Moc anaerobowa','Sprint'];

interface BikeTotals { distanceKm:number; timeFormatted:string; avgSpeed:string|null; avgWatts:number|null; kilojoules:number; sufferScore:number; tss:number; sessions:number; longestKm:number; weeklyPwrZones:number[]; weeklyHRZones:number[]; }
interface BikeActivity { id:number; name:string; sportType:string; date:string; distanceKm:number; elevationGain:number; timeFormatted:string; speed:string|null; sufferScore:number|null; avgHeartRate:number|null; avgWatts:number|null; normalizedWatts:number|null; kilojoules:number|null; avgCadence:number|null; tss:number|null; if_:number|null; hasHeartRate:boolean; deviceWatts:boolean; zoneTimes:number[]|null; powerZoneTimes:number[]|null; }
interface BikeData { weekStart:string; ftp:number|null; powerZones:Array<{min:number;max:number}>|null; activities:BikeActivity[]; totals:BikeTotals; }

function assessBikes(totals: BikeTotals, ftp: number|null): Array<{ type:'ok'|'warn'; text:string }> {
  const items: Array<{ type:'ok'|'warn'; text:string }> = [];
  if      (totals.distanceKm < 50)  items.push({ type:'warn', text:`Niski wolumen rowerowy — ${totals.distanceKm} km. Dla Half IM cel to min. 100 km/tydzień.` });
  else if (totals.distanceKm >= 100) items.push({ type:'ok',  text:`Dobry wolumen tygodniowy — ${totals.distanceKm} km.` });
  if (totals.tss > 0) {
    if      (totals.tss < 200) items.push({ type:'warn', text:`TSS ${totals.tss} — niskie obciążenie treningowe (cel: 300–600 dla Half IM).` });
    else if (totals.tss <= 600) items.push({ type:'ok',  text:`TSS ${totals.tss} — dobre obciążenie treningowe w tym tygodniu.` });
    else                        items.push({ type:'warn', text:`TSS ${totals.tss} — bardzo wysokie obciążenie. Zadbaj o regenerację.` });
  }
  const pz=totals.weeklyPwrZones; const pzTotal=pz.reduce((s,v)=>s+v,0);
  if (pzTotal>60) {
    const highPct=Math.round(((pz[3]+pz[4]+pz[5]+pz[6])/pzTotal)*100);
    const z2pct  =Math.round((pz[1]/pzTotal)*100);
    if (highPct>25) items.push({ type:'warn', text:`Za dużo intensywności — ${highPct}% czasu w Z4+ (cel < 15%). Więcej jazdy bazowej.` });
    if (z2pct >= 60) items.push({ type:'ok', text:`${z2pct}% czasu w Z2 — świetna baza aerobowa.` });
  }
  if (ftp && totals.avgWatts) {
    const IF=Math.round((totals.avgWatts/ftp)*100);
    items.push({ type: IF<=78?'ok':'warn', text:`Intensity Factor: ${IF}% FTP${IF<=78?' — ekonomiczna jazda, dobra na długie dystanse.'  :' — dość intensywnie. Sprawdź czy to zaplanowana sesja.'}` });
  }
  if (totals.sessions < 2) items.push({ type:'warn', text:`Tylko ${totals.sessions} jazda — dla triathlonu min. 2–3 sesje rowerowe tygodniowo.` });
  return items;
}

function BikeLiveSection() {
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
  if (!session || !stravaToken) return (
    <div style={{textAlign:'center',padding:'2rem',fontSize:14,color:'var(--text-secondary)'}}>
      Połącz Stravę w <a href="/athlete" style={{color:'var(--bike)',fontWeight:600}}>Profilu Zawodnika →</a>, aby zobaczyć swoje jazdy.
    </div>
  );
  if(loading) return <section className="alt"><div className="section-inner"><p style={{fontSize:13,color:'var(--text-secondary)'}}>Pobieranie jazd ze Stravy…</p></div></section>;
  if(!data) return null;

  const { totals, activities, ftp, powerZones } = data;
  const assessment = assessBikes(totals, ftp);
  const calActs: CalendarActivity[] = activities.map(a=>({ id:a.id, name:a.name, type:'bike' as const, date:a.date, distanceKm:a.distanceKm, timeFormatted:a.timeFormatted, paceOrSpeed:a.speed, sufferScore:a.sufferScore, avgHeartRate:a.avgHeartRate, avgWatts:a.avgWatts, normalizedWatts:a.normalizedWatts, elevationGain:a.elevationGain, tss:a.tss, zoneTimes:a.zoneTimes, powerZoneTimes:a.powerZoneTimes }));

  return (
    <section className="alt">
      <div className="section-inner">
        {/* Nav header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
          <div>
            <SectionLabel discipline="bike">Twoje jazdy</SectionLabel>
            <h2 style={{fontSize:'clamp(20px,3vw,28px)',fontWeight:700,letterSpacing:-0.8}}>{weekLoading?'Ładowanie…':fmtRange(weekStart)}</h2>
            {ftp&&<p style={{fontSize:12,color:'var(--text-secondary)',marginTop:4}}>FTP: {ftp} W</p>}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setWeekStart(w=>addDays(w,-7))} style={navBtn}>← Poprzedni</button>
            <button onClick={()=>{if(!isCurrentWeek)setWeekStart(w=>addDays(w,7));}} disabled={isCurrentWeek} style={{...navBtn,opacity:isCurrentWeek?0.35:1}}>Następny →</button>
          </div>
        </div>

        {totals.sessions>0?(
          <>
            {/* Weekly stats */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10,marginBottom:'1.25rem'}}>
              {[['Dystans',`${totals.distanceKm} km`],['Czas',totals.timeFormatted],['Śr. prędkość',totals.avgSpeed??'—'],['Śr. moc',totals.avgWatts?`${totals.avgWatts} W`:'—'],['Energia',totals.kilojoules?`${(totals.kilojoules/1000).toFixed(1)} MJ`:'—'],['TSS',totals.tss>0?String(totals.tss):'—'],['Suffer',totals.sufferScore>0?String(totals.sufferScore):'—'],['Sesje',String(totals.sessions)]].map(([lbl,val])=>(
                <div key={lbl} style={{background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-md)',padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--bike)'}}>{val}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{lbl}</div>
                </div>
              ))}
            </div>

            {/* Power zones summary */}
            {totals.weeklyPwrZones.some(v=>v>0)&&(
              <WeekZoneSummaryBar zoneTimes={totals.weeklyPwrZones} colors={PWR_ZONE_COLORS} labels={PWR_ZONE_LABELS} totalLabel="Strefy mocy — jazdy tygodnia" />
            )}

            {/* HR zones summary */}
            {totals.weeklyHRZones.some(v=>v>0)&&(
              <WeekZoneSummaryBar zoneTimes={totals.weeklyHRZones} totalLabel="Strefy tętna — jazdy tygodnia" />
            )}

            {/* Power zone legend with watt ranges */}
            {ftp&&powerZones&&(
              <div style={{marginBottom:'1.25rem',background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'14px 16px'}}>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-secondary)',marginBottom:10}}>Twoje strefy mocy (FTP {ftp} W)</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:6}}>
                  {powerZones.slice(0,7).map((z,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:'var(--radius-sm)',background:'var(--bg-secondary)'}}>
                      <div style={{width:10,height:10,borderRadius:2,background:PWR_ZONE_COLORS[i],flexShrink:0}}/>
                      <div>
                        <div style={{fontSize:11,fontWeight:600,color:'var(--text)'}}>{PWR_ZONE_NAMES[i]}</div>
                        <div style={{fontSize:10,color:'var(--text-secondary)'}}>{z.min<=0?`< ${z.max} W`:z.max<=0?`> ${z.min} W`:`${z.min}–${z.max} W`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Calendar */}
            <WeekCalendar activities={calActs} weekStart={weekStart} loading={weekLoading} emptyLabel="REST" />

            {/* Assessment */}
            {assessment.length>0&&(
              <div style={{marginTop:'1.25rem',display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-secondary)',marginBottom:2}}>Ocena tygodnia rowerowego</div>
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

const ftpZones = [
  { badge: '#e0f2fe:#075985', zone: 'Z1', pct: '< 55%',   name: 'Aktywna regeneracja', dur: 'Bez limitu', use: 'Rozgrzewki, wyjazdy regeneracyjne po ciężkich dniach' },
  { badge: '#dcfce7:#166534', zone: 'Z2', pct: '56–75%',  name: 'Wytrzymałość',         dur: '2–6 godz.', use: 'Długie jazdy budujące bazę — 80% całego treningu rowerowego' },
  { badge: '#fef9c3:#713f12', zone: 'Z3', pct: '76–90%',  name: 'Tempo / Sweet Spot',   dur: '20–90 min', use: 'Tempo wyścigowe dla Half/Full — najefektywniejsza strefa dla amatorów' },
  { badge: '#fed7aa:#7c2d12', zone: 'Z4', pct: '91–105%', name: 'Próg mleczanowy',       dur: '10–30 min', use: 'Interwały FTP, poprawa progu, Olympic i Sprint triathlon' },
  { badge: '#fecaca:#7f1d1d', zone: 'Z5', pct: '106–120%',name: 'VO2max',                dur: '3–8 min',   use: 'Interwały VO2max — tylko dla zaawansowanych w fazie Build' },
  { badge: '#f3e8ff:#6b21a8', zone: 'Z6–Z7', pct: '> 121%', name: 'Moc anaerobowa',     dur: '< 2 min',   use: 'Sprint triathlon, podjazdy — niepotrzebne dla Full i Half' },
];

const trainings = [
  { code: 'Z2',  title: 'Długa jazda wytrzymałościowa', desc: '3–5 godzin w strefie 2. Buduje mitochondria i efektywność spalania tłuszczu. Najważniejszy trening tygodnia dla dystansów Half i Full. Niedziela rano z bidonikami i żelami — ćwiczysz też odżywianie.' },
  { code: 'SS',  title: 'Sweet Spot',                   desc: '88–93% FTP przez 20–40 minut. "Comfortably hard". Najefektywniejsza strefa dla poprawy FTP przy ograniczonym czasie treningowym. 2×20 min Sweet Spot to solidna środa dla amatora z pracą.' },
  { code: 'FTP', title: 'Interwały progowe',            desc: '95–105% FTP w blokach 8–20 minut. Podnosi próg mleczanowy. Raz w tygodniu maksymalnie — wymaga pełnej regeneracji.' },
  { code: 'B',   title: 'Brick',                        desc: 'Jazda zakończona biegiem bez przerwy. Kluczowy trening triathlonowy — uczy ciało przejścia T2. Minimum raz na 2 tygodnie w sezonie Build.' },
];

const ftpTable = [
  { level: 'Początkujący',     ftp: '120–180', speed: '22–26 km/h' },
  { level: 'Średniozaaw.',     ftp: '180–250', speed: '26–32 km/h' },
  { level: 'Zaawansowany',     ftp: '250–320', speed: '32–38 km/h' },
  { level: 'Elita amatorów',   ftp: '> 320',   speed: '> 38 km/h' },
];

const nutrition = [
  { title: 'Kalorie — ile?',    desc: '250–350 kcal/h dla wysiłku 2+ godzin. Łatwo strawne węglowodany: żele, batony, banany, daktyle. Zjedz coś po 20 minutach jazdy — nie czekaj na głód.' },
  { title: 'Płyny — kiedy?',   desc: '500–800 ml/h zależnie od temperatury. Napój izotonik + woda na zmianę. Zacznij pić po 10 minutach od startu. Jeśli czujesz pragnienie — jesteś już odwodniony.' },
  { title: 'Sód i elektrolity', desc: '600–900 mg sodu/h. Skurcze na biegu to często brak sodu, nie magnezu. Tabletki elektrolitowe lub napój z sodem. W upale zwiększ dawkę o 20–30%.' },
];

const pacing = [
  { num: '1', title: 'Pierwsze 20% dystansu — spokojnie', desc: 'Wszyscy wokół jadą za szybko — adrenalina wyścigu. Zacznij w 70–75% FTP, pozwól tętnu ustabilizować się. To kilometry, które spłacisz z odsetkami na biegu.' },
  { num: '2', title: 'Środkowe 60% — utrzymuj moc',       desc: '70–78% FTP dla Half, 65–72% dla Full. Stała moc ważniejsza niż stała prędkość — zmień przerzutkę na podjazdach, nie zwiększaj mocy. Power meter jest tu bezcenny.' },
  { num: '3', title: 'Ostatnie 20% — nie kończ za mocno', desc: 'Pokusa, żeby "wysypać" całą energię. Nie rób tego — masz jeszcze bieg. Każdy watt powyżej planu to stracona sekunda na biegu.' },
];

const techniques = [
  'Kadencja 85–95 rpm — wysoka kadencja oszczędza mięśnie na bieg',
  'Pozycja aerodynamiczna — opór powietrza to 70–80% całego oporu na rowerze',
  'Kąt tułowia 15–20° od poziomu — kompromis między aerodynamiką a komfortem biegu',
  'Stopy równoległe do podłoża w dolnym martwym punkcie',
  'Rozluźniony uchwyt kierownicy — napięte barki to strata energii i ból pleców',
];

export default function BikeCoachPage() {
  return (
    <>
      <HeroSm
        discipline="bike"
        label="Bike Coach"
        title={<>Rower to największy<br /><em className="bike">rezerwuar czasu</em></>}
        subtitle="W Half Ironmanie spędzasz na rowerze 2.5–3 godziny. W Full — 5–7 godzin. To tu wygrywasz lub tracisz wyścig. I tu możesz zdobyć najwięcej bez kontuzji."
      />

      <BikeLiveSection />

      {/* STREFY FTP */}
      <section className="alt">
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="bike">Strefy mocy (FTP)</SectionLabel>
            <h2>Trenuj z mocą, nie tylko z tętnem</h2>
            <p>FTP (Functional Threshold Power) to moc, którą możesz utrzymać przez godzinę. Większość amatorów ma FTP 150–280W.</p>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Strefa</th><th>% FTP</th><th>Nazwa</th><th>Czas w strefie</th><th>Zastosowanie w triathlonie</th></tr>
            </thead>
            <tbody>
              {ftpZones.map(z => {
                const [bg, color] = z.badge.split(':');
                return (
                  <tr key={z.zone}>
                    <td><span className="zone-badge" style={{ background: bg, color }}>{z.zone}</span></td>
                    <td>{z.pct}</td><td>{z.name}</td><td>{z.dur}</td><td>{z.use}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* TYPY TRENINGÓW */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="bike">Typy treningów</SectionLabel>
            <h2>Jak zbudować silny silnik rowerowy</h2>
          </div>
          <div className="phases">
            {trainings.map(t => (
              <div key={t.code} className="phase">
                <div className="phase-num bike">{t.code}</div>
                <div className="phase-body"><h4>{t.title}</h4><p>{t.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POZYCJA I KADENCJA */}
      <section className="alt">
        <div className="section-inner">
          <div className="coach-layout reverse">
            <div className="coach-text">
              <SectionLabel discipline="bike">Technika jazdy</SectionLabel>
              <h2>Pozycja i kadencja — dwa klucze do efektywności</h2>
              <p>Pozycja na rowerze ma ogromny wpływ na aerodynamikę i komfort biegu po zjeździe. Triathlonista jedzie inaczej niż kolarz szosowy — z myślą o biegu za 2–3 godziny.</p>
              <ul className="coach-features">
                {techniques.map(t => (
                  <li key={t}><span className="check bike">✓</span>{t}</li>
                ))}
              </ul>
            </div>
            <div className="coach-visual">
              <div className="visual-icon">⚡</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Przykładowe FTP i prędkości dla amatorów</p>
              <table className="data-table" style={{ marginTop: '0.5rem' }}>
                <thead><tr><th>Poziom</th><th>FTP (W)</th><th>Prędkość</th></tr></thead>
                <tbody>
                  {ftpTable.map(r => (
                    <tr key={r.level}><td>{r.level}</td><td>{r.ftp}</td><td>{r.speed}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="visual-stat-grid" style={{ marginTop: '1rem' }}>
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--bike)' }}>90</div><div className="visual-stat-lbl">Kadencja rpm</div></div>
                <div className="visual-stat"><div className="visual-stat-val" style={{ color: 'var(--bike)' }}>75%</div><div className="visual-stat-lbl">FTP wyścig HIM</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ODŻYWIANIE */}
      <section>
        <div className="section-inner">
          <div className="section-header">
            <SectionLabel discipline="bike">Odżywianie</SectionLabel>
            <h2>Rower to bufet — jedz, zanim poczujesz głód</h2>
            <p>Większość problemów biegowych w triathlonie to błędy żywieniowe na rowerze.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {nutrition.map(n => (
              <div key={n.title} className="info-card"><h4>{n.title}</h4><p>{n.desc}</p></div>
            ))}
          </div>
          <div className="info-card" style={{ marginTop: 16 }}>
            <h4>Złota zasada wyścigu</h4>
            <p>Nigdy nie eksperymentuj z jedzeniem w dniu wyścigu. Wszystko — żele, napoje, batony — musi być przetestowane w treningach. Żołądek w wyścigu jest pod stresem i reaguje inaczej niż w spokojnym treningu.</p>
          </div>
        </div>
      </section>

      {/* PACING */}
      <section className="alt">
        <div className="section-inner narrow">
          <div className="section-header">
            <SectionLabel discipline="bike">Pacing wyścigowy</SectionLabel>
            <h2>Jak jechać, żeby dobrze biec</h2>
            <p>Cel nie jest bieg na rowerze — celem jest zjechać ze stanem energetycznym, który pozwoli biec mocno.</p>
          </div>
          <div className="phases">
            {pacing.map(p => (
              <div key={p.num} className="phase">
                <div className="phase-num bike">{p.num}</div>
                <div className="phase-body"><h4>{p.title}</h4><p>{p.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        title="Sprawdź swoją prędkość na rowerze"
        description="Analizator wyliczy Twoją średnią prędkość i proporcję czasu na rowerze względem wyścigu docelowego."
      />
    </>
  );
}
