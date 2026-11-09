import type { ReactNode, CSSProperties } from 'react';
import {
  distancesFor, distanceLabel, disciplineOfDistance, daysUntilDate, DEFAULT_DISTANCE,
  type SeasonRace, type SeasonDiscipline, type RacePriority,
} from '@tricoach/core';

export const PRIORITY_STYLE: Record<RacePriority, { color: string; hint: string }> = {
  A: { color: '#e11d48', hint: 'Główny cel — pełny tapering' },
  B: { color: '#f59e0b', hint: 'Ważny — mini-tapering kilka dni' },
  C: { color: '#64748b', hint: 'Treningowy — bez taperingu' },
};

export const DISCIPLINE_META: Record<SeasonDiscipline, { icon: string; label: string; color: string }> = {
  triathlon: { icon: '🏅', label: 'Triathlon', color: 'var(--tri)'  },
  run:       { icon: '🏃', label: 'Bieganie',  color: 'var(--run)'  },
  bike:      { icon: '🚴', label: 'Kolarstwo', color: 'var(--bike)' },
  swim:      { icon: '🏊', label: 'Pływanie',  color: 'var(--swim)' },
};

const inputStyle: CSSProperties = {
  padding:'8px 10px', borderRadius:'var(--radius-md)', border:'0.5px solid var(--border-md)',
  background:'var(--bg)', color:'var(--text)', fontSize:13, fontFamily:'var(--font)', boxSizing:'border-box',
};

export function fmtRaceDate(d: string) {
  return new Date(d).toLocaleDateString('pl-PL', { day:'numeric', month:'short', year:'numeric' });
}

export function fmtDaysUntil(date: string): string {
  const n = daysUntilDate(date);
  if (n === 0) return 'dziś';
  if (n === 1) return 'jutro';
  if (n < 0)   return 'odbył się';
  if (n < 60)  return `za ${n} dni`;
  return `za ${Math.round(n / 7)} tyg.`;
}

export function PriorityBadge({ p }: { p: RacePriority }) {
  return (
    <span title={PRIORITY_STYLE[p].hint}
      style={{ fontSize:10, fontWeight:800, color:'#fff', background:PRIORITY_STYLE[p].color, borderRadius:4, padding:'1px 5px', flexShrink:0 }}>
      {p}
    </span>
  );
}

/** Compact one-line race label: priority · date · name · distance. */
export function RaceChip({ r }: { r: Partial<SeasonRace> & { date: string; priority: RacePriority; label?: string } }) {
  const label = r.label ?? (r.distance ? distanceLabel(r.distance) : '');
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-md)', padding:'5px 9px' }}>
      <PriorityBadge p={r.priority} />
      <span style={{ fontWeight:600 }}>{new Date(r.date).toLocaleDateString('pl-PL', { day:'numeric', month:'short' })}</span>
      <span style={{ color:'var(--text-secondary)' }}>{r.name ? `${r.name} · ` : ''}{label}</span>
    </div>
  );
}

export function newRace<T extends SeasonRace>(discipline: SeasonDiscipline, priority: RacePriority = 'A'): T {
  return { date: '', priority, distance: DEFAULT_DISTANCE[discipline], name: '' } as T;
}

export function PriorityLegend() {
  return (
    <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>
      <strong style={{ color:PRIORITY_STYLE.A.color }}>A</strong> — główny cel, plan buduje szczyt formy pod ten start ·{' '}
      <strong style={{ color:PRIORITY_STYLE.B.color }}>B</strong> — ważny, krótki tapering ·{' '}
      <strong style={{ color:PRIORITY_STYLE.C.color }}>C</strong> — start treningowy
    </p>
  );
}

/**
 * Editable list of races (date · A/B/C · distance · name).
 * With `discipline` set, every row uses that discipline's distances (ATP);
 * without it, each row gets its own discipline picker (user profile).
 */
