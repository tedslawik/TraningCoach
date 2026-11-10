/**
 * Season periodization (ATP skeleton).
 *
 * Builds the phase structure for a whole season deterministically from a list of races,
 * working backwards from every A race (Friel-style: Prep → Base 1–3 → Build 1–2 → Peak → Race
 * → Recovery). B and C races don't change the structure — they are markers inside phases
 * (B = mini-taper, C = train through). The AI only fills phase content, never dates.
 *
 * All dates are 'YYYY-MM-DD'; weeks run Monday–Sunday; arithmetic is done in UTC.
 */

export type SeasonDiscipline = 'triathlon' | 'run' | 'bike' | 'swim';
export type RacePriority     = 'A' | 'B' | 'C';
export type SeasonPhaseType  = 'base' | 'build' | 'peak' | 'race' | 'recovery' | 'transition';

export interface EventDistance {
  value: string;
  label: string;
  discipline: SeasonDiscipline;
  /** Weeks of peak/taper before an A race. */
  taperWeeks: number;
  /** Weeks of recovery after an A race. */
  recoveryWeeks: number;
}

export const EVENT_DISTANCES: EventDistance[] = [
  { value: 'sprint',       label: 'Sprint (~1:15h)',      discipline: 'triathlon', taperWeeks: 1, recoveryWeeks: 1 },
  { value: 'olympic',      label: 'Olympic (~2:30h)',     discipline: 'triathlon', taperWeeks: 2, recoveryWeeks: 1 },
  { value: 'half',         label: 'Half Ironman (~5–6h)', discipline: 'triathlon', taperWeeks: 2, recoveryWeeks: 2 },
  { value: 'full',         label: 'Full Ironman (~12h)',  discipline: 'triathlon', taperWeeks: 3, recoveryWeeks: 3 },
  { value: '5k',           label: '5 km',                 discipline: 'run',       taperWeeks: 1, recoveryWeeks: 1 },
  { value: '10k',          label: '10 km',                discipline: 'run',       taperWeeks: 1, recoveryWeeks: 1 },
  { value: 'halfmarathon', label: 'Półmaraton',           discipline: 'run',       taperWeeks: 2, recoveryWeeks: 1 },
  { value: 'marathon',     label: 'Maraton',              discipline: 'run',       taperWeeks: 3, recoveryWeeks: 3 },
  { value: 'granfondo',    label: 'Gran Fondo',           discipline: 'bike',      taperWeeks: 2, recoveryWeeks: 1 },
  { value: 'race100',      label: 'Wyścig 100 km',        discipline: 'bike',      taperWeeks: 1, recoveryWeeks: 1 },
  { value: 'race200',      label: 'Wyścig 200 km',        discipline: 'bike',      taperWeeks: 2, recoveryWeeks: 2 },
  { value: 'mtb',          label: 'Zawody MTB/XC',        discipline: 'bike',      taperWeeks: 1, recoveryWeeks: 1 },
  { value: 'pool1500',     label: '1500 m (basen)',       discipline: 'swim',      taperWeeks: 1, recoveryWeeks: 1 },
  { value: 'ow3k',         label: '3 km (otwarty)',       discipline: 'swim',      taperWeeks: 2, recoveryWeeks: 1 },
  { value: 'ow5k',         label: '5 km (otwarty)',       discipline: 'swim',      taperWeeks: 2, recoveryWeeks: 1 },
  { value: 'ow10k',        label: '10 km (otwarty)',      discipline: 'swim',      taperWeeks: 2, recoveryWeeks: 2 },
];

export const DEFAULT_DISTANCE: Record<SeasonDiscipline, string> = {
  triathlon: 'half', run: 'halfmarathon', bike: 'granfondo', swim: 'ow3k',
};

export function distancesFor(discipline: SeasonDiscipline): EventDistance[] {
  return EVENT_DISTANCES.filter(d => d.discipline === discipline);
}

export function distanceLabel(value: string): string {
  return EVENT_DISTANCES.find(d => d.value === value)?.label ?? value;
}

export interface SeasonRace {
  date: string;
  priority: RacePriority;
  distance: string;
  name?: string;
}

export interface SeasonPhase {
  name: string;
  type: SeasonPhaseType;
  startDate: string;
  endDate: string;
  weeks: number;
  races: SeasonRace[];
}

