import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import SectionLabel from '../components/SectionLabel';
import {
  calcVDOT, calcRunZones, predictTime, parseTimeInput,
  fmtPaceMmSs, fmtTimeHMMS,
  type RunZones,
} from '@tricoach/core';

const RACE_OPTIONS = [
  { label: '1 km',         distM: 1000  },
  { label: '1 mila',       distM: 1609  },
  { label: '3 km',         distM: 3000  },
  { label: '5 km',         distM: 5000  },
  { label: '10 km',        distM: 10000 },
  { label: 'Półmaraton',   distM: 21097 },
  { label: 'Maraton',      distM: 42195 },
  { label: 'Własny (m)',   distM: 0     },
];

function ZoneRow({ zone, saved }: { zone: RunZones['zones'][0]; saved?: boolean }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'140px 1fr auto', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'0.5px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:zone.color, flexShrink:0 }} />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{zone.shortName}</span>
      </div>
      <div>
        <div style={{ fontSize:15, fontWeight:700, color:zone.color }}>
          {fmtPaceMmSs(zone.maxPaceMin)} – {fmtPaceMmSs(zone.minPaceMin)} <span style={{ fontSize:11, fontWeight:400, color:'var(--text-secondary)' }}>/km</span>
        </div>
        {zone.minHR && (
          <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>
            ❤️ {zone.minHR}–{zone.maxHR} bpm
          </div>
        )}
        <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2, lineHeight:1.5 }}>{zone.description}</div>
      </div>
    </div>
  );
}

