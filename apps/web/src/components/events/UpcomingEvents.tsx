import { Link } from 'react-router-dom';
import { distanceLabel, disciplineOfDistance, daysUntilDate } from '@tricoach/core';
import SectionLabel from '../SectionLabel';
import { useRaceEvents } from '../../lib/raceEvents';
import { DISCIPLINE_META, PriorityBadge, fmtDaysUntil } from './RaceListEditor';

/** Dashboard list of the user's upcoming planned races. */
export default function UpcomingEvents({ limit = 5 }: { limit?: number }) {
  const { events, loading, error } = useRaceEvents();
  if (loading || error) return null;   // the profile page surfaces load errors

  const upcoming = events.filter(e => daysUntilDate(e.date) >= 0).slice(0, limit);

  return (
    <section>
      <div className="section-inner">
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:'0.6rem' }}>
          <SectionLabel discipline="tri">Nadchodzące starty</SectionLabel>
          <Link to="/athlete#starty" style={{ fontSize:13, fontWeight:600, color:'var(--tri)' }}>
            {upcoming.length ? 'Zarządzaj startami →' : 'Dodaj starty →'}
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <p style={{ fontSize:13, color:'var(--text-secondary)', margin:0 }}>
            Nie masz zaplanowanych startów. Dodaj je w profilu zawodnika — pomogą zaplanować sezon.
          </p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:10 }}>
            {upcoming.map(e => {
              const d = disciplineOfDistance(e.distance);
              const date = new Date(e.date);
              return (
                <div key={e.id} className="card" style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 12px', marginBottom:0, borderLeft:`3px solid ${d ? DISCIPLINE_META[d].color : 'var(--border-md)'}` }}>
                  <div style={{ textAlign:'center', minWidth:40 }}>
                    <div style={{ fontSize:18, fontWeight:700, lineHeight:1 }}>{date.getDate()}</div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-secondary)', letterSpacing:'0.06em' }}>
                      {date.toLocaleDateString('pl-PL', { month:'short' })}
                    </div>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <PriorityBadge p={e.priority} />
                      <span style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {e.name || distanceLabel(e.distance)}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
                      {d ? `${DISCIPLINE_META[d].icon} ` : ''}{e.name ? `${distanceLabel(e.distance)} · ` : ''}{fmtDaysUntil(e.date)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
