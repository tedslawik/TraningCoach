import { useState, useEffect, useMemo } from 'react';
import {
  generateNutritionPlan, predictRaceTime, formatMinutes,
  type NutritionPlan, type RaceType, type WeeklySummary,
  RACE_LABELS,
} from '@tricoach/core';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

/* ── Product databases ───────────────────────────────────── */
interface GelProduct  { id: string; name: string; brand: string; carbs: number; }
interface DrinkProduct { id: string; name: string; brand: string; carbs: number; } // per 500ml

const GEL_PRODUCTS: GelProduct[] = [
  { id: 'sis-go',      brand: 'SiS',       name: 'GO Isotonic',        carbs: 22 },
  { id: 'maurten100',  brand: 'Maurten',   name: 'Gel 100',            carbs: 25 },
  { id: 'gu',          brand: 'GU Energy', name: 'Energy Gel',         carbs: 22 },
  { id: 'high5',       brand: 'HIGH5',     name: 'Energy Gel',         carbs: 23 },
  { id: 'powerbar',    brand: 'PowerBar',  name: 'PowerGel Original',  carbs: 27 },
  { id: 'decathlon',   brand: 'Aptonia',   name: 'Żel energetyczny',   carbs: 25 },
  { id: 'torq',        brand: 'TORQ',      name: 'Energy Gel',         carbs: 28 },
  { id: 'custom',      brand: 'Własny',    name: 'własny produkt',     carbs: 22 },
];

const DRINK_PRODUCTS: DrinkProduct[] = [
  { id: 'sis-elec',    brand: 'SiS',       name: 'GO Electrolyte',     carbs: 36 },
  { id: 'maurten320',  brand: 'Maurten',   name: '320 Drink Mix',      carbs: 80 },
  { id: 'high5-es',    brand: 'HIGH5',     name: 'Energy Source',      carbs: 47 },
  { id: 'isostar',     brand: 'Isostar',   name: 'Hydrate & Perform',  carbs: 33 },
  { id: 'ote',         brand: 'OTE',       name: 'Hydro Drink',        carbs: 40 },
  { id: 'decathlon-d', brand: 'Aptonia',   name: 'Iso+ proszek',       carbs: 35 },
  { id: 'custom-d',    brand: 'Własny',    name: 'własny produkt',     carbs: 36 },
];

/* ── Helpers ─────────────────────────────────────────────── */
function avgPaceSummaries(s: WeeklySummary[], d: 'swim'|'bike'|'run') {
  const r = s.slice(-8); let dist=0, time=0;
  r.forEach(x => { dist += d==='swim'?x.swimDistKm:d==='bike'?x.bikeDistKm:x.runDistKm; time += d==='swim'?x.swimTimeMin:d==='bike'?x.bikeTimeMin:x.runTimeMin; });
  if (dist<0.1||time<1) return null;
  if (d==='bike') return dist/(time/60);
  if (d==='swim') return time/(dist*10);
  return time/dist;
}

function parseTimeInput(val: string): number | null {
  if (!val) return null;
  if (val.includes(':')) { const [h,m]=val.split(':').map(Number); return isNaN(h)||isNaN(m)?null:h*60+m; }
  const n=parseFloat(val); return isNaN(n)?null:n;
}
function fmtHHMM(min: number) { const h=Math.floor(min/60),m=Math.round(min%60); return `${h}:${String(m).padStart(2,'0')}`; }

/* ── Sub-components ──────────────────────────────────────── */
function StatCard({ label, value, sub, color }: { label:string; value:string; sub?:string; color?:string }) {
  return (
    <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-md)', padding:'12px 14px', textAlign:'center' }}>
      <div style={{ fontSize:20, fontWeight:700, color:color??'var(--text)' }}>{value}</div>
      <div style={{ fontSize:11, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:2, opacity:0.7 }}>{sub}</div>}
    </div>
  );
}

