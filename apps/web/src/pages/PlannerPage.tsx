import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import SectionLabel from '../components/SectionLabel';

/* ── Types ── */
interface DayPlan {
  day:         string;
  date:        string;
  type:        'rest' | 'swim' | 'bike' | 'run' | 'brick';
  sport:       string;
  label:       string;
  distance:    string;
  duration:    string;
  description: string;
}
interface PlanJson {
  assessment: string;
  week1:      DayPlan[];
  week2:      DayPlan[];
}
interface TrainingPlan {
  id:                     string;
  training_days_per_week: number;
  suggested_days:         number;
  plan_json:              PlanJson;
  week_start:             string;
  created_at:             string;
}

/* ── Sport meta ── */
const SPORT_META: Record<string, { icon: string; color: string; bg: string }> = {
  swim:  { icon: '🏊', color: '#2563eb', bg: '#dbeafe' },
  bike:  { icon: '🚴', color: '#16a34a', bg: '#dcfce7' },
  run:   { icon: '🏃', color: '#dc2626', bg: '#fee2e2' },
  brick: { icon: '🔥', color: '#7c3aed', bg: '#ede9fd' },
  rest:  { icon: '💤', color: '#9ca3af', bg: 'var(--bg-secondary)' },
};

const DAY_NAMES = ['Pon','Wt','Śr','Czw','Pt','Sob','Nd'];

/* ── Day card ── */
function DayCard({ day }: { day: DayPlan }) {
  const meta = SPORT_META[day.type] ?? SPORT_META.rest;
  const isRest = day.type === 'rest';
  return (
    <div style={{
      borderRadius: 'var(--radius-lg)',
      border:       `0.5px solid ${isRest ? 'var(--border)' : meta.color + '44'}`,
      borderTop:    `3px solid ${meta.color}`,
      background:   'var(--bg)',
      padding:      '12px',
      minHeight:    120,
      display:      'flex',
      flexDirection:'column',
      gap:          6,
    }}>
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)' }}>
        {day.day}
      </div>
      <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:-4 }}>{day.date}</div>

      {isRest ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)', fontSize:20 }}>💤</div>
      ) : (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:16 }}>{meta.icon}</span>
            <span style={{ fontSize:12, fontWeight:700, color:meta.color }}>{day.label}</span>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {day.distance && day.distance !== '—' && (
              <span style={{ fontSize:11, background:meta.bg, color:meta.color, padding:'2px 7px', borderRadius:4, fontWeight:600 }}>
                {day.distance}
              </span>
            )}
            {day.duration && (
              <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{day.duration}</span>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5, flex:1 }}>
            {day.description}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Week grid ── */
function WeekGrid({ days, label }: { days: DayPlan[]; label: string }) {
  const ordered = DAY_NAMES.map(dn => days.find(d => d.day === dn) ?? { day:dn, date:'', type:'rest' as const, sport:'rest', label:'Odpoczynek', distance:'—', duration:'—', description:'' });
  return (
    <div style={{ marginBottom:'1.5rem' }}>
      <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:10 }}>
        {label}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8, overflowX:'auto', minWidth:700 }}>
        {ordered.map((d, i) => <DayCard key={i} day={d} />)}
      </div>
    </div>
  );
}

