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

/* ── Season load (weekly hours per phase) ──
   Deterministic: same races + start hours → same numbers. The AI never picks volume. */

/** Typical amateur peak weekly hours (build phase) per A-race distance. */
export const PEAK_HOURS: Record<string, number> = {
  sprint: 9, olympic: 10, half: 12, full: 14,
  '5k': 6, '10k': 6.5, halfmarathon: 7, marathon: 8,
  granfondo: 11, race100: 9, race200: 12, mtb: 9,
  pool1500: 6, ow3k: 6, ow5k: 7, ow10k: 8,
};

/**
 * How much a block before an A race of this distance grows the athlete's OWN volume (peak = start × growth).
 * Longer races need a bigger build; PEAK_HOURS only lifts low starters toward a typical amateur volume.
 */
export const PEAK_GROWTH: Record<string, number> = {
  sprint: 1.15, olympic: 1.2, half: 1.3, full: 1.4,
  '5k': 1.15, '10k': 1.15, halfmarathon: 1.2, marathon: 1.3,
  granfondo: 1.25, race100: 1.2, race200: 1.3, mtb: 1.2,
  pool1500: 1.15, ow3k: 1.2, ow5k: 1.25, ow10k: 1.3,
};

/** Share of the segment peak, per phase type outside the base→build ramp. */
const LOAD_SHARE = { peak: 0.65, race: 0.5, recovery: 0.45, transition: 0.35, maintain: 0.8 } as const;
const MAX_WEEKLY_GROWTH = 1.08;   // ramp never exceeds ~8%/week on average
const SEASON_GROWTH_CAP = 1.6;    // peak ≤ start × 1.6 (unless the distance cap is lower)
const roundHalf = (h: number) => Math.round(h * 2) / 2;

/** Week k (0-based) of an n-week stretch: linear share from `from` to `to`; one week → midpoint. */
const glide = (k: number, n: number, from: number, to: number) => n <= 1 ? (from + to) / 2 : from + (to - from) * k / (n - 1);

/** Deload: the last week of a base/build block of 3+ weeks. */
export function isDeloadWeek(type: SeasonPhaseType, weekInPhase: number, phaseWeeks: number): boolean {
  return (type === 'base' || type === 'build') && phaseWeeks >= 3 && weekInPhase === phaseWeeks;
}
const DELOAD_SHARE = 0.65;

export interface SeasonLoad {
  /** Typical (non-deload) week of each phase — what the phase "is". */
  phaseHours: number[];
  /** Planned hours for every week of each phase (deload, taper and recovery included). */
  weekHours: number[][];
}

/**
 * Weekly hours for every week of the skeleton.
 * startHours = the athlete's current (or chosen minimum) weekly volume — the season starts there.
 * Each A race closes a segment: base/build ramp week by week from the segment start to its peak
 * (peak = start × PEAK_GROWTH[distance], low starters lifted toward PEAK_HOURS), the last week of every
 * 3+ week block is a deload (65%), taper glides 80% → 50% of peak, race week 50%, recovery 35% → 55%;
 * the next segment starts at max(start, 90% of the previous peak).
 */
