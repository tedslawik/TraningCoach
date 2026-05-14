import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

type Discipline = 'triathlon' | 'run' | 'bike' | 'swim';
type RaceType   = string;

interface ATPPhase {
  name: string;
  type: 'base' | 'build' | 'peak' | 'race' | 'recovery' | 'transition';
  startDate: string;
  endDate: string;
  weeks: number;
  focus: string;
  targetWeeklyTSS: number;
  intensity: 'low' | 'moderate' | 'high';
  keyWorkouts: string[];
}

interface ATPRace { date: string; name: string; priority: 'A' | 'B' | 'C'; }
interface ATPPlanJson { assessment: string; raceDate: string; raceType: string; phases: ATPPhase[]; races: ATPRace[]; }
interface ATPPlan { id: string; plan_json: ATPPlanJson; created_at: string; week_start: string; }

const PHASE_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  base:       { bg:'#dbeafe', border:'#2563eb', text:'#1e40af', label:'Baza'        },
  build:      { bg:'#fed7aa', border:'#ea580c', text:'#9a3412', label:'Budowanie'   },
  peak:       { bg:'#ede9fe', border:'#7c3aed', text:'#5b21b6', label:'Szczyt'      },
  race:       { bg:'#dcfce7', border:'#16a34a', text:'#14532d', label:'Wyścig'      },
  recovery:   { bg:'#f3f4f6', border:'#9ca3af', text:'#4b5563', label:'Regeneracja' },
  transition: { bg:'var(--bg-secondary)', border:'var(--border-md)', text:'var(--text-secondary)', label:'Przejście' },
};

const INTENSITY_BADGE: Record<string, string> = {
  low: '#22c55e', moderate: '#f59e0b', high: '#ef4444',
};

const DISCIPLINES: { value: Discipline; icon: string; label: string; color: string }[] = [
  { value: 'triathlon', icon: '🏅', label: 'Triathlon',  color: 'var(--tri)'  },
  { value: 'run',       icon: '🏃', label: 'Bieganie',   color: 'var(--run)'  },
  { value: 'bike',      icon: '🚴', label: 'Kolarstwo',  color: 'var(--bike)' },
  { value: 'swim',      icon: '🏊', label: 'Pływanie',   color: 'var(--swim)' },
];

const RACE_OPTIONS_BY_DISCIPLINE: Record<Discipline, { value: string; label: string }[]> = {
  triathlon: [
    { value: 'sprint',      label: 'Sprint (~1:15h)'     },
    { value: 'olympic',     label: 'Olympic (~2:30h)'     },
    { value: 'half',        label: 'Half Ironman (~5–6h)' },
    { value: 'full',        label: 'Full Ironman (~12h)'  },
  ],
  run: [
    { value: '5k',           label: '5 km'        },
    { value: '10k',          label: '10 km'        },
    { value: 'halfmarathon', label: 'Półmaraton'   },
    { value: 'marathon',     label: 'Maraton'      },
  ],
  bike: [
    { value: 'granfondo',    label: 'Gran Fondo'      },
    { value: 'race100',      label: 'Wyścig 100 km'   },
    { value: 'race200',      label: 'Wyścig 200 km'   },
    { value: 'mtb',          label: 'Zawody MTB/XC'   },
  ],
  swim: [
    { value: 'pool1500',     label: '1500 m (basen)'   },
    { value: 'ow3k',         label: '3 km (otwarty)'   },
    { value: 'ow5k',         label: '5 km (otwarty)'   },
    { value: 'ow10k',        label: '10 km (otwarty)'  },
  ],
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pl-PL', { day:'numeric', month:'short', year:'numeric' });
}