export interface SeasonSkeleton {
  startDate: string;
  endDate: string;
  totalWeeks: number;
  phases: SeasonPhase[];
}

/* ── date helpers (UTC, day precision) ── */
const DAY  = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseISO(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
/** First Monday on or after `today` (local calendar date). */
export function seasonStart(today: Date = new Date()): string {
  const ms  = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = new Date(ms).getUTCDay();               // 0 = Sun, 1 = Mon
  const add = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  return toISO(ms + add * DAY);
}

const BUILD_WEEKS_MAX = 8;   // Build 1 + Build 2
const PREP_WEEKS_MAX  = 6;   // general prep at the very start of a long base
const TRANSITION_WEEKS = 2;
const MAX_RACES = 20;
const MAX_HORIZON_WEEKS = 104;

/** Error message if two races share the same date and distance, else null. */
export function findDuplicateRace(races: SeasonRace[]): string | null {
  const seen = new Set<string>();
  for (const r of races) {
    const k = `${r.date}|${r.distance}`;
    if (r.date && seen.has(k)) return `Start ${r.date} (${distanceLabel(r.distance)}) jest na liście więcej niż raz — usuń duplikat.`;
    seen.add(k);
  }
  return null;
}

/**
 * Returns a Polish error message, or null when the race list is usable.
 * A races must match the plan discipline (they drive periodization); B/C races may be any discipline.
 */
export function validateSeasonRaces(
  races: SeasonRace[],
  discipline: SeasonDiscipline,
  today: Date = new Date(),
): string | null {
  if (races.length === 0) return 'Dodaj co najmniej jeden start.';
  if (races.length > MAX_RACES) return `Maksymalnie ${MAX_RACES} startów w sezonie.`;
  const start = parseISO(seasonStart(today));
  for (const r of races) {
    if (!ISO_RE.test(r.date)) return 'Uzupełnij datę każdego startu.';
    const ms = parseISO(r.date);
    if (ms < start) return `Start ${r.date} wypada przed początkiem planu (${toISO(start)}).`;
    if ((ms - start) / WEEK > MAX_HORIZON_WEEKS) return `Start ${r.date} jest dalej niż 2 lata — skróć horyzont.`;
    if (!['A', 'B', 'C'].includes(r.priority)) return 'Nieprawidłowy priorytet startu.';
    const d = disciplineOfDistance(r.distance);
    if (!d) return 'Wybierz dystans dla każdego startu.';
    if (r.priority === 'A' && d !== discipline)
      return `Start A (${r.date}, ${distanceLabel(r.distance)}) musi być w dyscyplinie planu — starty z innych dyscyplin oznacz jako B lub C.`;
  }
  if (!races.some(r => r.priority === 'A')) return 'Oznacz co najmniej jeden start jako A (główny cel sezonu).';
  const dup = findDuplicateRace(races);
  if (dup) return dup;
  return null;
}

interface WeekLabel { type: SeasonPhaseType; name: string }

/** Splits `n` weeks into `parts` chunks, earlier chunks taking the remainder. */
function split(n: number, parts: number): number[] {
  const base = Math.floor(n / parts), rest = n % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Builds the season phase structure. Assumes `validateSeasonRaces` returned null.
 */
export function buildSeasonSkeleton(races: SeasonRace[], today: Date = new Date()): SeasonSkeleton {
  const startISO = seasonStart(today);
  const startMs  = parseISO(startISO);
  const weekOf   = (date: string) => Math.floor((parseISO(date) - startMs) / WEEK);
  const dist     = (v: string) => EVENT_DISTANCES.find(d => d.value === v) ?? EVENT_DISTANCES[2];

  const sorted = [...races].sort((a, b) => a.date.localeCompare(b.date));
  const labels: WeekLabel[] = [];
  const fill = (from: number, count: number, label: WeekLabel) => {
    for (let w = from; w < from + count; w++) labels[w] = label;
  };

  let segStart = 0;
  let baseNo = 0, buildNo = 0;

  for (const race of sorted.filter(r => r.priority === 'A')) {
    const w = weekOf(race.date);
    const d = dist(race.distance);

    const avail = w - segStart;                       // weeks before race week
    if (avail > 0) {
      const taper = Math.min(d.taperWeeks, avail);
      const build = Math.min(BUILD_WEEKS_MAX, avail - taper);
      const base  = avail - taper - build;
      let cur = segStart;

      // Long base: up to 6 weeks of general prep (first segment only), then 4-week base blocks.
      const prep = segStart === 0 && base > 12 ? Math.min(PREP_WEEKS_MAX, base - 12) : 0;
      if (prep > 0) { fill(cur, prep, { type: 'base', name: 'Przygotowanie ogólne' }); cur += prep; }
      const realBase = base - prep;
      if (realBase > 0) {
        for (const len of split(realBase, Math.ceil(realBase / 4))) {
          fill(cur, len, { type: 'base', name: `Baza ${++baseNo}` }); cur += len;
        }
      }
      if (build > 0) {
        for (const len of split(build, build >= 6 ? 2 : 1)) {
          fill(cur, len, { type: 'build', name: `Budowanie ${++buildNo}` }); cur += len;
        }
      }
      fill(cur, taper, { type: 'peak', name: 'Szczyt / tapering' });
    }

    labels[w] = { type: 'race', name: `Start A · ${race.name?.trim() || d.label}` };
    fill(w + 1, d.recoveryWeeks, { type: 'recovery', name: 'Regeneracja' });
    segStart = Math.max(segStart, w + 1 + d.recoveryWeeks);
  }

  // Tail: B/C races after the last A race keep form; then season ends with a transition.
  const lastRaceWeek = weekOf(sorted[sorted.length - 1].date);
  if (segStart <= lastRaceWeek) {
    fill(segStart, lastRaceWeek + 1 - segStart, { type: 'build', name: 'Utrzymanie formy' });
    fill(lastRaceWeek + 1, TRANSITION_WEEKS, { type: 'transition', name: 'Roztrenowanie' });
  } else {
    // Season ends on an A race: its recovery becomes the off-season transition.
    const from = labels.findIndex((l, i) => i > lastRaceWeek && l?.type === 'recovery');
    const tailFrom = from === -1 ? lastRaceWeek + 1 : from;
    const len = Math.max(TRANSITION_WEEKS, segStart - tailFrom);
    fill(tailFrom, len, { type: 'transition', name: 'Roztrenowanie' });
  }

  // Group consecutive weeks with the same label into phases.
  const phases: SeasonPhase[] = [];
  for (let w = 0; w < labels.length; w++) {
    const l = labels[w] ?? { type: 'build', name: 'Utrzymanie formy' };
    const prev = phases[phases.length - 1];
    if (prev && prev.name === l.name && prev.type === l.type) {
      prev.weeks++;
      prev.endDate = toISO(startMs + w * WEEK + 6 * DAY);
    } else {
      phases.push({
        name: l.name, type: l.type, weeks: 1, races: [],
        startDate: toISO(startMs + w * WEEK),
        endDate:   toISO(startMs + w * WEEK + 6 * DAY),
      });
    }
  }
  for (const r of sorted) {
    phases.find(p => r.date >= p.startDate && r.date <= p.endDate)?.races.push(r);
  }

  return {
    startDate: startISO,
    endDate: phases[phases.length - 1].endDate,
    totalWeeks: labels.length,
    phases,
  };
}

/* ── Planned events (user profile) ── */

/** Discipline implied by a distance value, or null for unknown values. */
export function disciplineOfDistance(distance: string): SeasonDiscipline | null {
  return EVENT_DISTANCES.find(d => d.value === distance)?.discipline ?? null;
}

const MAX_EVENTS = 50;

/** Validates a user's planned-events list. Returns a Polish error message, or null. */
export function validateEvents(events: SeasonRace[]): string | null {
  if (events.length > MAX_EVENTS) return `Maksymalnie ${MAX_EVENTS} startów.`;
  for (const e of events) {
    if (!ISO_RE.test(e.date)) return 'Uzupełnij datę każdego startu.';
    if (!['A', 'B', 'C'].includes(e.priority)) return 'Nieprawidłowy priorytet startu.';
    if (!disciplineOfDistance(e.distance)) return 'Wybierz dystans dla każdego startu.';
    if ((e.name ?? '').length > 60) return 'Nazwa startu może mieć maksymalnie 60 znaków.';
  }
  return findDuplicateRace(events);
}

/** Whole days from today (local calendar date) to `date`; negative for past dates. */
export function daysUntilDate(date: string, today: Date = new Date()): number {
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseISO(date) - t) / DAY);
}
