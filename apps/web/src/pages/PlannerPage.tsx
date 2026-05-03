import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import SectionLabel from '../components/SectionLabel';

type SportType = 'triathlon' | 'run' | 'bike' | 'swim';

const SPORTS: Array<{ value: SportType; icon: string; label: string; color: string }> = [
  { value: 'triathlon', icon: '🏅', label: 'Triathlon',  color: 'var(--tri)'  },
  { value: 'run',       icon: '🏃', label: 'Bieganie',   color: 'var(--run)'  },
  { value: 'bike',      icon: '🚴', label: 'Rower',      color: 'var(--bike)' },
  { value: 'swim',      icon: '🏊', label: 'Pływanie',   color: 'var(--swim)' },
];

interface Session { type:'rest'|'swim'|'bike'|'run'|'brick'; label:string; distance:string; duration:string; description:string; }
// Supports both new format (sessions[]) and legacy flat format
interface DayPlan { day:string; date:string; sessions?:Session[]; type?:string; label?:string; distance?:string; duration?:string; description?:string; }
interface PlanJson { assessment:string; week1:DayPlan[]; week2:DayPlan[]; }
interface TrainingPlan { id:string; training_days_per_week:number; suggested_days:number; plan_json:PlanJson; week_start:string; created_at:string; sport_type:SportType; }

const SPORT_META: Record<string, { icon:string; color:string; bg:string }> = {
  swim:  { icon:'🏊', color:'#2563eb', bg:'#dbeafe' },
  bike:  { icon:'🚴', color:'#16a34a', bg:'#dcfce7' },
  run:   { icon:'🏃', color:'#dc2626', bg:'#fee2e2' },
  brick: { icon:'🔥', color:'#7c3aed', bg:'#ede9fd' },
  rest:  { icon:'💤', color:'#9ca3af', bg:'var(--bg-secondary)' },
};
const DAY_NAMES = ['Pon','Wt','Śr','Czw','Pt','Sob','Nd'];

function SessionBlock({ s }: { s: Session }) {
  const meta   = SPORT_META[s.type] ?? SPORT_META.rest;
  const isRest = s.type === 'rest';
  if (isRest) return null;
  return (
    <div style={{ borderLeft:`2px solid ${meta.color}`, paddingLeft:8, paddingBottom:4 }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
        <span style={{ fontSize:13 }}>{meta.icon}</span>
        <span style={{ fontSize:11, fontWeight:700, color:meta.color }}>{s.label}</span>
      </div>
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:3 }}>
        {s.distance && s.distance !== '—' && <span style={{ fontSize:10, background:meta.bg, color:meta.color, padding:'1px 5px', borderRadius:3, fontWeight:600 }}>{s.distance}</span>}
        {s.duration && <span style={{ fontSize:10, color:'var(--text-secondary)' }}>{s.duration}</span>}
      </div>
      <div style={{ fontSize:10, color:'var(--text-secondary)', lineHeight:1.5 }}>{s.description}</div>
    </div>
  );
}

function DayCard({ day }: { day: DayPlan }) {
  // Normalize: support both sessions[] (new) and flat format (legacy)
  const sessions: Session[] = day.sessions?.length
    ? day.sessions
    : [{ type: (day.type ?? 'rest') as Session['type'], label: day.label ?? '', distance: day.distance ?? '—', duration: day.duration ?? '—', description: day.description ?? '' }];

  const isFullRest = sessions.every(s => s.type === 'rest');
  const topColor   = isFullRest ? '#9ca3af' : (SPORT_META[sessions[0].type]?.color ?? '#9ca3af');
  const isDouble   = sessions.filter(s => s.type !== 'rest').length > 1;

  return (
    <div style={{ borderRadius:'var(--radius-lg)', border:`0.5px solid ${isFullRest?'var(--border)':topColor+'44'}`, borderTop:`3px solid ${topColor}`, background:'var(--bg)', padding:10, minHeight:120, display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)' }}>{day.day}</div>
        {isDouble && <span style={{ fontSize:9, background:'#ede9fd', color:'#7c3aed', borderRadius:3, padding:'1px 5px', fontWeight:700 }}>×{sessions.filter(s=>s.type!=='rest').length}</span>}
      </div>
      <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:-2 }}>{day.date}</div>

      {isFullRest ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)', fontSize:20 }}>💤</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:2 }}>
          {sessions.filter(s=>s.type!=='rest').map((s,i) => (
            <SessionBlock key={i} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekGrid({ days, label }: { days: DayPlan[]; label: string }) {
  const ordered = DAY_NAMES.map(dn => days.find(d=>d.day===dn) ?? { day:dn, date:'', type:'rest' as const, sport:'rest', label:'Odpoczynek', distance:'—', duration:'—', description:'' });
  return (
    <div style={{ marginBottom:'1.5rem' }}>
      <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:10 }}>{label}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8, overflowX:'auto', minWidth:700 }}>
        {ordered.map((d,i) => <DayCard key={i} day={d} />)}
      </div>
    </div>
  );
}