/* ── Generate modal ── */
function GenerateModal({ suggestedDays, onGenerate, onClose, generating }: {
  suggestedDays: number;
  onGenerate: (days: number) => void;
  onClose: () => void;
  generating: boolean;
}) {
  const [days, setDays] = useState(suggestedDays);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--bg)', border:'0.5px solid var(--border-md)', borderRadius:'var(--radius-xl)', padding:'2.5rem', width:'100%', maxWidth:440, boxShadow:'0 32px 80px rgba(0,0,0,0.22)' }}>
        <div style={{ fontSize:26, marginBottom:8, textAlign:'center' }}>📅</div>
        <h2 style={{ fontSize:20, fontWeight:700, letterSpacing:-0.5, marginBottom:8, textAlign:'center' }}>
          Generuj plan treningowy
        </h2>
        <p style={{ fontSize:14, color:'var(--text-secondary)', textAlign:'center', marginBottom:'2rem', lineHeight:1.6 }}>
          Claude przeanalizuje Twoje poprzednie treningi i ułoży 2-tygodniowy plan dopasowany do Twojego poziomu.
        </p>

        <div style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:8 }}>
            Ile dni treningowych w tygodniu?
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
            <input
              type="range"
              min={2} max={7} value={days}
              onChange={e => setDays(+e.target.value)}
              style={{ flex:1, accentColor:'var(--tri)', height:6, cursor:'pointer' }}
            />
            <div style={{ fontSize:28, fontWeight:800, color:'var(--tri)', minWidth:32, textAlign:'center' }}>{days}</div>
          </div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', display:'flex', justifyContent:'space-between' }}>
            <span>2 dni</span>
            {days === suggestedDays && (
              <span style={{ color:'var(--tri)', fontWeight:600 }}>
                ★ Sugerowane dla Ciebie
              </span>
            )}
            <span>7 dni</span>
          </div>
          <div style={{ marginTop:10, padding:'10px 14px', background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', fontSize:12, color:'var(--text-secondary)' }}>
            Na podstawie Twoich ostatnich treningów sugerujemy <strong style={{ color:'var(--tri)' }}>{suggestedDays} dni</strong> — kliknij na tę liczbę na suwaku.
          </div>
        </div>

        <button
          onClick={() => onGenerate(days)}
          disabled={generating}
          style={{
            width:'100%', padding:'13px', borderRadius:'var(--radius-md)',
            background:'linear-gradient(135deg,#7c3aed,#4f46e5)',
            color:'#fff', border:'none', fontSize:15, fontWeight:600,
            cursor:generating?'not-allowed':'pointer', fontFamily:'var(--font)',
            opacity:generating?0.7:1, transition:'opacity 0.15s',
          }}
        >
          {generating ? '✨ Generowanie planu…' : '🤖 Generuj z AI'}
        </button>
        {!generating && (
          <button onClick={onClose} style={{ width:'100%', marginTop:8, padding:'10px', background:'none', border:'none', fontSize:13, color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--font)' }}>
            Anuluj
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function PlannerPage() {
  const { session } = useAuth();
  const [plan, setPlan]             = useState<TrainingPlan | null>(null);
  const [suggestedDays, setSuggested] = useState(5);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!session) { setLoading(false); return; }
    fetch('/api/training/plan', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setPlan(d.plan); if (d.suggestedDays) setSuggested(d.suggestedDays); }
        else setShowModal(true); // no plan → open modal immediately
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  const handleGenerate = async (days: number) => {
    if (!session) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ trainingDays: days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Błąd generowania');
      setPlan(data.plan);
      setSuggested(data.suggestedDays ?? days);
      setShowModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setGenerating(false);
    }
  };

  const planJson: PlanJson | null = plan?.plan_json ?? null;
  const week1start = plan?.week_start ?? '';
  const week2date  = week1start ? (() => { const d=new Date(week1start); d.setDate(d.getDate()+7); return d.toLocaleDateString('pl-PL',{day:'numeric',month:'long'}); })() : '';

  return (
    <>
      {/* Hero */}
      <section style={{ background:'var(--bg-tertiary)', padding:'3rem 5vw 2.5rem' }}>
        <div style={{ maxWidth:1060, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
            <div>
              <SectionLabel discipline="tri">Planer treningowy</SectionLabel>
              <h1 style={{ fontSize:'clamp(26px,4vw,42px)', fontWeight:700, letterSpacing:-1.5, lineHeight:1.1, marginTop:4 }}>
                Twój plan na 2 tygodnie
              </h1>
              {plan && (
                <p style={{ fontSize:13, color:'var(--text-secondary)', marginTop:8 }}>
                  Wygenerowany {new Date(plan.created_at).toLocaleDateString('pl-PL',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})} · {plan.training_days_per_week} dni/tydzień
                </p>
              )}
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{ padding:'10px 22px', borderRadius:'var(--radius-md)', background:'var(--text)', color:'var(--bg)', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}
            >
              {plan ? '↻ Nowy plan' : '+ Generuj plan'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <div style={{ maxWidth:1060, margin:'0 auto', padding:'2rem 5vw' }}>
          {loading && <p style={{ color:'var(--text-secondary)', fontSize:14 }}>Ładowanie…</p>}
          {error && <div className="alert alert-warn">{error}</div>}

          {!loading && !plan && !showModal && (
            <div style={{ textAlign:'center', padding:'4rem 0' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🗓️</div>
              <h2 style={{ fontSize:22, fontWeight:700, marginBottom:12 }}>Brak planu treningowego</h2>
              <p style={{ fontSize:15, color:'var(--text-secondary)', marginBottom:24, lineHeight:1.6 }}>
                Kliknij „Generuj plan" — AI przeanalizuje Twoje treningi i ułoży<br />spersonalizowany 2-tygodniowy plan.
              </p>
              <button onClick={() => setShowModal(true)} style={{ padding:'13px 28px', borderRadius:'var(--radius-md)', background:'linear-gradient(135deg,#7c3aed,#4f46e5)', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                🤖 Generuj plan z AI
              </button>
            </div>
          )}

          {planJson && (
            <>
              {/* Assessment */}
              {planJson.assessment && (
                <div style={{ background:'var(--bg-secondary)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'1rem 1.25rem', marginBottom:'2rem', fontSize:14, lineHeight:1.7, color:'var(--text)' }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:6 }}>🤖 Ocena i priorytety</div>
                  {planJson.assessment}
                </div>
              )}

              {/* Weeks */}
              {planJson.week1 && <WeekGrid days={planJson.week1} label={`Tydzień 1 — od ${week1start ? new Date(week1start).toLocaleDateString('pl-PL',{day:'numeric',month:'long'}) : ''}`} />}
              {planJson.week2 && <WeekGrid days={planJson.week2} label={`Tydzień 2 — od ${week2date}`} />}

              {/* Legend */}
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:8 }}>
                {Object.entries(SPORT_META).filter(([k])=>k!=='rest').map(([key, meta]) => (
                  <div key={key} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)' }}>
                    <span>{meta.icon}</span>
                    <span style={{ color:meta.color, fontWeight:600, textTransform:'capitalize' }}>{key}</span>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)' }}>
                  <span>💤</span><span>Odpoczynek</span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {showModal && (
        <GenerateModal
          suggestedDays={suggestedDays}
          onGenerate={handleGenerate}
          onClose={() => setShowModal(false)}
          generating={generating}
        />
      )}
    </>
  );
}