function SegHeader({ icon, label, time, color }: { icon:string; label:string; time:number; color:string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
      <div style={{ fontSize:22 }}>{icon}</div>
      <div>
        <div style={{ fontSize:14, fontWeight:700, color }}>{label}</div>
        {time>0&&<div style={{ fontSize:12, color:'var(--text-secondary)' }}>{formatMinutes(time)}</div>}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────── */
export default function NutritionCalculator() {
  const { session, user } = useAuth();
  const [raceType, setRaceType]   = useState<RaceType>('half');
  const [timeInput, setTimeInput] = useState('');
  const [weight, setWeight]       = useState(75);
  const [weightSource, setWeightSource] = useState<'strava'|'manual'>('manual');
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [selectedGel,   setSelectedGel]   = useState('sis-go');
  const [customGelCarbs, setCustomGelCarbs] = useState(22);
  const [selectedDrink, setSelectedDrink] = useState('sis-elec');
  const [customDrinkCarbs, setCustomDrinkCarbs] = useState(36);

  // Load Strava weight + weekly summaries
  useEffect(() => {
    if (!session) return;

    // Weight from profile
    fetch('/api/strava/profile', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.weight && d.weight > 0) {
          setWeight(Math.round(d.weight * 10) / 10);
          setWeightSource('strava');
        }
      })
      .catch(() => {});

    // Summaries for time prediction
    if (user) {
      supabase.from('weekly_summaries').select('*').eq('user_id', user.id).order('week_start', { ascending: true })
        .then(({ data }) => {
          if (data?.length) setSummaries(data.map(r => ({
            weekStart: r.week_start, swimDistKm: r.swim_dist_km, swimTimeMin: r.swim_time_min,
            bikeDistKm: r.bike_dist_km, bikeTimeMin: r.bike_time_min,
            runDistKm: r.run_dist_km, runTimeMin: r.run_time_min,
            sufferScore: r.suffer_score, tss: r.tss, kilojoules: r.kilojoules,
          })));
        });
    }
  }, [session, user]);

  const prediction = useMemo(() => {
    if (!summaries.length) return null;
    const pred = predictRaceTime(raceType, avgPaceSummaries(summaries,'swim'), avgPaceSummaries(summaries,'bike'), avgPaceSummaries(summaries,'run'));
    return pred.totalMin != null ? pred : null;
  }, [summaries, raceType]);

  const effectiveMin = parseTimeInput(timeInput) ?? prediction?.totalMin ?? null;

  const gelProduct   = GEL_PRODUCTS.find(g => g.id === selectedGel)!;
  const drinkProduct = DRINK_PRODUCTS.find(d => d.id === selectedDrink)!;
  const gelCarbs     = selectedGel   === 'custom'   ? customGelCarbs   : gelProduct.carbs;
  const drinkCarbs   = selectedDrink === 'custom-d' ? customDrinkCarbs : drinkProduct.carbs;

  const plan: NutritionPlan | null = effectiveMin
    ? generateNutritionPlan(
        raceType, effectiveMin, weight,
        { swimMin: prediction?.swimMin ?? null, bikeMin: prediction?.bikeMin ?? null, runMin: prediction?.runMin ?? null },
        { gelCarbs, gelName: gelProduct.name, drinkCarbs, drinkName: drinkProduct.name },
      )
    : null;

  const gelLabel   = selectedGel   === 'custom'   ? 'Własny żel'   : `${gelProduct.brand} ${gelProduct.name}`;
  const drinkLabel = selectedDrink === 'custom-d' ? 'Własny napój'  : `${drinkProduct.brand} ${drinkProduct.name}`;

  return (
    <div>
      {/* ── ROW 1: Race format / Time / Weight ── */}
      <div style={{ background:'var(--bg-secondary)', borderRadius:'var(--radius-lg)', padding:'1.25rem', marginBottom:'1rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, alignItems:'end' }}>

          <div>
            <div className="workout-label">Format wyścigu</div>
            <select value={raceType} onChange={e=>{setRaceType(e.target.value as RaceType);setTimeInput('');}} style={{width:'100%'}}>
              {(Object.entries(RACE_LABELS) as [RaceType, string][]).map(([v,l])=>(
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="workout-label" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span>Planowany czas</span>
              {prediction?.totalMin && (
                <button onClick={()=>setTimeInput(fmtHHMM(prediction.totalMin!))} style={{fontSize:10,color:'var(--tri)',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>
                  Użyj przewidzianego ↑
                </button>
              )}
            </div>
            <input type="text" placeholder={prediction?.totalMin ? fmtHHMM(prediction.totalMin) : 'HH:MM'} value={timeInput} onChange={e=>setTimeInput(e.target.value)} style={{width:'100%'}} />
            {prediction?.totalMin && (
              <div style={{fontSize:11, color:'var(--tri)', marginTop:4}}>
                Przewidziany: <strong>{formatMinutes(prediction.totalMin)}</strong>
                {prediction.swimMin && ` · ${formatMinutes(prediction.swimMin)} / ${formatMinutes(prediction.bikeMin!)} / ${formatMinutes(prediction.runMin!)}`}
              </div>
            )}
          </div>

          <div>
            <div className="workout-label" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span>Waga</span>
              {weightSource === 'strava' && (
                <span style={{fontSize:10, color:'#22c55e', fontWeight:600}}>● ze Stravy</span>
              )}
            </div>
            <div className="input-row">
              <input type="number" value={weight} onChange={e=>{setWeight(+e.target.value);setWeightSource('manual');}} min={40} max={120} style={{width:80}} />
              <span className="input-unit">kg</span>
            </div>
            {weightSource === 'strava' && (
              <div style={{fontSize:11, color:'var(--text-secondary)', marginTop:4}}>Pobrano z profilu Strava</div>
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 2: Products ── */}
      <div style={{ background:'var(--bg-secondary)', borderRadius:'var(--radius-lg)', padding:'1.25rem', marginBottom:'1.25rem' }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:12 }}>
          Twoje produkty
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>

          {/* Gels */}
          <div>
            <div className="workout-label">Żel energetyczny</div>
            <select value={selectedGel} onChange={e=>setSelectedGel(e.target.value)} style={{width:'100%', marginBottom:6}}>
              {GEL_PRODUCTS.map(g=>(
                <option key={g.id} value={g.id}>{g.brand} {g.name} ({g.carbs}g węgli)</option>
              ))}
            </select>
            {selectedGel === 'custom' && (
              <div className="input-row">
                <input type="number" value={customGelCarbs} onChange={e=>setCustomGelCarbs(+e.target.value)} min={10} max={50} style={{width:70}} />
                <span className="input-unit">g węgli / żel</span>
              </div>
            )}
            {selectedGel !== 'custom' && (
              <div style={{fontSize:11, color:'var(--text-secondary)'}}>
                {gelProduct.carbs}g węglowodanów · {Math.round(gelProduct.carbs*4)} kcal / sztuka
              </div>
            )}
          </div>

          {/* Drink */}
          <div>
            <div className="workout-label">Proszek do bidonów</div>
            <select value={selectedDrink} onChange={e=>setSelectedDrink(e.target.value)} style={{width:'100%', marginBottom:6}}>
              {DRINK_PRODUCTS.map(d=>(
                <option key={d.id} value={d.id}>{d.brand} {d.name} ({d.carbs}g/500ml)</option>
              ))}
            </select>
            {selectedDrink === 'custom-d' && (
              <div className="input-row">
                <input type="number" value={customDrinkCarbs} onChange={e=>setCustomDrinkCarbs(+e.target.value)} min={0} max={120} style={{width:70}} />
                <span className="input-unit">g węgli / 500ml</span>
              </div>
            )}
            {selectedDrink !== 'custom-d' && (
              <div style={{fontSize:11, color:'var(--text-secondary)'}}>
                {drinkProduct.carbs}g węglowodanów · {Math.round(drinkProduct.carbs*4)} kcal / bidon 500ml
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Plan ── */}
      {plan ? (
        <>
          <div className="card" style={{marginBottom:'1rem', borderLeft:'3px solid var(--tri)'}}>
            <SegHeader icon="☀️" label="Przed startem" time={0} color="var(--tri)" />
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
              <StatCard label="Posiłek węglowodanowy" value={`${plan.preRaceCarbs} g`} sub={`${plan.preRaceMin} min przed startem`} color="var(--tri)" />
              <StatCard label="Ostatni żel/banan" value="30 min" sub="przed startem — proste cukry" />
              <StatCard label="Nawodnienie" value="500 ml" sub="do 60 min przed startem" />
            </div>
          </div>

          <div className="card" style={{marginBottom:'1rem', borderLeft:'3px solid var(--swim)'}}>
            <SegHeader icon="🏊" label="Pływanie" time={plan.swimMin} color="var(--swim)" />
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
              <StatCard label="Kalorie" value="0" sub="brak możliwości jedzenia" />
              <StatCard label="Tempo" value="Z2" sub="aerobowe — oszczędzaj energię" />
              <StatCard label="Nawodnienie" value="—" sub="wejdź nawodniony" />
            </div>
          </div>

          <div className="card" style={{marginBottom:'1rem', borderLeft:'3px solid var(--bike)'}}>
            <SegHeader icon="🚴" label="Rower" time={plan.bikeMin} color="var(--bike)" />
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12}}>
              <StatCard label="Węgle / h" value={`${plan.bikeCarbs_ph} g`} color="var(--bike)" />
              <StatCard label="Płyny / h" value={`${plan.bikeFluids_ph} ml`} color="var(--bike)" />
              <StatCard label="Sód / h" value={`${plan.bikeSodium_ph} mg`} color="var(--bike)" />
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr) repeat(2,1fr)', gap:10}}>
              <StatCard label={gelLabel} value={`${plan.bikeGels} szt.`} sub={`co ~${Math.round(plan.bikeMin/Math.max(plan.bikeGels,1))} min`} />
              {plan.bikeBars>0 && <StatCard label="Baton energetyczny" value={`${plan.bikeBars} szt.`} sub="pierwsze 2/3 trasy" />}
              <StatCard label={`${drinkLabel} (bidon)`} value={`${plan.bikeBottles} szt.`} sub={`${drinkCarbs}g węgli/bidon`} />
              <StatCard label="Łącznie węgle" value={`${plan.bikeCarbs} g`} sub={`≈ ${Math.round(plan.bikeCarbs*4)} kcal`} />
            </div>
          </div>

          <div className="card" style={{marginBottom:'1rem', borderLeft:'3px solid var(--run)'}}>
            <SegHeader icon="🏃" label="Bieg" time={plan.runMin} color="var(--run)" />
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12}}>
              <StatCard label="Węgle / h" value={`${plan.runCarbs_ph} g`} color="var(--run)" />
              <StatCard label="Płyny / h" value={`${plan.runFluids_ph} ml`} sub="z punktów żywienia" color="var(--run)" />
              <StatCard label="Sód / h" value={`${plan.runSodium_ph} mg`} color="var(--run)" />
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
              <StatCard label={gelLabel} value={`${plan.runGels} szt.`} sub="co ~30–35 min" />
              <StatCard label="Łącznie węgle" value={`${plan.runCarbs} g`} sub={`≈ ${Math.round(plan.runCarbs*4)} kcal`} />
              <StatCard label="Płyny" value="punkty żyw." sub="biegaj przez każdy" />
            </div>
          </div>

          {/* Dark summary */}
          <div style={{background:'var(--text)', color:'var(--bg)', borderRadius:'var(--radius-lg)', padding:'1.25rem', marginBottom:'1rem'}}>
            <div style={{fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', opacity:0.6, marginBottom:12}}>
              Łącznie do zabrania
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))', gap:12}}>
              {[
                [`${gelLabel}`, `${plan.bikeGels + plan.runGels} szt.`],
                ...(plan.bikeBars>0 ? [['Batony', `${plan.bikeBars} szt.`]] : []),
                [`${drinkLabel}`, `${plan.bikeBottles} szt.`],
                ['Węgle razem', `${plan.bikeCarbs + plan.runCarbs} g`],
                ['Energia razem', `${Math.round((plan.bikeCarbs+plan.runCarbs)*4)} kcal`],
              ].map(([l,v]) => (
                <div key={l} style={{textAlign:'center'}}>
                  <div style={{fontSize:18, fontWeight:700}}>{v}</div>
                  <div style={{fontSize:10, opacity:0.6, textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">💡 Kluczowe zasady</div>
            {plan.keyRules.map((r,i) => <div key={i} className="tip-item">{r}</div>)}
          </div>
        </>
      ) : (
        <div style={{textAlign:'center', padding:'2rem', color:'var(--text-secondary)', fontSize:14}}>
          Wybierz format wyścigu i wpisz planowany czas — lub zaloguj się ze Stravą, aby wczytać go automatycznie.
        </div>
      )}
    </div>
  );
}