function GenerateModal({ suggestedDays, sport, onGenerate, onClose, generating }: {
  suggestedDays:number; sport:SportType; onGenerate:(days:number)=>void; onClose:()=>void; generating:boolean;
}) {
  const [days, setDays] = useState(suggestedDays);
  const sp = SPORTS.find(s=>s.value===sport)!;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ background:'var(--bg)', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-xl)', padding:'2.5rem', width:'100%', maxWidth:440, boxShadow:'0 32px 80px rgba(0,0,0,0.22)' }}>
        <div style={{ fontSize:26, textAlign:'center', marginBottom:8 }}>{sp.icon}</div>
        <h2 style={{ fontSize:20, fontWeight:700, textAlign:'center', marginBottom:6 }}>
          Plan: {sp.label}
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', textAlign:'center', marginBottom:'2rem', lineHeight:1.6 }}>
          Claude przeanalizuje Twoje dotychczasowe treningi i ułoży 2-tygodniowy plan {sport === 'triathlon' ? 'triathlonowy' : `${sp.label.toLowerCase()}owy`}.
        </p>

        <div style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Ile dni treningowych w tygodniu?</div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
            <input type="range" min={2} max={7} value={days} onChange={e=>setDays(+e.target.value)}
              style={{ flex:1, accentColor:sp.color, height:6, cursor:'pointer' }} />
            <div style={{ fontSize:28, fontWeight:800, color:sp.color, minWidth:32, textAlign:'center' }}>{days}</div>
          </div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', display:'flex', justifyContent:'space-between' }}>
            <span>2 dni</span>
            {days === suggestedDays && <span style={{ color:sp.color, fontWeight:600 }}>★ Sugerowane dla Ciebie</span>}
            <span>7 dni</span>
          </div>
          <div style={{ marginTop:10, padding:'10px 14px', background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', fontSize:12, color:'var(--text-secondary)' }}>
            Na podstawie Twoich danych sugerujemy <strong style={{ color:sp.color }}>{suggestedDays} dni</strong>/tydzień.
          </div>
        </div>

        <button onClick={()=>onGenerate(days)} disabled={generating} style={{ width:'100%', padding:13, borderRadius:'var(--radius-md)', background:`linear-gradient(135deg,${sp.color},${sp.color}bb)`, color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:generating?'not-allowed':'pointer', fontFamily:'var(--font)', opacity:generating?0.7:1 }}>
          {generating ? '✨ Generowanie planu…' : '🤖 Generuj z AI'}
        </button>
        {!generating && <button onClick={onClose} style={{ width:'100%', marginTop:8, padding:10, background:'none', border:'none', fontSize:13, color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--font)' }}>Anuluj</button>}
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const { session } = useAuth();
  const [activeSport, setActiveSport] = useState<SportType>('triathlon');
  const [plans, setPlans]             = useState<Partial<Record<SportType, TrainingPlan>>>({});
  const [suggestedDays, setSuggested] = useState(5);
  const [loading, setLoading]         = useState(false);
  const [showModal, setShowModal]     = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const currentPlan = plans[activeSport] ?? null;

  const fetchPlan = async (sport: SportType) => {
    if (!session || plans[sport] !== undefined) return; // already fetched or cached
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/generate-plan?sport=${sport}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setPlans(p => ({ ...p, [sport]: d.plan }));
        setSuggested(d.suggestedDays ?? 5);
      } else {
        setPlans(p => ({ ...p, [sport]: undefined }));
      }
    } catch { setPlans(p => ({ ...p, [sport]: undefined })); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPlan(activeSport); }, [activeSport, session]); // eslint-disable-line

  const handleGenerate = async (days: number) => {
    if (!session) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ trainingDays: days, sport: activeSport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Błąd');
      setPlans(p => ({ ...p, [activeSport]: data.plan }));
      setSuggested(data.suggestedDays ?? days);
      setShowModal(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Błąd'); }
    finally { setGenerating(false); }
  };

  const sp         = SPORTS.find(s => s.value === activeSport)!;
  const planJson   = currentPlan?.plan_json ?? null;
  const week1start = currentPlan?.week_start ?? '';
  const week2date  = week1start ? (() => { const d=new Date(week1start); d.setDate(d.getDate()+7); return d.toLocaleDateString('pl-PL',{day:'numeric',month:'long'}); })() : '';

  return (
    <>
      {/* Hero */}
      <section style={{ background:'var(--bg-tertiary)', padding:'2.5rem 5vw 2rem' }}>
        <div style={{ maxWidth:1060, margin:'0 auto' }}>
          <SectionLabel discipline="tri">Planer treningowy</SectionLabel>
          <h1 style={{ fontSize:'clamp(24px,4vw,38px)', fontWeight:700, letterSpacing:-1.5, lineHeight:1.1, marginTop:4, marginBottom:'1.5rem' }}>
            Plan na 2 tygodnie
          </h1>

          {/* Sport tabs */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {SPORTS.map(s => (
              <button key={s.value} onClick={() => setActiveSport(s.value)}
                style={{ padding:'8px 18px', borderRadius:'var(--radius-md)', border:`1.5px solid ${activeSport===s.value ? s.color : 'var(--border-md)'}`, background:activeSport===s.value?`${s.color}18`:'var(--bg)', color:activeSport===s.value?s.color:'var(--text-secondary)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:6, transition:'all 0.15s' }}>
                {s.icon} {s.label}
                {plans[s.value] && <span style={{ width:6, height:6, borderRadius:'50%', background:s.color, flexShrink:0 }} />}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div style={{ maxWidth:1060, margin:'0 auto', padding:'2rem 5vw' }}>
          {loading && <p style={{ color:'var(--text-secondary)', fontSize:14 }}>Ładowanie planu…</p>}
          {error && <div className="alert alert-warn" style={{ marginBottom:16 }}>{error}</div>}

          {!loading && !currentPlan && (
            <div style={{ textAlign:'center', padding:'4rem 0' }}>
              <div style={{ fontSize:44, marginBottom:16 }}>{sp.icon}</div>
              <h2 style={{ fontSize:20, fontWeight:700, marginBottom:10 }}>Brak planu dla: {sp.label}</h2>
              <p style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:24, lineHeight:1.6 }}>
                Claude ułoży 2-tygodniowy plan {sp.label.toLowerCase()} na podstawie Twoich danych treningowych.
              </p>
              <button onClick={() => setShowModal(true)} style={{ padding:'13px 28px', borderRadius:'var(--radius-md)', background:`linear-gradient(135deg,${sp.color},${sp.color}bb)`, color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                🤖 Generuj plan {sp.label}
              </button>
            </div>
          )}

          {planJson && (
            <>
              {/* Header of current plan */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:12 }}>
                <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
                  Wygenerowany {currentPlan?.created_at ? new Date(currentPlan.created_at).toLocaleDateString('pl-PL',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}) : ''} · {currentPlan?.training_days_per_week} dni/tydzień
                </div>
                <button onClick={() => setShowModal(true)} style={{ padding:'8px 18px', borderRadius:'var(--radius-md)', background:'var(--text)', color:'var(--bg)', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                  ↻ Nowy plan {sp.label}
                </button>
              </div>

              {/* Assessment */}
              {planJson.assessment && (
                <div style={{ background:'var(--bg-secondary)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'1rem 1.25rem', marginBottom:'2rem', fontSize:14, lineHeight:1.7 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:6 }}>🤖 Ocena i priorytety</div>
                  {planJson.assessment}
                </div>
              )}

              {planJson.week1 && <WeekGrid days={planJson.week1} label={`Tydzień 1 — od ${week1start ? new Date(week1start).toLocaleDateString('pl-PL',{day:'numeric',month:'long'}) : ''}`} />}
              {planJson.week2 && <WeekGrid days={planJson.week2} label={`Tydzień 2 — od ${week2date}`} />}

              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:8 }}>
                {Object.entries(SPORT_META).filter(([k])=>k!=='rest').map(([key,meta])=>(
                  <div key={key} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)' }}>
                    <span>{meta.icon}</span><span style={{ color:meta.color, fontWeight:600, textTransform:'capitalize' }}>{key}</span>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)' }}>💤 <span>Odpoczynek</span></div>
              </div>
            </>
          )}
        </div>
      </section>

      {showModal && (
        <GenerateModal suggestedDays={suggestedDays} sport={activeSport} onGenerate={handleGenerate} onClose={()=>setShowModal(false)} generating={generating} />
      )}
    </>
  );
}