export function planSeasonLoad(phases: SeasonPhase[], startHours: number): SeasonLoad {
  const start = Math.max(1, startHours || 0);
  const weeks: number[][] = phases.map(p => new Array(p.weeks).fill(0));
  const recovery = (pi: number, peak: number) => {
    const n = phases[pi].weeks;
    for (let k = 0; k < n; k++) weeks[pi][k] = peak * glide(k, n, 0.35, 0.55);
  };
  let i = 0, segStartLevel = start, lastPeak = start;

  while (i < phases.length) {
    // Segment = phases up to and including the next A-race week ('race' phase).
    let end = i;
    while (end < phases.length && phases[end].type !== 'race') end++;
    const raceIdx = end < phases.length ? end : -1;

    if (raceIdx === -1) {
      // Tail after the last A race: keep form, then off-season.
      for (let pi = i; pi < phases.length; pi++) {
        const p = phases[pi];
        if (p.type === 'recovery') { recovery(pi, lastPeak); continue; }
        if (p.type === 'transition') { weeks[pi].fill(Math.max(2, lastPeak * LOAD_SHARE.transition)); continue; }
        const h = Math.max(start * 0.8, lastPeak * LOAD_SHARE.maintain);
        for (let k = 0; k < p.weeks; k++) weeks[pi][k] = (k + 1) % 4 === 0 ? h * DELOAD_SHARE : h;   // 3 on, 1 off
      }
      break;
    }

    const aRace = phases[raceIdx].races.find(r => r.priority === 'A');
    const dist  = aRace?.distance ?? '';
    const typical = PEAK_HOURS[dist] ?? 12;
    const rampWeeks = phases.slice(i, raceIdx).filter(p => p.type === 'base' || p.type === 'build').reduce((s, p) => s + p.weeks, 0);
    // Scale the athlete's own volume by the distance's growth; low starters are pulled up toward the
    // typical volume (max ×1.6). Never faster than ~8%/week over the ramp.
    const target = Math.max(segStartLevel * (PEAK_GROWTH[dist] ?? 1.25), Math.min(typical, segStartLevel * SEASON_GROWTH_CAP));
    const peak = Math.max(segStartLevel * 1.05, Math.min(target, segStartLevel * MAX_WEEKLY_GROWTH ** Math.max(1, rampWeeks)));

    let elapsed = 0;
    for (let pi = i; pi <= raceIdx; pi++) {
      const p = phases[pi], n = p.weeks;
      // No deload right before the taper — the taper itself unloads.
      const deload = isDeloadWeek(p.type, n, n) && phases[pi + 1]?.type !== 'peak';
      const loadWeeks = deload ? n - 1 : n;
      const blockLevel = segStartLevel + (peak - segStartLevel) * (rampWeeks ? (elapsed + loadWeeks / 2) / rampWeeks : 1);
      for (let k = 0; k < n; k++) {
        if (p.type === 'base' || p.type === 'build') {
          // Inside a block the load steps up ~5%/week around the ramp level, then the deload week.
          weeks[pi][k] = deload && k === n - 1
            ? blockLevel * DELOAD_SHARE
            : Math.max(start, Math.min(peak, blockLevel * (1 + 0.05 * (k - (loadWeeks - 1) / 2))));   // start = the athlete's floor
        } else if (p.type === 'peak')     weeks[pi][k] = peak * glide(k, n, 0.8, 0.5);
        else if (p.type === 'race')       weeks[pi][k] = peak * LOAD_SHARE.race;
        else if (p.type === 'recovery')   weeks[pi][k] = peak * glide(k, n, 0.35, 0.55);
        else                              weeks[pi][k] = Math.max(2, peak * LOAD_SHARE.transition);
      }
      if (p.type === 'base' || p.type === 'build') elapsed += n;
    }

    // Recovery right after this race belongs to it (skeleton puts it before the next base).
    let j = raceIdx + 1;
    while (j < phases.length && phases[j].type === 'recovery') { recovery(j, peak); j++; }
    lastPeak = peak;
    segStartLevel = Math.max(start, peak * 0.9);          // fitness mostly retained through a short recovery
    i = j;
  }

  const weekHours = weeks.map(w => w.map(roundHalf));
  const phaseHours = phases.map((p, pi) => {
    const top = Math.max(...weeks[pi]);
    const normal = p.type === 'base' || p.type === 'build' ? weeks[pi].filter(h => h >= top * 0.8) : weeks[pi];
    const list = normal.length ? normal : weeks[pi];
    return roundHalf(list.reduce((a, b) => a + b, 0) / list.length);
  });
  return { phaseHours, weekHours };
}

/** Typical weekly hours per phase (see planSeasonLoad). */
export function planSeasonHours(phases: SeasonPhase[], startHours: number): number[] {
  return planSeasonLoad(phases, startHours).phaseHours;
}
