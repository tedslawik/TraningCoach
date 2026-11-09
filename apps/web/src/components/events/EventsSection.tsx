import { useState } from 'react';
import { validateEvents, distanceLabel, disciplineOfDistance, daysUntilDate } from '@tricoach/core';
import SectionLabel from '../SectionLabel';
import { useRaceEvents, type RaceEvent } from '../../lib/raceEvents';
import RaceListEditor, { DISCIPLINE_META, PriorityBadge, fmtRaceDate, fmtDaysUntil, newRace } from './RaceListEditor';

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  padding:'9px 18px', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:600, fontFamily:'var(--font)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? 'var(--bg-secondary)' : primary ? 'var(--tri)' : 'var(--bg)',
  color: disabled ? 'var(--text-secondary)' : primary ? '#fff' : 'var(--text)',
  border: primary ? 'none' : '0.5px solid var(--border-md)',
});

/** Planned races in the athlete profile: view list, edit (add / remove / change), save to `race_events`. */
export default function EventsSection() {
  const { events, loading, error, save } = useRaceEvents();
  const [draft, setDraft]     = useState<RaceEvent[] | null>(null);   // null = view mode
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const editing = draft !== null || (!loading && !error && events.length === 0);
  const rows    = draft ?? (events.length ? events : [newRace<RaceEvent>('triathlon')]);
  const invalid = validateEvents(rows);

  const startEdit = () => { setDraft(events.map(e => ({ ...e }))); setSaveErr(null); };
  const cancel    = () => { setDraft(null); setSaveErr(null); };
  const submit    = async () => {
    if (invalid) return;
    setSaving(true); setSaveErr(null);
    try { await save(rows); setDraft(null); }
    catch (e) { setSaveErr(e instanceof Error ? e.message : 'Nie udało się zapisać startów'); }
    finally { setSaving(false); }
  };

  return (
    <section id="starty">
      <div className="section-inner">
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:'1rem' }}>
          <div>
            <SectionLabel discipline="tri">Planowane starty</SectionLabel>
            <h2 style={{ fontSize:'clamp(20px,3vw,28px)', fontWeight:700, letterSpacing:-0.8 }}>Twój kalendarz startów</h2>
          </div>
          {!editing && events.length > 0 && <button onClick={startEdit} style={btn(false)}>✎ Edytuj starty</button>}
        </div>

        {loading && <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Ładowanie startów…</p>}
        {error && <div className="alert alert-warn">{error}</div>}

        {!loading && !error && !editing && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {events.map(e => {
              const d = disciplineOfDistance(e.distance);
              const past = daysUntilDate(e.date) < 0;
              return (
                <div key={e.id} className="card" style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', opacity: past ? 0.55 : 1, flexWrap:'wrap' }}>
                  <PriorityBadge p={e.priority} />
                  <span style={{ fontSize:18 }} title={d ? DISCIPLINE_META[d].label : ''}>{d ? DISCIPLINE_META[d].icon : '🏁'}</span>
                  <div style={{ flex:'1 1 180px', minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600 }}>{e.name || distanceLabel(e.distance)}</div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
                      {fmtRaceDate(e.date)}{e.name ? ` · ${distanceLabel(e.distance)}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize:12, fontWeight:600, color: past ? 'var(--text-secondary)' : 'var(--text)' }}>{fmtDaysUntil(e.date)}</span>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && editing && (
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'1.25rem' }}>
            {events.length === 0 && draft === null && (
              <p style={{ fontSize:13, color:'var(--text-secondary)', marginTop:0, marginBottom:12 }}>
                Dodaj starty, które planujesz w sezonie — pojawią się na dashboardzie i możesz ich użyć w planie rocznym (ATP).
              </p>
            )}
            <RaceListEditor races={rows} onChange={setDraft} max={50} />
            {saveErr && <div className="alert alert-warn" style={{ marginTop:12 }}>{saveErr}</div>}
            {invalid && rows.length > 0 && <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:12, marginBottom:0 }}>{invalid}</p>}
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={submit} disabled={saving || !!invalid} style={btn(true, saving || !!invalid)}>
                {saving ? 'Zapisywanie…' : '✓ Zapisz starty'}
              </button>
              {events.length > 0 && <button onClick={cancel} disabled={saving} style={btn(false)}>Anuluj</button>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