export default function RaceListEditor<T extends SeasonRace>({ races, onChange, discipline, max = 20, actions }: {
  races: T[];
  onChange: (races: T[]) => void;
  discipline?: SeasonDiscipline;
  max?: number;
  actions?: ReactNode;
}) {
  const update = (i: number, patch: Partial<SeasonRace>) => onChange(races.map((r, j) => j === i ? { ...r, ...patch } : r));
  const rowDiscipline = (r: SeasonRace): SeasonDiscipline => discipline ?? disciplineOfDistance(r.distance) ?? 'triathlon';
  const addRace = () => {
    const last = races[races.length - 1];
    const d = discipline ?? (last ? rowDiscipline(last) : 'triathlon');
    onChange([...races, newRace<T>(d, races.some(r => r.priority === 'A') ? 'B' : 'A')]);
  };

  return (
    <div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:10 }}>
        {races.map((r, i) => {
          const d = rowDiscipline(r);
          return (
            <div key={(r as { id?: string }).id ?? i} style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', padding:8, borderRadius:'var(--radius-md)', background:'var(--bg-secondary)', borderLeft:`3px solid ${PRIORITY_STYLE[r.priority].color}` }}>
              <input type="date" value={r.date} onChange={e => update(i, { date: e.target.value })}
                aria-label="Data startu" style={{ ...inputStyle, flex:'1 1 140px' }} />
              <div role="group" aria-label="Priorytet" style={{ display:'flex', gap:3 }}>
                {(['A','B','C'] as const).map(p => (
                  <button key={p} type="button" onClick={() => update(i, { priority: p })} title={PRIORITY_STYLE[p].hint} aria-pressed={r.priority === p}
                    style={{ width:34, padding:'7px 0', borderRadius:'var(--radius-md)', border:`1.5px solid ${r.priority===p ? PRIORITY_STYLE[p].color : 'var(--border-md)'}`, background: r.priority===p ? PRIORITY_STYLE[p].color : 'var(--bg)', color: r.priority===p ? '#fff' : 'var(--text-secondary)', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:'var(--font)' }}>
                    {p}
                  </button>
                ))}
              </div>
              {!discipline && (
                <select value={d} onChange={e => { const nd = e.target.value as SeasonDiscipline; update(i, { distance: DEFAULT_DISTANCE[nd] }); }}
                  aria-label="Dyscyplina" style={{ ...inputStyle, flex:'1 1 130px' }}>
                  {(Object.keys(DISCIPLINE_META) as SeasonDiscipline[]).map(k => (
                    <option key={k} value={k}>{DISCIPLINE_META[k].icon} {DISCIPLINE_META[k].label}</option>
                  ))}
                </select>
              )}
              <select value={r.distance} onChange={e => update(i, { distance: e.target.value })}
                aria-label="Dystans" style={{ ...inputStyle, flex:'1 1 150px' }}>
                {distancesFor(d).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input value={r.name ?? ''} onChange={e => update(i, { name: e.target.value })} maxLength={60}
                placeholder="Nazwa (opcjonalnie)" aria-label="Nazwa startu" style={{ ...inputStyle, flex:'2 1 160px' }} />
              <button type="button" onClick={() => onChange(races.filter((_, j) => j !== i))}
                aria-label="Usuń start" title="Usuń start"
                style={{ padding:'6px 10px', borderRadius:'var(--radius-md)', border:'0.5px solid var(--border-md)', background:'var(--bg)', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--font)' }}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
        <button type="button" onClick={addRace} disabled={races.length >= max}
          style={{ padding:'7px 14px', borderRadius:'var(--radius-md)', border:'1px dashed var(--border-md)', background:'none', color:'var(--text)', fontSize:13, fontWeight:600, cursor: races.length >= max ? 'not-allowed' : 'pointer', fontFamily:'var(--font)' }}>
          + Dodaj start
        </button>
        {actions}
      </div>
      <PriorityLegend />
    </div>
  );
}
