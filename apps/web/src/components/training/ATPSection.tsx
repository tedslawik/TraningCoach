import { useState, useEffect, useMemo } from 'react';
import {
  buildSeasonSkeleton, validateSeasonRaces, distanceLabel, disciplineOfDistance, seasonStart, DEFAULT_DISTANCE,
  type SeasonRace, type SeasonDiscipline, type RacePriority, type SeasonPhaseType,
} from '@tricoach/core';
import { useAuth } from '../../context/AuthContext';
import { useRaceEvents } from '../../lib/raceEvents';
import RaceListEditor, { PRIORITY_STYLE, RaceChip, newRace } from '../events/RaceListEditor';

interface ATPRace extends Partial<SeasonRace> { date: string; priority: RacePriority; label?: string; }

interface ATPPhase {
  name: string;
  type: SeasonPhaseType;
  startDate: string;
  endDate: string;
  weeks: number;
  races?: ATPRace[];
  focus?: string;
  targetWeeklyTSS?: number;
  intensity?: 'low' | 'moderate' | 'high';
  keyWorkouts?: string[];
}

interface ATPPlanJson {
  assessment: string;
  discipline?: SeasonDiscipline;
  races: ATPRace[];
  phases: ATPPhase[];
  raceDate?: string;   // legacy single-race plans
  raceType?: string;
}
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

const DISCIPLINES: { value: SeasonDiscipline; icon: string; label: string; color: string }[] = [
  { value: 'triathlon', icon: '🏅', label: 'Triathlon',  color: 'var(--tri)'  },
  { value: 'run',       icon: '🏃', label: 'Bieganie',   color: 'var(--run)'  },
  { value: 'bike',      icon: '🚴', label: 'Kolarstwo',  color: 'var(--bike)' },
  { value: 'swim',      icon: '🏊', label: 'Pływanie',   color: 'var(--swim)' },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pl-PL', { day:'numeric', month:'short', year:'numeric' });
}
const raceLabel = (r: ATPRace) => r.label ?? (r.distance ? distanceLabel(r.distance) : '');

/** Races from a saved plan, as editable form rows (handles legacy single-race plans). */
function racesFromPlan(pj: ATPPlanJson): SeasonRace[] {
  const seen = new Set<string>();
  const withDistance = (pj.races ?? []).filter(r => {
    const k = `${r.date}|${r.distance}`;
    if (!r.distance || seen.has(k)) return false;
    seen.add(k); return true;
  });
  if (withDistance.length) return withDistance.map(r => ({ date: r.date, priority: r.priority, distance: r.distance!, name: r.name ?? '' }));
  if (pj.raceDate && pj.raceType) return [{ date: pj.raceDate, priority: 'A', distance: pj.raceType, name: '' }];
  return [];
}

