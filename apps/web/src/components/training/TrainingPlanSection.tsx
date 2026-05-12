import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export type PlanSport = 'triathlon' | 'run' | 'bike' | 'swim';

interface Session { type:'rest'|'swim'|'bike'|'run'|'brick'; label:string; distance:string; duration:string; description:string; }
interface DayPlan  { day:string; date:string; sessions?:Session[]; type?:string; label?:string; distance?:string; duration?:string; description?:string; }
interface PlanJson { assessment:string; week1:DayPlan[]; week2:DayPlan[]; }
interface TrainingPlan { id:string; training_days_per_week:number; suggested_days:number; plan_json:PlanJson; week_start:string; created_at:string; sport_type:PlanSport; }

const SPORT_META: Record<string, { icon:string; color:string; bg:string }> = {
  swim:  { icon:'🏊', color:'#2563eb', bg:'#dbeafe' },
  bike:  { icon:'🚴', color:'#16a34a', bg:'#dcfce7' },
  run:   { icon:'🏃', color:'#dc2626', bg:'#fee2e2' },
  brick: { icon:'🔥', color:'#7c3aed', bg:'#ede9fd' },
  rest:  { icon:'💤', color:'#9ca3af', bg:'var(--bg-secondary)' },
};
const SPORT_COLORS: Record<PlanSport, string> = {
  triathlon: 'var(--tri)', run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)',
};
const SPORT_LABELS: Record<PlanSport, string> = {
  triathlon: 'Triathlon', run: 'Bieganie', bike: 'Kolarstwo', swim: 'Pływanie',
};
const DAY_NAMES = ['Pon','Wt','Śr','Czw','Pt','Sob','Nd'];

function SessionBlock({ s }: { s: Session }) {
  const meta = SPORT_META[s.type] ?? SPORT_META.rest;
  if (s.type === 'rest') return null;
  return (
    <div style={{ borderLeft:`2px solid ${meta.color}`, paddingLeft:8, paddingBottom:2 }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
        <span style={{ fontSize:12 }}>{meta.icon}</span>
        <span style={{ fontSize:11, fontWeight:700, color:meta.color }}>{s.label}</span>
      </div>
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:2 }}>
        {s.distance && s.distance !== '—' && <span style={{ fontSize:10, background:meta.bg, color:meta.color, padding:'1px 5px', borderRadius:3, fontWeight:600 }}>{s.distance}</span>}
        {s.duration && <span style={{ fontSize:10, color:'var(--text-secondary)' }}>{s.duration}</span>}
      </div>
      <div style={{ fontSize:10, color:'var(--text-secondary)', lineHeight:1.5 }}>{s.description}</div>
    </div>
  );
}

function DayCard({ day }: { day: DayPlan }) {
  const sessions: Session[] = day.sessions?.length
    ? day.sessions
    : [{ type:(day.type ?? 'rest') as Session['type'], label:day.label ?? '', distance:day.distance ?? '—', duration:day.duration ?? '—', description:day.description ?? '' }];
  const isFullRest = sessions.every(s => s.type === 'rest');
  const topColor   = isFullRest ? '#9ca3af' : (SPORT_META[sessions[0].type]?.color ?? '#9ca3af');
  const isDouble   = sessions.filter(s => s.type !== 'rest').length > 1;
  return (
    <div style={{ borderRadius:'var(--radius-lg)', border:`0.5px solid ${isFullRest?'var(--border)':topColor+'44'}`, borderTop:`3px solid ${topColor}`, background:'var(--bg)', padding:10, minHeight:110, display:'flex', flexDirection:'column', gap:3 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)' }}>{day.day}</div>
        {isDouble && <span style={{ fontSize:9, background:'#ede9fd', color:'#7c3aed', borderRadius:3, padding:'1px 5px', fontWeight:700 }}>×{sessions.filter(s=>s.type!=='rest').length}</span>}
      </div>
      <div style={{ fontSize:9, color:'var(--text-secondary)', marginTop:-2 }}>{day.date}</div>
      {isFullRest
        ? <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)', fontSize:18 }}>💤</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:2 }}>{sessions.filter(s=>s.type!=='rest').map((s,i)=><SessionBlock key={i} s={s}/>)}</div>
      }
    </div>
  );
}

