/**
 * Jack Daniels VDOT running zones calculator
 * https://runsmartproject.com/calculator/
 */

export interface PaceZone {
  id:          string;
  name:        string;
  shortName:   string;
  minPaceMin:  number;   // min/km — slower end (easier)
  maxPaceMin:  number;   // min/km — faster end
  minHR?:      number;
  maxHR?:      number;
  pctVO2lo:    number;
  pctVO2hi:    number;
  description: string;
  color:       string;
}

export interface RacePrediction {
  label:    string;
  distM:    number;
  timeSec:  number;
}

export interface RunZones {
  vdot:        number;
  zones:       PaceZone[];
  predictions: RacePrediction[];
  thresholdPaceMin: number; // T-pace min/km
}

/* ── VDOT formula (Jack Daniels) ── */
export function calcVDOT(distM: number, timeSec: number): number {
  const t = timeSec / 60;   // minutes
  const v = distM / t;      // meters per minute

  const VO2    = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * t)
               + 0.2989558 * Math.exp(-0.1932605 * t);

  return VO2 / pctMax;
}

/* Velocity (m/min) for a given %VO2max and VDOT */
function velAt(pctVO2: number, vdot: number): number {
  const target = pctVO2 * vdot;
  // Solve: 0.000104*v² + 0.182258*v + (-4.60 - target) = 0
  const a = 0.000104, b = 0.182258, c = -4.60 - target;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 200;
  return (-b + Math.sqrt(disc)) / (2 * a);
}

/* m/min → min/km */
function toMinKm(mpm: number): number {
  return mpm > 0 ? 1000 / mpm : 99;
}

/* Riegel race time prediction: T2 = T1 × (D2/D1)^1.06 */
export function predictTime(distM: number, refDistM: number, refTimeSec: number): number {
  return refTimeSec * Math.pow(distM / refDistM, 1.06);
}

/* ── Zone definitions ── */
const ZONE_DEFS = [
  { id:'easy',   shortName:'Z1 Łatwy',   name:'Bieg łatwy / regeneracyjny', lo:0.59, hi:0.74, hrLo:0.60, hrHi:0.72, color:'#60a5fa', desc:'Możesz rozmawiać pełnymi zdaniami. Buduje bazę tlenową i przyspiesza regenerację.' },
  { id:'long',   shortName:'Z2 Długi',   name:'Długi bieg aerobowy',         lo:0.72, hi:0.80, hrLo:0.68, hrHi:0.78, color:'#34d399', desc:'Tempo długiego treningu. Podstawa kondycji na dystansach > 1h.' },
  { id:'marathon', shortName:'Z3 Maraton', name:'Tempo maratońskie',          lo:0.80, hi:0.85, hrLo:0.77, hrHi:0.85, color:'#fbbf24', desc:'Komfortowo ciężko. Dobre na tempówki > 20 min.' },
  { id:'threshold', shortName:'Z4 Próg', name:'Bieg progowy (tempo)',         lo:0.83, hi:0.88, hrLo:0.82, hrHi:0.90, color:'#fb923c', desc:'Próg mleczanowy — ciężko, ale wyrównane tempo. Max 40-60 min ciągiem.' },
  { id:'interval', shortName:'Z5 Interwały', name:'Interwały VO₂max',         lo:0.95, hi:1.00, hrLo:0.90, hrHi:0.96, color:'#f87171', desc:'Intensywność wyścigu na 3-5 km. Krótkie bloki 3-5 min z odpoczynkiem.' },
  { id:'rep',    shortName:'Z6 Repetycje', name:'Repetycje / sprinty',         lo:1.05, hi:1.15, hrLo:0.96, hrHi:1.00, color:'#e11d48', desc:'Maksymalna prędkość. Krótkie powtórzenia 60-200 m dla ekonomii biegu.' },
] as const;

const RACE_DISTANCES = [
  { label: '1 mila',        distM: 1609   },
  { label: '5 km',          distM: 5000   },
  { label: '10 km',         distM: 10000  },
  { label: 'Półmaraton',    distM: 21097  },
  { label: 'Maraton',       distM: 42195  },
] as const;

/* ── Main calculator ── */
export function calcRunZones(vdot: number, maxHR?: number): RunZones {
  const zones: PaceZone[] = ZONE_DEFS.map(z => {
    const loMpm = velAt(z.lo, vdot);
    const hiMpm = velAt(z.hi, vdot);
    return {
      id:         z.id,
      name:       z.name,
      shortName:  z.shortName,
      minPaceMin: toMinKm(hiMpm),   // faster = lower pace number
      maxPaceMin: toMinKm(loMpm),   // slower = higher pace number
      ...(maxHR ? {
        minHR: Math.round(maxHR * z.hrLo),
        maxHR: Math.round(maxHR * z.hrHi),
      } : {}),
      pctVO2lo:    z.lo,
      pctVO2hi:    z.hi,
      description: z.desc,
      color:       z.color,
    };
  });

  const predictions: RacePrediction[] = RACE_DISTANCES.map(({ label, distM }) => {
    // Use velocity at ~marathon %VO2max for longer, interval for short
    const pct = distM <= 5000 ? 0.975 : distM <= 10000 ? 0.90 : distM <= 21097 ? 0.82 : 0.77;
    const mpm = velAt(pct, vdot);
    const timeSec = Math.round((distM / mpm) * 60);
    return { label, distM, timeSec };
  });

  const threshold = zones.find(z => z.id === 'threshold')!;
  const thresholdPaceMin = (threshold.minPaceMin + threshold.maxPaceMin) / 2;

  return { vdot: Math.round(vdot * 10) / 10, zones, predictions, thresholdPaceMin };
}

/* ── Formatting helpers ── */
export function fmtPaceMmSs(minKm: number): string {
  if (!minKm || minKm > 20) return '—';
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtTimeHMMS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export function parseTimeInput(str: string): number | null {
  // Accepts: 22:30, 1:45:00, 22.30
  if (!str) return null;
  const parts = str.replace('.', ':').split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}