function monthsBetween(start: string, end: string): { label: string; pct: number }[] {
  const s = new Date(start), e = new Date(end);
  const totalMs = e.getTime() - s.getTime();
  const months: { label: string; pct: number }[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e) {
    const pct = ((cur.getTime() - s.getTime()) / totalMs) * 100;
    months.push({ label: cur.toLocaleDateString('pl-PL', { month:'short' }), pct: Math.max(0, pct) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function PhaseBar({ phase, totalWeeks, selected, onClick }: {
  phase: ATPPhase; totalWeeks: number; selected: boolean; onClick: () => void;
}) {
  const style = PHASE_STYLE[phase.type] ?? PHASE_STYLE.base;
  const widthPct = (phase.weeks / totalWeeks) * 100;
  const narrow = phase.weeks <= 2;

  return (
    <div
      onClick={onClick}
      title={`${phase.name} · ${phase.weeks} tyg.\n${phase.focus}`}
      style={{
        width: `${widthPct}%`, minWidth: 24,
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        borderRadius: 6,
        padding: narrow ? '6px 4px' : '8px 10px',
        cursor: 'pointer',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: selected ? `0 0 0 2px ${style.border}` : 'none',
        transform: selected ? 'translateY(-2px)' : 'none',
        userSelect: 'none',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 2,
      }}
    >
      <div style={{ fontSize: narrow ? 8 : 10, fontWeight: 700, color: style.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {narrow ? phase.name.charAt(0) : phase.name}
      </div>
      {!narrow && (
        <>
          <div style={{ fontSize: 9, color: style.text, opacity: 0.75 }}>{phase.weeks}t · TSS {phase.targetWeeklyTSS}</div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: INTENSITY_BADGE[phase.intensity] ?? '#9ca3af', marginTop: 2, flexShrink: 0 }} />
        </>
      )}
    </div>
  );
}

export default function ATPSection() {
  const { session } = useAuth();
  const [plan, setPlan]         = useState<ATPPlan | null | undefined>(undefined);
  const [discipline, setDisc]   = useState<Discipline>('triathlon');
  const [raceDate, setRaceDate] = useState('');
  const [raceType, setRaceType] = useState('half');
  const [generating, setGen]    = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastUsage, setUsage] = useState<{ costUsd: number } | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch('/api/ai/generate-plan?sport=atp', { headers: { Authorization:`Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.plan) setPlan(d.plan); else setPlan(null); })
      .catch(() => setPlan(null));
  }, [session]);

  const handleGenerate = async () => {
    if (!session || !raceDate) return;
    setGen(true); setError(null);
    try {
      const res = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ sport:'atp', raceDate, raceType, discipline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Błąd');
      setPlan(data.plan);
      if (data.usage) setUsage(data.usage);
      setShowForm(false);
      setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Błąd generowania'); }
    finally { setGen(false); }
  };

  if (!session) return null;

  const planJson  = plan?.plan_json ?? null;
  const phases    = planJson?.phases ?? [];
  const totalWeeks = phases.reduce((s, p) => s + p.weeks, 0);
  const planStart = phases[0]?.startDate ?? '';
  const planEnd   = phases[phases.length - 1]?.endDate ?? '';
  const months    = planStart && planEnd ? monthsBetween(planStart, planEnd) : [];
  const selPhase  = selected !== null ? phases[selected] : null;

  const raceMarkers = (planJson?.races ?? []).map(r => {
    if (!planStart || !planEnd) return null;
    const totalMs = new Date(planEnd).getTime() - new Date(planStart).getTime();
    const pct = ((new Date(r.date).getTime() - new Date(planStart).getTime()) / totalMs) * 100;
    return { ...r, pct };
  }).filter(Boolean);

  return (
    <section className="alt">
      <div className="section-inner">

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:12 }}>
          <div>
            <p style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--tri)', marginBottom:4 }}>
              Annual Training Plan
            </p>
            <h2 style={{ fontSize:'clamp(18px,2.5vw,24px)', fontWeight:700, letterSpacing:-0.5 }}>
              {planJson ? `Plan roczny · ${planJson.raceType?.toUpperCase() ?? ''}` : 'Brak planu rocznego'}
            </h2>
          </div>
          <button
            onClick={() => setShowForm(s => !s)}
            style={{ padding:'8px 18px', borderRadius:'var(--radius-md)', background: planJson ? 'var(--bg)' : 'var(--tri)', color: planJson ? 'var(--text)' : '#fff', border: planJson ? '0.5px solid var(--border-md)' : 'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
            {planJson ? '↻ Nowy plan' : '🤖 Generuj ATP'}
          </button>
        </div>

        {error && <div className="alert alert-warn" style={{ marginBottom:16 }}>{error}</div>}

        {/* Generate form */}
        {(showForm || plan === null) && (
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'1.25rem', marginBottom:'1.5rem' }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Skonfiguruj plan roczny</div>

            {/* Discipline selector */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Dyscyplina</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {DISCIPLINES.map(d => (
                  <button key={d.value} onClick={() => { setDisc(d.value); setRaceType(RACE_OPTIONS_BY_DISCIPLINE[d.value][d.value==='triathlon'?2:0].value); }}
                    style={{ padding:'7px 14px', borderRadius:'var(--radius-md)', border:`1.5px solid ${discipline===d.value ? d.color : 'var(--border-md)'}`, background: discipline===d.value ? `${d.color}18` : 'var(--bg)', color: discipline===d.value ? d.color : 'var(--text-secondary)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:5, transition:'all 0.12s' }}>
                    {d.icon} {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>Data wyścigu A</label>
                <input type="date" value={raceDate} onChange={e=>setRaceDate(e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius-md)', border:'0.5px solid var(--border-md)', background:'var(--bg)', color:'var(--text)', fontSize:13, fontFamily:'var(--font)', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>Dystans / format</label>
                <select value={raceType} onChange={e=>setRaceType(e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius-md)', border:'0.5px solid var(--border-md)', background:'var(--bg)', color:'var(--text)', fontSize:13, fontFamily:'var(--font)', boxSizing:'border-box' }}>
                  {RACE_OPTIONS_BY_DISCIPLINE[discipline].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleGenerate} disabled={generating || !raceDate}
                style={{ padding:'9px 20px', borderRadius:'var(--radius-md)', background: (!raceDate||generating)?'var(--bg-secondary)':'var(--tri)', color: (!raceDate||generating)?'var(--text-secondary)':'#fff', border:'none', fontSize:13, fontWeight:600, cursor:(!raceDate||generating)?'not-allowed':'pointer', fontFamily:'var(--font)' }}>
                {generating ? '✨ Generowanie…' : '🤖 Generuj z AI'}
              </button>
              {planJson && <button onClick={()=>setShowForm(false)} style={{ padding:'9px 14px', borderRadius:'var(--radius-md)', background:'none', border:'0.5px solid var(--border-md)', fontSize:13, color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--font)' }}>Anuluj</button>}
            </div>
            {!raceDate && <p style={{ fontSize:11, color:'var(--text-secondary)', marginTop:8 }}>Wybierz datę wyścigu A, żeby wygenerować plan.</p>}
          </div>
        )}

        {/* Loading */}
        {plan === undefined && <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Ładowanie planu…</p>}

        {/* Plan display */}
        {planJson && phases.length > 0 && (
          <>
            {/* Assessment */}
            <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderLeft:`3px solid var(--tri)`, borderRadius:'var(--radius-lg)', padding:'1rem 1.25rem', marginBottom:'1.5rem', fontSize:13, lineHeight:1.7 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:5 }}>🤖 Strategia roczna</div>
              {planJson.assessment}
            </div>

            {/* Month labels */}
            <div style={{ position:'relative', height:18, marginBottom:4, overflow:'hidden' }}>
              {months.map((m, i) => (
                <span key={i} style={{ position:'absolute', left:`${m.pct}%`, fontSize:10, color:'var(--text-secondary)', fontWeight:600, whiteSpace:'nowrap', transform:'translateX(-50%)', letterSpacing:'0.06em', textTransform:'uppercase' }}>
                  {m.label}
                </span>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ position:'relative', marginBottom: raceMarkers.length ? 24 : 8 }}>
              <div style={{ display:'flex', gap:3, width:'100%' }}>
                {phases.map((p, i) => (
                  <PhaseBar key={i} phase={p} totalWeeks={totalWeeks} selected={selected === i} onClick={() => setSelected(selected === i ? null : i)} />
                ))}
              </div>
              {/* Race markers */}
              {raceMarkers.map((r, i) => r && (
                <div key={i} style={{ position:'absolute', bottom:-20, left:`${r.pct}%`, transform:'translateX(-50%)', textAlign:'center' }}>
                  <div style={{ fontSize:14 }}>🏁</div>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--tri)', whiteSpace:'nowrap' }}>{r.priority}</div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom: selPhase ? '1.25rem' : 0, marginTop: raceMarkers.length ? 16 : 8 }}>
              {Object.entries(PHASE_STYLE).map(([key, s]) => (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text-secondary)' }}>
                  <div style={{ width:10, height:10, background:s.bg, border:`1.5px solid ${s.border}`, borderRadius:2 }} />
                  {s.label}
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--text-secondary)', marginLeft:'auto' }}>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  {(['low','moderate','high'] as const).map(k => <div key={k} style={{ width:8, height:8, borderRadius:'50%', background:INTENSITY_BADGE[k] }} />)}
                  <span>intensywność: niska / umiark. / wysoka</span>
                </div>
              </div>
            </div>

            {/* Selected phase detail */}
            {selPhase && (
              <div style={{ background:'var(--bg)', border:`1.5px solid ${PHASE_STYLE[selPhase.type]?.border ?? 'var(--border)'}`, borderRadius:'var(--radius-lg)', padding:'1rem 1.25rem', marginTop:8 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:10, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color: PHASE_STYLE[selPhase.type]?.text }}>{selPhase.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
                      {fmtDate(selPhase.startDate)} – {fmtDate(selPhase.endDate)} · {selPhase.weeks} tyg.
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <div style={{ textAlign:'center', background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', padding:'6px 12px' }}>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{selPhase.targetWeeklyTSS}</div>
                      <div style={{ fontSize:10, color:'var(--text-secondary)' }}>TSS/tydzień</div>
                    </div>
                    <div style={{ textAlign:'center', background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', padding:'6px 12px' }}>
                      <div style={{ fontSize:16 }}>
                        {selPhase.intensity === 'low' ? '🟢' : selPhase.intensity === 'moderate' ? '🟡' : '🔴'}
                      </div>
                      <div style={{ fontSize:10, color:'var(--text-secondary)' }}>{selPhase.intensity === 'low' ? 'Niska' : selPhase.intensity === 'moderate' ? 'Umiark.' : 'Wysoka'}</div>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:10 }}>{selPhase.focus}</p>
                {selPhase.keyWorkouts?.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:6 }}>Kluczowe treningi</div>
                    <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:4 }}>
                      {selPhase.keyWorkouts.map((w, i) => (
                        <li key={i} style={{ fontSize:12, color:'var(--text)', display:'flex', gap:8, alignItems:'baseline' }}>
                          <span style={{ color: PHASE_STYLE[selPhase.type]?.text, fontWeight:700, flexShrink:0 }}>·</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, flexWrap:'wrap', gap:8 }}>
              <div style={{ fontSize:11, color:'var(--text-secondary)' }}>
                Wygenerowano {plan?.created_at ? new Date(plan.created_at).toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'}) : ''}
                {' · '}{totalWeeks} tygodni · {phases.length} faz
              </div>
              {lastUsage && <div style={{ fontSize:11, color:'var(--text-secondary)' }}>Koszt: <strong style={{ color:'var(--text)' }}>${lastUsage.costUsd.toFixed(4)}</strong></div>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