function WeekGrid({ days, label }: { days: DayPlan[]; label: string }) {
  const ordered = DAY_NAMES.map(dn => days.find(d=>d.day===dn) ?? { day:dn, date:'', type:'rest' as const, label:'Odpoczynek', distance:'—', duration:'—', description:'' });
  return (
    <div style={{ marginBottom:'1.25rem' }}>
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:8 }}>{label}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, overflowX:'auto', minWidth:640 }}>
        {ordered.map((d,i) => <DayCard key={i} day={d} />)}
      </div>
    </div>
  );
}

function GenerateModal({ sport, suggestedDays, generating, onGenerate, onClose }: {
  sport: PlanSport; suggestedDays: number; generating: boolean;
  onGenerate: (days: number) => void; onClose: () => void;
}) {
  const [days, setDays] = useState(suggestedDays);
  const color = SPORT_COLORS[sport];
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--bg)', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-xl)', padding:'2.5rem', width:'100%', maxWidth:420, boxShadow:'0 32px 80px rgba(0,0,0,0.22)' }}>
        <h2 style={{ fontSize:20, fontWeight:700, textAlign:'center', marginBottom:6 }}>
          Plan: {SPORT_LABELS[sport]}
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', textAlign:'center', marginBottom:'2rem', lineHeight:1.6 }}>
          Claude przeanalizuje Twoje treningi i ułoży 2-tygodniowy plan na podstawie aktualnego poziomu i formy.
        </p>
        <div style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Dni treningowe w tygodniu</div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
            <input type="range" min={2} max={7} value={days} onChange={e => setDays(+e.target.value)}
              style={{ flex:1, accentColor:color, height:6, cursor:'pointer' }} />
            <div style={{ fontSize:28, fontWeight:800, color, minWidth:32, textAlign:'center' }}>{days}</div>
          </div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', padding:'8px 12px' }}>
            Na podstawie Twoich danych sugerujemy <strong style={{ color }}>{suggestedDays} dni</strong>/tydzień.
          </div>
        </div>
        <button onClick={() => onGenerate(days)} disabled={generating}
          style={{ width:'100%', padding:13, borderRadius:'var(--radius-md)', background:`linear-gradient(135deg,${color},${color}bb)`, color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:generating?'not-allowed':'pointer', fontFamily:'var(--font)', opacity:generating?0.7:1 }}>
          {generating ? '✨ Generowanie planu…' : '🤖 Generuj z AI'}
        </button>
        {!generating && <button onClick={onClose} style={{ width:'100%', marginTop:8, padding:10, background:'none', border:'none', fontSize:13, color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--font)' }}>Anuluj</button>}
      </div>
    </div>
  );
}