function PaceBar({ zone }: { zone: RunZones['zones'][0] }) {
  return (
    <div style={{ background:`${zone.color}18`, border:`0.5px solid ${zone.color}44`, borderLeft:`3px solid ${zone.color}`, borderRadius:'var(--radius-md)', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div style={{ fontSize:12, fontWeight:600, color:zone.color }}>{zone.shortName}</div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>
          {fmtPaceMmSs(zone.maxPaceMin)} – {fmtPaceMmSs(zone.minPaceMin)}<span style={{ fontSize:10, color:'var(--text-secondary)', marginLeft:3 }}>/km</span>
        </div>
        {zone.minHR && <div style={{ fontSize:10, color:'var(--text-secondary)' }}>❤️ {zone.minHR}–{zone.maxHR}</div>}
      </div>
    </div>
  );
}

export default function RunZonesPage() {
  const { session } = useAuth();

  // Form state
  const [raceOption, setRaceOption] = useState('5 km');
  const [customDist, setCustomDist] = useState('');
  const [timeInput, setTimeInput]   = useState('');
  const [maxHR, setMaxHR]           = useState<number | ''>('');

  // Results
  const [zones, setZones]           = useState<RunZones | null>(null);
  const [savedAt, setSavedAt]       = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Strava races (recent)
  const [stravaRaces, setStravaRaces] = useState<Array<{name:string;dist:number;time:number;date:string}>>([]);

  // Load saved zones from DB
  useEffect(() => {
    if (!session) return;
    fetch('/api/training/run-zones', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.zones) {
          setZones({
            vdot:             d.zones.vdot,
            zones:            d.zones.zones,
            predictions:      d.zones.predictions,
            thresholdPaceMin: d.zones.thresholdPaceMin,
          });
          setSavedAt(d.zones.updated_at);
          if (d.zones.race_dist_m) {
            const opt = RACE_OPTIONS.find(o => o.distM === d.zones.race_dist_m);
            if (opt) { setRaceOption(opt.label); }
            else     { setRaceOption('Własny (m)'); setCustomDist(String(d.zones.race_dist_m)); }
          }
          if (d.zones.race_time_sec) setTimeInput(fmtTimeHMMS(d.zones.race_time_sec));
        }
      })
      .catch(() => {});

    // Fetch recent Strava race activities
    fetch('/api/strava/discipline?sport=run', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.activities) return;
        const races = (d.activities as Array<Record<string,unknown>>)
          .filter(a => a.distanceKm && (a.distanceKm as number) >= 3)
          .sort((a,b) => (b.distanceKm as number) - (a.distanceKm as number))
          .slice(0, 5)
          .map(a => ({
            name: a.name as string,
            dist: Math.round((a.distanceKm as number) * 1000),
            time: a.movingTimeSec as number,
            date: (a.date as string).split('T')[0],
          }));
        setStravaRaces(races);
      })
      .catch(() => {});
  }, [session]);

  const distM = raceOption === 'Własny (m)'
    ? parseInt(customDist) || 0
    : RACE_OPTIONS.find(o => o.label === raceOption)?.distM ?? 5000;

  const calculate = () => {
    setError(null);
    const sec = parseTimeInput(timeInput);
    if (!sec || sec <= 0) { setError('Wpisz poprawny czas (np. 22:30 lub 1:45:00)'); return; }
    if (!distM)           { setError('Wybierz lub wpisz dystans'); return; }

    const vdot = calcVDOT(distM, sec);
    if (vdot < 10 || vdot > 100) { setError('Podany wynik wydaje się nieprawidłowy — sprawdź dystans i czas'); return; }

    const result = calcRunZones(vdot, maxHR ? +maxHR : undefined);
    setZones(result);
  };

  const useStravaRace = (race: typeof stravaRaces[0]) => {
    const opt = RACE_OPTIONS.find(o => Math.abs(o.distM - race.dist) < 200);
    setRaceOption(opt?.label ?? 'Własny (m)');
    if (!opt || opt.distM === 0) setCustomDist(String(race.dist));
    setTimeInput(fmtTimeHMMS(race.time));
  };

  const save = async () => {
    if (!session || !zones) return;
    setSaving(true);
    const sec = parseTimeInput(timeInput);
    await fetch('/api/training/run-zones', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
      body: JSON.stringify({
        vdot:        zones.vdot,
        raceDistM:   distM,
        raceTimeSec: sec,
        raceLabel:   raceOption,
        zones:       zones,
        predictions: zones.predictions,
      }),
    });
    setSavedAt(new Date().toISOString());
    setSaving(false);
  };

  return (
    <>
      <section style={{ background:'var(--bg-tertiary)', padding:'3rem 5vw 2.5rem' }}>
        <div style={{ maxWidth:1060, margin:'0 auto' }}>
          <SectionLabel discipline="run">Kalkulator stref</SectionLabel>
          <h1 style={{ fontSize:'clamp(24px,4vw,38px)', fontWeight:700, letterSpacing:-1.5, lineHeight:1.1, marginTop:4, marginBottom:8 }}>
            Strefy tempa i tętna
          </h1>
          <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.6 }}>
            Oblicza optymalne zakresy tempa dla każdego rodzaju biegu na podstawie VDOT (Jack Daniels).
            Wpisz swój wynik lub wybierz bieg ze Stravy.
          </p>
        </div>
      </section>

      <section>
        <div style={{ maxWidth:1060, margin:'0 auto', padding:'2rem 5vw', display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, alignItems:'start' }}>

          {/* ── LEFT: Input form ── */}
          <div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:'var(--radius-xl)', padding:'1.5rem', marginBottom:'1.25rem' }}>
              <div style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:16 }}>
                Mój wynik referencyjny
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <div className="workout-label">Dystans</div>
                  <select value={raceOption} onChange={e=>setRaceOption(e.target.value)}>
                    {RACE_OPTIONS.map(o=><option key={o.label}>{o.label}</option>)}
                  </select>
                  {raceOption === 'Własny (m)' && (
                    <input type="number" value={customDist} onChange={e=>setCustomDist(e.target.value)} placeholder="np. 8000" style={{ marginTop:8 }} />
                  )}
                </div>
                <div>
                  <div className="workout-label">Czas (MM:SS lub H:MM:SS)</div>
                  <input type="text" value={timeInput} onChange={e=>setTimeInput(e.target.value)} placeholder="np. 22:30" />
                </div>
              </div>

              <div style={{ marginBottom:16 }}>
                <div className="workout-label">Max tętno (opcjonalne — dodaje strefy HR)</div>
                <div className="input-row">
                  <input type="number" value={maxHR} onChange={e=>setMaxHR(e.target.value ? +e.target.value : '')} placeholder="np. 188" className="input-compact" />
                  <span className="input-unit">bpm</span>
                </div>
              </div>

              {error && <div className="alert alert-warn" style={{ marginBottom:12 }}>{error}</div>}

              <button onClick={calculate} style={{ width:'100%', padding:12, borderRadius:'var(--radius-md)', background:'var(--run)', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                Oblicz strefy
              </button>
            </div>

            {/* Strava races */}
            {stravaRaces.length > 0 && (
              <div style={{ background:'var(--bg-secondary)', borderRadius:'var(--radius-xl)', padding:'1.25rem' }}>
                <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:10 }}>
                  Użyj biegu ze Stravy
                </div>
                {stravaRaces.map((r,i) => (
                  <button key={i} onClick={()=>useStravaRace(r)} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:'var(--radius-md)', border:'0.5px solid var(--border)', background:'var(--bg)', cursor:'pointer', marginBottom:6, fontFamily:'var(--font)' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{r.name}</div>
                    <div style={{ fontSize:11, color:'var(--text-secondary)' }}>
                      {(r.dist/1000).toFixed(1)} km · {fmtTimeHMMS(r.time)} · {r.date}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Results ── */}
          <div>
            {zones ? (
              <>
                {/* VDOT + header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:2 }}>VDOT (Jack Daniels)</div>
                    <div style={{ fontSize:36, fontWeight:800, color:'var(--run)', letterSpacing:-1 }}>{zones.vdot}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:2 }}>Tempo progowe (T-pace)</div>
                    <div style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>{fmtPaceMmSs(zones.thresholdPaceMin)}<span style={{ fontSize:12, fontWeight:400, marginLeft:3 }}>/km</span></div>
                  </div>
                </div>

                {/* Zone bars (compact) */}
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
                  {zones.zones.map(z => <PaceBar key={z.id} zone={z} />)}
                </div>

                {/* Race predictions */}
                <div style={{ background:'var(--bg-secondary)', borderRadius:'var(--radius-lg)', padding:'1rem 1.25rem', marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:10 }}>Przewidywane czasy</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))', gap:8 }}>
                    {zones.predictions.map(p => (
                      <div key={p.label} style={{ textAlign:'center' }}>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{fmtTimeHMMS(p.timeSec)}</div>
                        <div style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2 }}>{p.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                  <button onClick={save} disabled={saving || !session} style={{ padding:'9px 22px', borderRadius:'var(--radius-md)', background:'var(--text)', color:'var(--bg)', border:'none', fontSize:13, fontWeight:600, cursor:saving||!session?'not-allowed':'pointer', fontFamily:'var(--font)', opacity:saving?0.7:1 }}>
                    {saving ? 'Zapisywanie…' : '💾 Zapisz strefy'}
                  </button>
                  {savedAt && <span style={{ fontSize:11, color:'var(--text-secondary)' }}>Zapisano: {new Date(savedAt).toLocaleDateString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>}
                </div>
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'3rem 0', color:'var(--text-secondary)' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🏃</div>
                <p style={{ fontSize:14, lineHeight:1.6 }}>
                  Wpisz swój wynik lub wybierz bieg ze Stravy<br />i kliknij „Oblicz strefy".
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Detailed zone table */}
      {zones && (
        <section className="alt">
          <div style={{ maxWidth:1060, margin:'0 auto', padding:'2rem 5vw' }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-secondary)', marginBottom:16 }}>Szczegóły stref</div>
            <div className="card">
              {zones.zones.map(z => <ZoneRow key={z.id} zone={z} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