function monthsBetween(start: string, end: string): { label: string; pct: number }[] {
  const s = new Date(start), e = new Date(end);
  const totalMs = e.getTime() - s.getTime();
  const months: { label: string; pct: number }[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth() + (s.getDate() > 1 ? 1 : 0), 1);
  while (cur <= e) {
    months.push({ label: cur.toLocaleDateString('pl-PL', { month:'short' }), pct: ((cur.getTime() - s.getTime()) / totalMs) * 100 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function PhaseBar({ phase, selected, onClick }: {
  phase: ATPPhase; selected: boolean; onClick?: () => void;
}) {
  const style = PHASE_STYLE[phase.type] ?? PHASE_STYLE.base;
  const narrow = phase.weeks <= 2;

  return (
    <div
      onClick={onClick}
      title={`${phase.name} · ${phase.weeks} tyg.\n${fmtDate(phase.startDate)} – ${fmtDate(phase.endDate)}${phase.focus ? `\n${phase.focus}` : ''}`}
      style={{
        flex: `${phase.weeks} 0 0`, minWidth: 22,
        background: style.bg, border: `1.5px solid ${style.border}`, borderRadius: 6,
        padding: narrow ? '6px 3px' : '8px 8px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: selected ? `0 0 0 2px ${style.border}` : 'none',
        transform: selected ? 'translateY(-2px)' : 'none',
        userSelect: 'none', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 2,
      }}
    >
      <div style={{ fontSize: narrow ? 8 : 10, fontWeight: 700, color: style.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {narrow ? phase.name.charAt(0) : phase.name}
      </div>
      {!narrow && (
        <div style={{ fontSize: 9, color: style.text, opacity: 0.75, whiteSpace: 'nowrap' }}>
          {phase.weeks}t{phase.targetWeeklyTSS ? ` · TSS ${phase.targetWeeklyTSS}` : ''}
        </div>
      )}
      {!narrow && phase.intensity && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: INTENSITY_BADGE[phase.intensity] ?? '#9ca3af', marginTop: 2, flexShrink: 0 }} />
      )}
    </div>
  );
}

function SeasonTimeline({ phases, races, selected, onSelect }: {
  phases: ATPPhase[]; races: ATPRace[]; selected?: number | null; onSelect?: (i: number) => void;
}) {
  const start = phases[0]?.startDate, end = phases[phases.length - 1]?.endDate;
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const spanMs  = new Date(end).getTime() + 24 * 3600 * 1000 - startMs;
  const months  = monthsBetween(start, end);
  const markers = races.map(r => ({ ...r, pct: ((new Date(r.date).getTime() + 12 * 3600 * 1000 - startMs) / spanMs) * 100 }))
    .filter(r => r.pct >= 0 && r.pct <= 100);

  return (
    <div style={{ overflowX:'auto', paddingBottom: 4 }}>
      <div style={{ minWidth: Math.max(phases.length * 25, 320) }}>
        <div style={{ position:'relative', height:18, marginBottom:4 }}>
          {months.map((m, i) => (
            <span key={i} style={{ position:'absolute', left:`${m.pct}%`, fontSize:10, color:'var(--text-secondary)', fontWeight:600, whiteSpace:'nowrap', letterSpacing:'0.06em', textTransform:'uppercase' }}>
              {m.label}
            </span>
          ))}
        </div>
        <div style={{ position:'relative', marginBottom: markers.length ? 30 : 8 }}>
          <div style={{ display:'flex', gap:3, width:'100%' }}>
            {phases.map((p, i) => (
              <PhaseBar key={i} phase={p} selected={selected === i} onClick={onSelect ? () => onSelect(i) : undefined} />
            ))}
          </div>
          {markers.map((r, i) => (
            <div key={i} title={`${fmtDate(r.date)} · ${r.priority} · ${raceLabel(r)}${r.name ? ` · ${r.name}` : ''}`}
              style={{ position:'absolute', bottom:-28, left:`${r.pct}%`, transform:'translateX(-50%)', textAlign:'center', cursor:'default' }}>
              <div style={{ width:0, height:0, margin:'0 auto', borderLeft:'5px solid transparent', borderRight:'5px solid transparent', borderBottom:`7px solid ${PRIORITY_STYLE[r.priority].color}` }} />
              <div style={{ fontSize:10, fontWeight:800, color:'#fff', background:PRIORITY_STYLE[r.priority].color, borderRadius:4, padding:'1px 5px', marginTop:1 }}>{r.priority}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ATPSection() {
  const { session } = useAuth();
  const [plan, setPlan]         = useState<ATPPlan | null | undefined>(undefined);
  const [discipline, setDisc]   = useState<SeasonDiscipline>('triathlon');
  const [races, setRaces]       = useState<SeasonRace[]>([newRace<SeasonRace>('triathlon')]);
  const [generating, setGen]    = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastUsage, setUsage]   = useState<{ costUsd: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const { events: profileEvents, loading: eventsLoading, error: eventsError } = useRaceEvents();

  useEffect(() => {
    if (!session) return;
    fetch('/api/ai/generate-plan?sport=atp', { headers: { Authorization:`Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.plan) setPlan(d.plan); else setPlan(null); })
      .catch(() => setPlan(null));
  }, [session]);

  // Prefill the form with the saved season so it can be edited and regenerated.
  useEffect(() => {
    const pj = plan?.plan_json;
    if (!pj) return;
    const saved = racesFromPlan(pj);
    if (saved.length) setRaces(saved);
    if (pj.discipline) setDisc(pj.discipline);
  }, [plan]);

  const validation = useMemo(() => validateSeasonRaces(races, discipline), [races, discipline]);
  const skeleton   = useMemo(() => validation ? null : buildSeasonSkeleton(races), [races, validation]);

  /**
   * Which races belong in a plan of discipline `d`: its own races, and for triathlon also
   * single-sport races (as B/C — A must be triathlon). Distances are never rewritten.
   */
  const fitRaceToPlan = (r: SeasonRace, d: SeasonDiscipline): SeasonRace | null => {
    const rd = disciplineOfDistance(r.distance);
    if (rd === d) return r;
    if (d === 'triathlon' && rd) return r.priority === 'A' ? { ...r, priority: 'B' } : r;
    return null;
  };

  const changeDiscipline = (d: SeasonDiscipline) => {
    setDisc(d);
    const real = races.filter(r => r.date);
    const kept = real.map(r => fitRaceToPlan(r, d)).filter((r): r is SeasonRace => !!r);
    const dropped = real.length - kept.length;
    setRaces(kept.length ? kept : [newRace<SeasonRace>(d)]);
    setImportMsg(dropped
      ? `Usunięto z listy ${dropped} ${dropped === 1 ? 'start' : 'starty/startów'} z innej dyscypliny (nie pasują do planu: ${DISCIPLINES.find(x => x.value === d)?.label.toLowerCase()}). Po powrocie do poprzedniej dyscypliny przywrócisz je importem z profilu.`
      : null);
  };

  // Merge the profile's upcoming events (matching this plan's discipline) into the race list.
  const importFromProfile = () => {
    if (eventsError) { setImportMsg(eventsError); return; }
    const from = seasonStart();
    const upcoming = profileEvents.filter(e => e.date >= from);
    if (!upcoming.length) { setImportMsg('Brak nadchodzących startów w profilu — dodaj je na stronie Zawodnik.'); return; }
    const current  = races.filter(r => r.date);                       // drop empty placeholder rows
    const key = (r: SeasonRace) => `${r.date}|${r.distance}`;
    const have = new Set(current.map(key));
    let demoted = 0, skipped = 0;
    const added: SeasonRace[] = [];
    for (const e of upcoming) {
      const k = key(e);
      if (have.has(k)) continue;                                      // already listed, or duplicate in profile
      have.add(k);
      const r = fitRaceToPlan({ date: e.date, priority: e.priority, distance: e.distance, name: e.name ?? '' }, discipline);
      if (!r) { skipped++; continue; }
      if (r.priority !== e.priority) demoted++;
      added.push(r);
    }
    setRaces([...current, ...added].sort((a, b) => a.date.localeCompare(b.date)).concat(current.length + added.length ? [] : [newRace<SeasonRace>(discipline)]));
    setImportMsg(
      (added.length ? `Dodano ${added.length} ${added.length === 1 ? 'start' : 'starty/startów'} z profilu.` : 'Brak nowych startów z profilu dla tej dyscypliny.') +
      (demoted ? ` ${demoted} ${demoted === 1 ? 'start A' : 'starty A'} z innej dyscypliny dodano jako B.` : '') +
      (skipped ? ` Pominięto ${skipped} z innej dyscypliny.` : ''),
    );
  };

  const handleGenerate = async () => {
    if (!session || !skeleton) return;
    setGen(true); setError(null);
    const withLabel = (r: SeasonRace) => ({ ...r, name: r.name?.trim() || undefined, label: distanceLabel(r.distance), discipline: disciplineOfDistance(r.distance) ?? discipline });
    try {
      const res = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({
          sport: 'atp', discipline,
          races: races.map(withLabel),
          phases: skeleton.phases.map(p => ({ ...p, races: p.races.map(withLabel) })),
        }),
      });
      const data = await res.json().catch(() => ({ error: `Serwer nie odpowiedział poprawnie (${res.status}) — spróbuj ponownie za chwilę.` }));
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
  const planRaces = sortedPlanRaces(planJson);
  const totalWeeks = phases.reduce((s, p) => s + p.weeks, 0);
  const selPhase  = selected !== null ? phases[selected] : null;
  const selRaces  = selPhase
    ? (selPhase.races?.length ? selPhase.races : planRaces.filter(r => r.date >= selPhase.startDate && r.date <= selPhase.endDate))
    : [];
  const aRaces    = planRaces.filter(r => r.priority === 'A');
  const sortedFormRaces = [...races].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

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
              {planJson
                ? `Plan sezonu · ${planRaces.length} ${planRaces.length === 1 ? 'start' : planRaces.length < 5 ? 'starty' : 'startów'}${aRaces.length ? ` · A: ${aRaces.map(r => r.name || raceLabel(r)).join(', ')}` : ''}`
                : 'Brak planu rocznego'}
            </h2>
          </div>
          <button
            onClick={() => setShowForm(s => !s)}
            style={{ padding:'8px 18px', borderRadius:'var(--radius-md)', background: planJson ? 'var(--bg)' : 'var(--tri)', color: planJson ? 'var(--text)' : '#fff', border: planJson ? '0.5px solid var(--border-md)' : 'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
            {planJson ? '✎ Edytuj starty' : '🤖 Generuj ATP'}
          </button>
        </div>

        {error && <div className="alert alert-warn" style={{ marginBottom:16 }}>{error}</div>}

        {/* Season form */}
        {(showForm || plan === null) && (
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'1.25rem', marginBottom:'1.5rem' }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Skonfiguruj sezon</div>

            {/* Discipline selector */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Dyscyplina</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {DISCIPLINES.map(d => (
                  <button key={d.value} onClick={() => changeDiscipline(d.value)}
                    style={{ padding:'7px 14px', borderRadius:'var(--radius-md)', border:`1.5px solid ${discipline===d.value ? d.color : 'var(--border-md)'}`, background: discipline===d.value ? `${d.color}18` : 'var(--bg)', color: discipline===d.value ? d.color : 'var(--text-secondary)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:5, transition:'all 0.12s' }}>
                    {d.icon} {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Race list */}
            <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Starty w sezonie</label>
            <div style={{ marginBottom:14 }}>
              <RaceListEditor races={races} onChange={setRaces} primaryDiscipline={discipline}
                actions={<>
                  <button type="button" onClick={importFromProfile} disabled={eventsLoading}
                    title="Dodaj do listy starty zapisane w profilu zawodnika (bez duplikatów)"
                    style={{ padding:'7px 14px', borderRadius:'var(--radius-md)', border:'0.5px solid var(--border-md)', background:'var(--bg)', color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                    ⬇ Dodaj starty z profilu
                  </button>
                  {races.length > 1 && (
                    <button type="button" onClick={() => { setRaces([newRace<SeasonRace>(discipline)]); setImportMsg(null); }}
                      style={{ padding:'7px 14px', borderRadius:'var(--radius-md)', border:'none', background:'none', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', fontFamily:'var(--font)', textDecoration:'underline' }}>
                      Wyczyść listę
                    </button>
                  )}
                </>} />
              {importMsg && <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:8, marginBottom:0 }}>{importMsg}</p>}
            </div>

            {/* Live structure preview */}
            {skeleton ? (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8 }}>
                  Podgląd struktury: <strong style={{ color:'var(--text)' }}>{skeleton.totalWeeks} tyg.</strong> · {fmtDate(skeleton.startDate)} – {fmtDate(skeleton.endDate)} · {skeleton.phases.length} faz
                </div>
                <SeasonTimeline phases={skeleton.phases} races={sortedFormRaces} />
              </div>
            ) : (
              <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:14 }}>{validation}</p>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleGenerate} disabled={generating || !skeleton}
                style={{ padding:'9px 20px', borderRadius:'var(--radius-md)', background: (!skeleton||generating)?'var(--bg-secondary)':'var(--tri)', color: (!skeleton||generating)?'var(--text-secondary)':'#fff', border:'none', fontSize:13, fontWeight:600, cursor:(!skeleton||generating)?'not-allowed':'pointer', fontFamily:'var(--font)' }}>
                {generating ? '✨ Generowanie… (do minuty)' : '🤖 Generuj plan z AI'}
              </button>
              {planJson && <button onClick={()=>setShowForm(false)} style={{ padding:'9px 14px', borderRadius:'var(--radius-md)', background:'none', border:'0.5px solid var(--border-md)', fontSize:13, color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--font)' }}>Anuluj</button>}
            </div>
          </div>
        )}

        {/* Loading */}
        {plan === undefined && <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Ładowanie planu…</p>}

        {/* Plan display */}
        {planJson && phases.length > 0 && (
          <>
            {planJson.assessment && (
              <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderLeft:`3px solid var(--tri)`, borderRadius:'var(--radius-lg)', padding:'1rem 1.25rem', marginBottom:'1.5rem', fontSize:13, lineHeight:1.7 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:5 }}>🤖 Strategia na sezon</div>
                {planJson.assessment}
              </div>
            )}

            <SeasonTimeline phases={phases} races={planRaces} selected={selected} onSelect={i => setSelected(selected === i ? null : i)} />

            {/* Races */}
            {planRaces.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8, marginBottom:12 }}>
                {planRaces.map((r, i) => <RaceChip key={i} r={r} />)}
              </div>
            )}

            {/* Legend */}
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom: selPhase ? '1.25rem' : 0, marginTop:8 }}>
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
                    {!!selPhase.targetWeeklyTSS && (
                      <div style={{ textAlign:'center', background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', padding:'6px 12px' }}>
                        <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{selPhase.targetWeeklyTSS}</div>
                        <div style={{ fontSize:10, color:'var(--text-secondary)' }}>TSS/tydzień</div>
                      </div>
                    )}
                    {selPhase.intensity && (
                      <div style={{ textAlign:'center', background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', padding:'6px 12px' }}>
                        <div style={{ fontSize:16 }}>
                          {selPhase.intensity === 'low' ? '🟢' : selPhase.intensity === 'moderate' ? '🟡' : '🔴'}
                        </div>
                        <div style={{ fontSize:10, color:'var(--text-secondary)' }}>{selPhase.intensity === 'low' ? 'Niska' : selPhase.intensity === 'moderate' ? 'Umiark.' : 'Wysoka'}</div>
                      </div>
                    )}
                  </div>
                </div>
                {selRaces.length > 0 && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                    {selRaces.map((r, i) => <RaceChip key={i} r={r} />)}
                  </div>
                )}
                {selPhase.focus && <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:10 }}>{selPhase.focus}</p>}
                {!!selPhase.keyWorkouts?.length && (
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

/** Races of a saved plan, sorted; legacy plans only stored raceDate/raceType. */
function sortedPlanRaces(pj: ATPPlanJson | null): ATPRace[] {
  if (!pj) return [];
  const list: ATPRace[] = pj.races?.length ? pj.races
    : pj.raceDate ? [{ date: pj.raceDate, priority: 'A', distance: pj.raceType }] : [];
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}