export default function TrainingPlanSection({ sport }: { sport: PlanSport }) {
  const { session } = useAuth();
  const [plan, setPlan]           = useState<TrainingPlan | null | undefined>(undefined); // undefined=loading
  const [suggestedDays, setSug]   = useState(5);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGen]      = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [lastUsage, setUsage]     = useState<{ costUsd:number; inputTokens:number; outputTokens:number } | null>(null);

  useEffect(() => {
    if (!session) return;
    fetch(`/api/ai/generate-plan?sport=${sport}`, { headers: { Authorization:`Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setPlan(d.plan); setSug(d.suggestedDays ?? 5); } else setPlan(null); })
      .catch(() => setPlan(null));
  }, [session, sport]);

  const handleGenerate = async (days: number) => {
    if (!session) return;
    setGen(true); setError(null);
    try {
      const res = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ trainingDays: days, sport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Błąd');
      setPlan(data.plan);
      setSug(data.suggestedDays ?? days);
      if (data.usage) setUsage(data.usage);
      setShowModal(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Błąd generowania'); }
    finally { setGen(false); }
  };

  const color     = SPORT_COLORS[sport];
  const planJson  = plan?.plan_json ?? null;
  const week1date = plan?.week_start ? new Date(plan.week_start).toLocaleDateString('pl-PL',{day:'numeric',month:'long'}) : '';
  const week2date = plan?.week_start ? (() => { const d=new Date(plan.week_start); d.setDate(d.getDate()+7); return d.toLocaleDateString('pl-PL',{day:'numeric',month:'long'}); })() : '';

  if (!session) return null;

  return (
    <section className="alt">
      <div className="section-inner">
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:12 }}>
          <div>
            <p style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color, marginBottom:4 }}>
              Plan treningowy AI
            </p>
            <h2 style={{ fontSize:'clamp(18px,2.5vw,24px)', fontWeight:700, letterSpacing:-0.5 }}>
              {planJson ? '2-tygodniowy plan' : `Wygeneruj plan ${SPORT_LABELS[sport].toLowerCase()}`}
            </h2>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {plan !== undefined && (
              <button onClick={() => setShowModal(true)}
                style={{ padding:'8px 18px', borderRadius:'var(--radius-md)', background: planJson ? 'var(--bg)' : color, color: planJson ? 'var(--text)' : '#fff', border: planJson ? '0.5px solid var(--border-md)' : 'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                {planJson ? '↻ Nowy plan' : '🤖 Generuj plan'}
              </button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-warn" style={{ marginBottom:16 }}>{error}</div>}

        {/* Loading */}
        {plan === undefined && <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Ładowanie planu…</p>}

        {/* Empty state */}
        {plan === null && (
          <div style={{ textAlign:'center', padding:'3rem 0' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🤖</div>
            <p style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:20, lineHeight:1.6, maxWidth:420, margin:'0 auto 20px' }}>
              Nie masz jeszcze planu {SPORT_LABELS[sport].toLowerCase()}. Claude przeanalizuje Twoje dotychczasowe treningi i ułoży 2-tygodniowy plan dopasowany do Twojego aktualnego poziomu.
            </p>
            <button onClick={() => setShowModal(true)}
              style={{ padding:'12px 28px', borderRadius:'var(--radius-md)', background:`linear-gradient(135deg,${color},${color}bb)`, color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
              🤖 Generuj plan z AI
            </button>
          </div>
        )}

        {/* Plan display */}
        {planJson && (
          <>
            {planJson.assessment && (
              <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderLeft:`3px solid ${color}`, borderRadius:'var(--radius-lg)', padding:'1rem 1.25rem', marginBottom:'1.5rem', fontSize:13, lineHeight:1.7 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:5 }}>🤖 Ocena i priorytety</div>
                {planJson.assessment}
              </div>
            )}

            {planJson.week1 && <WeekGrid days={planJson.week1} label={`Tydzień 1 — od ${week1date}`} />}
            {planJson.week2 && <WeekGrid days={planJson.week2} label={`Tydzień 2 — od ${week2date}`} />}

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12, marginTop:8 }}>
              <div style={{ fontSize:11, color:'var(--text-secondary)' }}>
                Wygenerowany {plan?.created_at ? new Date(plan.created_at).toLocaleDateString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''} · {plan?.training_days_per_week} dni/tydzień
              </div>
              {lastUsage && (
                <div style={{ fontSize:11, color:'var(--text-secondary)' }}>
                  Koszt: <strong style={{ color:'var(--text)' }}>${lastUsage.costUsd.toFixed(4)}</strong> · {lastUsage.inputTokens + lastUsage.outputTokens} tokenów
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showModal && (
        <GenerateModal sport={sport} suggestedDays={suggestedDays} generating={generating} onGenerate={handleGenerate} onClose={() => setShowModal(false)} />
      )}
    </section>
  );
}
