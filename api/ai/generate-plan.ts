import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase  = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Claude Sonnet 5.5 — $2 / $10 per MTok. Thinking off (`between_tools`) to keep latency
// within Vercel function limits. SDK 0.92 types predate `between_tools`, hence the cast.
const MODEL       = 'claude-sonnet-5-5';
const NO_THINKING = { type: 'between_tools' } as unknown as Anthropic.ThinkingConfigParam;
const costUsd     = (u: { input_tokens: number; output_tokens: number }) =>
  (u.input_tokens * 2 + u.output_tokens * 10) / 1_000_000;
function aiError(res: VercelResponse, e: unknown) {
  console.error('[generate-plan] Claude API error:', e);
  if (e instanceof Anthropic.RateLimitError)
    return res.status(429).json({ error: 'Limit zapytań AI — spróbuj ponownie za minutę.' });
  if (e instanceof Anthropic.APIError)
    return res.status(502).json({ error: `Błąd AI (${e.status ?? '?'}) — spróbuj ponownie.` });
  return res.status(502).json({ error: 'Nie udało się połączyć z AI — spróbuj ponownie.' });
}
const textOf      = (m: Anthropic.Message) =>
  m.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim() || '{}';

type SportType = 'triathlon' | 'run' | 'bike' | 'swim' | 'atp';

const SPORT_LABELS: Record<string, string> = {
  triathlon: 'Triathlon', run: 'Bieganie', bike: 'Kolarstwo', swim: 'Pływanie', atp: 'ATP',
};

const SPORT_SETS: Record<string, Set<string>> = {
  run:  new Set(['Run','TrailRun','VirtualRun']),
  bike: new Set(['Ride','VirtualRide','EBikeRide','Velomobile','Handcycle']),
  swim: new Set(['Swim','OpenWaterSwim']),
};

function nextMonday(): string {
  const d = new Date(); const day = d.getDay() === 0 ? 1 : 8 - d.getDay();
  d.setDate(d.getDate() + day); d.setHours(0,0,0,0);
  return d.toISOString().split('T')[0];
}

function formatDate(base: string, offset: number): string {
  const d = new Date(base); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('pl-PL', { day:'numeric', month:'short' });
}

/* ── PMC from weekly summaries ── */
function calcPMC(summaries: Array<Record<string,unknown>>) {
  const sorted = [...summaries].sort((a,b) => (a.week_start as string).localeCompare(b.week_start as string));
  let ctl = 0, atl = 0;
  for (const s of sorted) {
    const tss = (s.tss as number) ?? 0;
    ctl = ctl * Math.exp(-7/42) + tss * (1 - Math.exp(-7/42));
    atl = atl * Math.exp(-7/7)  + tss * (1 - Math.exp(-7/7));
  }
  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(ctl - atl) };
}

/* ── Activity analysis from recent 4 weeks ── */
function analyzeActivities(acts: Array<Record<string,unknown>>, sport: string) {
  const filtered = acts.filter(a => (SPORT_SETS[sport] ?? new Set()).has(a.sport_type as string));
  if (!filtered.length) return null;

  const suffices = filtered.map(a => (a.suffer_score as number) ?? 0);
  const easy   = filtered.filter((_,i) => suffices[i] < 50).length;
  const medium = filtered.filter((_,i) => suffices[i] >= 50 && suffices[i] < 150).length;
  const hard   = filtered.filter((_,i) => suffices[i] >= 150).length;

  const totalDist = filtered.reduce((s,a) => s + ((a.distance as number)??0)/1000, 0);
  const totalTime = filtered.reduce((s,a) => s + ((a.moving_time as number)??0)/60, 0);

  let avgPaceStr = '';
  if (totalDist > 0 && totalTime > 0) {
    if (sport === 'bike') {
      avgPaceStr = `${(totalDist / (totalTime/60)).toFixed(1)} km/h`;
    } else if (sport === 'swim') {
      const p = totalTime / (totalDist * 10);
      avgPaceStr = `${Math.floor(p)}:${String(Math.round((p%1)*60)).padStart(2,'0')}/100m`;
    } else {
      const p = totalTime / totalDist;
      avgPaceStr = `${Math.floor(p)}:${String(Math.round((p%1)*60)).padStart(2,'0')}/km`;
    }
  }

  const avgKmPerWeek = totalDist / 4;
  const avgSufferPerSession = suffices.reduce((s,v)=>s+v,0) / filtered.length;

  return { easy, medium, hard, total: filtered.length, avgPaceStr, avgKmPerWeek: Math.round(avgKmPerWeek*10)/10, avgSufferPerSession: Math.round(avgSufferPerSession) };
}

/* ── HR zone context from athlete zones ── */
function hrZoneContext(zones: Array<{min:number;max:number}> | null): string {
  if (!zones || !zones.length) return '';
  return `Strefy tętna zawodnika: ${zones.map((z,i)=>`Z${i+1}(${z.min<=0?'<':z.min+'–'}${z.max<=0?'max':z.max}bpm)`).join(', ')}`;
}

/* ── Sport-specific training context ── */
function sportContext(sport: SportType, analysis: Record<string, ReturnType<typeof analyzeActivities>>): string {
  const r = analysis.run, b = analysis.bike, s = analysis.swim;

  if (sport === 'run') {
    const total = r?.total ?? 0;
    const pattern = r ? `${r.easy} łatwych, ${r.medium} umiarkowanych, ${r.hard} ciężkich (ostatnie 4 tyg.)` : 'brak danych';
    return `
PLAN: WYŁĄCZNIE BIEGOWY
Analiza ostatnich 4 tygodni biegu: ${pattern}
Śr. tempo: ${r?.avgPaceStr ?? '—'} | Śr. ${r?.avgKmPerWeek ?? 0} km/tydzień | ${total} sesji/4tyg
Typy treningów biegowych: długi bieg LSR (1x/tydzień), tempo/próg, interwały, łatwy Z2
type=run we wszystkich sesjach. Nie dodawaj swim ani bike.`;
  }

  if (sport === 'bike') {
    const pattern = b ? `${b.easy} łatwych, ${b.medium} umiarkowanych, ${b.hard} ciężkich` : 'brak danych';
    return `
PLAN: WYŁĄCZNIE ROWEROWY
Analiza 4 tyg.: ${pattern}
Śr. prędkość: ${b?.avgPaceStr ?? '—'} | Śr. ${b?.avgKmPerWeek ?? 0} km/tydzień
Typy: długa jazda Z2 (weekend), sweet spot 88-93% FTP, interwały FTP, regeneracja Z1
type=bike we wszystkich sesjach. Nie dodawaj swim ani run.`;
  }

  if (sport === 'swim') {
    const pattern = s ? `${s.easy} łatwych, ${s.medium} tech., ${s.hard} interwałowych` : 'brak danych';
    return `
PLAN: WYŁĄCZNIE PŁYWACKI
Analiza 4 tyg.: ${pattern}
Śr. tempo: ${s?.avgPaceStr ?? '—'} | Śr. ${s?.avgKmPerWeek ?? 0} km/tydzień
Typy: technika+dryle, wytrzymałość ciągła, interwały 400m/200m, długi dystans
type=swim we wszystkich sesjach. Nie dodawaj run ani bike.`;
  }

  // triathlon
  return `
PLAN: TRIATHLONOWY
Analiza 4 tyg. — biegi: ${r?.avgKmPerWeek??0}km/tyg (${r?.hard??0} ciężkich), rower: ${b?.avgKmPerWeek??0}km/tyg, pływanie: ${s?.avgKmPerWeek??0}km/tyg
Balansuj 3 dyscypliny. Brick raz na 2 tyg. Pływanie min 2x/tydzień.`;
}

/* ── ATP prompt ── */
const DISCIPLINE_LABELS: Record<string, string> = {
  triathlon: 'Triathlon', run: 'Bieganie', bike: 'Kolarstwo', swim: 'Pływanie',
};

/* ── Weekly hours ──
   Training time of the plan's discipline(s), from weekly_summaries (newest-first). */
const TIME_KEYS: Record<string, string[]> = {
  triathlon: ['swim_time_min', 'bike_time_min', 'run_time_min'],
  swim: ['swim_time_min'], bike: ['bike_time_min'], run: ['run_time_min'],
};
function avgWeeklyHours(summaries: Array<Record<string,unknown>>, discipline: string, n = 8): number {
  const recent = summaries.slice(0, n);
  if (!recent.length) return 0;
  const keys = TIME_KEYS[discipline] ?? TIME_KEYS.triathlon;
  const min = recent.reduce((s, r) => s + keys.reduce((a, k) => a + ((r[k] as number) ?? 0), 0), 0) / recent.length;
  return min / 60;
}
const roundHalf = (h: number) => Math.round(h * 2) / 2;
/** Hours per TSS point from the athlete's own history; ~55 TSS/h (endurance pace) when there's no data. */
function hoursPerTss(summaries: Array<Record<string,unknown>>, discipline: string): number {
  const recent = summaries.slice(0, 8);
  const tss = recent.length ? recent.reduce((s, r) => s + ((r.tss as number) ?? 0), 0) / recent.length : 0;
  const h = avgWeeklyHours(summaries, discipline);
  const ratio = tss > 0 && h > 0 ? h / tss : 1 / 55;
  return Math.min(1 / 30, Math.max(1 / 90, ratio));            // clamp to a sane 30–90 TSS/h
}
/** ATPs generated before hours existed: estimate targetWeeklyHours from targetWeeklyTSS. */
function fillPhaseHours(phases: Array<Record<string, unknown>>, summaries: Array<Record<string,unknown>>, discipline: string) {
  const ratio = hoursPerTss(summaries, discipline);
  return phases.map(p => {
    if (Number(p.targetWeeklyHours) > 0) return p;
    const tss = Number(p.targetWeeklyTSS);
    return tss > 0 ? { ...p, targetWeeklyHours: roundHalf(tss * ratio), hoursEstimated: true } : p;
  });
}

const DISCIPLINE_WORKOUTS: Record<string, string> = {
  triathlon: 'Pływanie techniczne, długa jazda Z2, bieg LSR, brick (rower+bieg)',
  run:  'LSR (długi bieg Z2), tempo/próg, interwały (400m–1600m), bieg górski, strides',
  bike: 'Długa jazda Z2 (3–5h), sweet spot 88–93% FTP, interwały FTP 2×20min, sprinty, siodło',
  swim: 'Dryle techniczne (high-elbow, catch-up), wytrzymałość ciągła, interwały 400m/200m, długa seria 1500m+',
};

/* Season input sent by the client: races + the deterministic phase skeleton from
   @tricoach/core buildSeasonSkeleton. The AI fills phase content only — never dates. */
type PhaseType = 'base' | 'build' | 'peak' | 'race' | 'recovery' | 'transition';
interface SeasonRaceIn  { date: string; priority: 'A' | 'B' | 'C'; distance: string; label?: string; name?: string; discipline?: string }
interface SeasonPhaseIn {
  name: string; type: PhaseType; startDate: string; endDate: string; weeks: number; races: SeasonRaceIn[];
  /** Weekly hours computed by the client (planSeasonHours in packages/core) — deterministic, not AI. */
  targetWeeklyHours: number;
  /** Hours for each week of the phase (deload/taper included), from planSeasonLoad. */
  weeklyHours: number[];
  targetWeeklyTSS: number;
}

const PHASE_TYPES = new Set<PhaseType>(['base', 'build', 'peak', 'race', 'recovery', 'transition']);
const ISO_DATE    = /^\d{4}-\d{2}-\d{2}$/;
const shortStr    = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';

function parseRace(r: unknown): SeasonRaceIn | null {
  const o = r as Record<string, unknown>;
  if (!o || !ISO_DATE.test(String(o.date)) || !['A', 'B', 'C'].includes(String(o.priority))) return null;
  const distance = shortStr(o.distance, 30);
  if (!distance) return null;
  return { date: String(o.date), priority: o.priority as 'A' | 'B' | 'C', distance,
           label: shortStr(o.label, 40) || distance, name: shortStr(o.name, 60) || undefined,
           discipline: shortStr(o.discipline, 20) || undefined };
}

function parseSeason(body: Record<string, unknown>): { races: SeasonRaceIn[]; phases: SeasonPhaseIn[] } | string {
  if (!Array.isArray(body.races) || !Array.isArray(body.phases)) return 'races and phases required';
  if (body.races.length < 1 || body.races.length > 20) return 'Od 1 do 20 startów.';
  if (body.phases.length < 1 || body.phases.length > 60) return 'Nieprawidłowa struktura sezonu.';
  const races = body.races.map(parseRace);
  if (races.some(r => !r)) return 'Nieprawidłowe dane startu.';
  if (!races.some(r => r!.priority === 'A')) return 'Wymagany co najmniej jeden start A.';
  const phases: SeasonPhaseIn[] = [];
  for (const raw of body.phases as Array<Record<string, unknown>>) {
    const weeks = Number(raw?.weeks);
    if (!raw || !PHASE_TYPES.has(raw.type as PhaseType) || !ISO_DATE.test(String(raw.startDate)) ||
        !ISO_DATE.test(String(raw.endDate)) || !Number.isInteger(weeks) || weeks < 1 || weeks > 60)
      return 'Nieprawidłowa faza w strukturze sezonu.';
    phases.push({
      name: shortStr(raw.name, 60) || String(raw.type), type: raw.type as PhaseType,
      startDate: String(raw.startDate), endDate: String(raw.endDate), weeks,
      races: Array.isArray(raw.races) ? raw.races.map(parseRace).filter((r): r is SeasonRaceIn => !!r) : [],
      targetWeeklyHours: Number(raw.targetWeeklyHours) > 0 && Number(raw.targetWeeklyHours) < 40 ? roundHalf(Number(raw.targetWeeklyHours)) : 0,
      weeklyHours: Array.isArray(raw.weeklyHours) && raw.weeklyHours.length === weeks
        && raw.weeklyHours.every(h => Number(h) >= 0 && Number(h) < 40)
        ? raw.weeklyHours.map(h => roundHalf(Number(h))) : [],
      targetWeeklyTSS: 0,
    });
  }
  return { races: races as SeasonRaceIn[], phases };
}

/** TSS per hour relative to the athlete's average, by phase (more intensity in build/peak). */
const TSS_FACTOR: Record<PhaseType, number> = { base: 0.95, build: 1.05, peak: 1.1, race: 1.15, recovery: 0.8, transition: 0.75 };

/** Fills targetWeeklyTSS from the phase hours and the athlete's own TSS/h (fallback: flat current hours). */
function applySeasonLoad(phases: SeasonPhaseIn[], summaries: Array<Record<string,unknown>>, discipline: string): SeasonPhaseIn[] {
  const perHour = 1 / hoursPerTss(summaries, discipline);
  const fallback = roundHalf(avgWeeklyHours(summaries, discipline)) || 5;
  return phases.map(p => {
    const h = p.targetWeeklyHours || fallback;
    return { ...p, targetWeeklyHours: h, weeklyHours: p.weeklyHours.length ? p.weeklyHours : new Array(p.weeks).fill(h), targetWeeklyTSS: Math.round(h * perHour * TSS_FACTOR[p.type] / 5) * 5 };
  });
}

const DEFAULT_INTENSITY: Record<PhaseType, 'low' | 'moderate' | 'high'> = {
  base: 'low', build: 'moderate', peak: 'high', race: 'high', recovery: 'low', transition: 'low',
};

function raceLine(r: SeasonRaceIn, planDiscipline: string): string {
  const disc = r.discipline && r.discipline !== planDiscipline ? ` [${DISCIPLINE_LABELS[r.discipline] ?? r.discipline} — inna dyscyplina]` : '';
  return `${r.date} · ${r.priority} · ${r.label}${disc}${r.name ? ` · „${r.name}”` : ''}`;
}

function buildATPPrompt(
  summaries: Array<Record<string,unknown>>,
  discipline: string,
  races: SeasonRaceIn[],
  phases: SeasonPhaseIn[],
  profile: { weight?: number; ftp?: number },
): string {
  const pmc    = calcPMC(summaries);
  const form   = pmc.tsb > 5 ? 'wypoczęty' : pmc.tsb > -10 ? 'optymalny' : 'zmęczony';
  const recent = summaries.slice(0, 8);                         // summaries are newest-first
  const avg    = (k: string) => recent.length ? recent.reduce((s,r)=>s+((r[k] as number)??0),0)/recent.length : 0;
  const avgTSS = Math.round(avg('tss'));
  const avgHours = Math.round(avgWeeklyHours(summaries, discipline) * 10) / 10;

  const discLabel    = DISCIPLINE_LABELS[discipline] ?? discipline;
  const discWorkouts = DISCIPLINE_WORKOUTS[discipline] ?? DISCIPLINE_WORKOUTS.triathlon;
  const totalWeeks   = phases.reduce((s, p) => s + p.weeks, 0);

  const phaseLines = phases.map((p, i) =>
    `${i} · ${p.name} · ${p.type} · ${p.startDate} – ${p.endDate} · ${p.weeks} tyg. · ${p.targetWeeklyHours} h/tydz.${p.weeklyHours.length > 1 ? ` (kolejne tyg.: ${p.weeklyHours.join('/')} h)` : ''} · TSS ${p.targetWeeklyTSS}/tydz.` +
    (p.races.length ? ` · starty: ${p.races.map(r => `${r.priority} ${r.date} ${r.label}${r.discipline && r.discipline !== discipline ? ` (${DISCIPLINE_LABELS[r.discipline] ?? r.discipline})` : ''}`).join(', ')}` : ''),
  ).join('\n');

  return `Jesteś ekspertem w periodyzacji sportowej. Uzupełnij Annual Training Plan (ATP) na cały sezon.

DYSCYPLINA: ${discLabel}
${discipline !== 'triathlon' ? `Plan skupia się WYŁĄCZNIE na ${discLabel.toLowerCase()}. Kluczowe treningi: ${discWorkouts}` : `Plan triathlonowy — wszystkie 3 dyscypliny. Kluczowe treningi: ${discWorkouts}`}

PROFIL ZAWODNIKA:
- Dzisiaj: ${new Date().toISOString().split('T')[0]}
- CTL (forma): ${pmc.ctl} | ATL (zmęczenie): ${pmc.atl} | Form (TSB): ${pmc.tsb > 0?'+':''}${pmc.tsb} (${form})
- Śr. TSS/tydzień (8 tyg.): ${avgTSS}
- Śr. czas treningu/tydzień (8 tyg.): ${avgHours ? `${avgHours} h` : 'brak danych'}
${discipline === 'triathlon' || discipline === 'swim' ? `- Pływanie: ${avg('swim_dist_km').toFixed(1)} km/tyg` : ''}
${discipline === 'triathlon' || discipline === 'bike' ? `- Rower: ${avg('bike_dist_km').toFixed(1)} km/tyg` : ''}
${discipline === 'triathlon' || discipline === 'run'  ? `- Bieg: ${avg('run_dist_km').toFixed(1)} km/tyg` : ''}
${profile.ftp ? `- FTP: ${profile.ftp} W` : ''}
${profile.weight ? `- Waga: ${profile.weight} kg` : ''}

STARTY W SEZONIE (data · priorytet · dystans · nazwa):
${races.map(r => raceLine(r, discipline)).join('\n')}

Priorytety startów:
- A — główny cel; fazy przed nim (szczyt/tapering) są już zaplanowane.
- B — ważny start pośredni: mini-tapering 3–5 dni przed, 2–3 lżejsze dni po. Nie przerywa fazy — uwzględnij go w kluczowych treningach tej fazy.
- C — start treningowy: bez taperingu, potraktuj jako mocny trening w tygodniu.
- Start z innej dyscypliny niż plan (oznaczony „inna dyscyplina”, np. maraton w planie triathlonowym): wpleć go w fazę — przed nim przesuń akcent na tę dyscyplinę, po nim zaplanuj regenerację adekwatną do dystansu (po maratonie 1–2 tyg. bez intensywnego biegania), a pozostałe dyscypliny utrzymuj lekko.

STRUKTURA SEZONU I OBCIĄŻENIE — USTALONE (${totalWeeks} tyg.). Nie zmieniaj nazw, kolejności, typów, dat ani godzin/TSS faz.
Punkt startowy objętości: ${phases[0]?.targetWeeklyHours ?? '?'} h/tydz. (wybrany przez zawodnika lub jego obecna średnia).
Indeks · nazwa · typ · daty · długość · godziny i TSS tygodniowo · starty w fazie:
${phaseLines}

Dla KAŻDEJ fazy (dokładnie ${phases.length} elementów, po jednym na indeks 0–${phases.length - 1}) podaj:
- focus: jedno zdanie po polsku — cel fazy (dopasowany do podanej objętości),
- intensity: "low" | "moderate" | "high",
- keyWorkouts: 2–4 konkretne kluczowe treningi po polsku; jeśli w fazie jest start B lub C, jeden punkt opisuje, jak go rozegrać.

Odpowiedz TYLKO tym JSON (bez markdown):
{
  "assessment": "2–3 zdania po polsku: ocena zawodnika i strategia na sezon z uwzględnieniem wszystkich startów",
  "phases": [
    { "i": 0, "focus": "…", "intensity": "low", "keyWorkouts": ["…", "…"] }
  ]
}`;
}

/* ── Main prompt ── */
/* ── ATP context for the weekly plan ──
   The weekly plan follows the user's saved season plan (ATP) when its discipline matches. */
interface AtpRace { date: string; priority: 'A' | 'B' | 'C'; label?: string; name?: string; distance?: string; discipline?: string }
interface AtpWeek {
  weekStart: string;
  phase: { name: string; type: PhaseType; weekInPhase: number; phaseWeeks: number; focus: string;
           targetWeeklyTSS: number; targetWeeklyHours: number; hoursEstimated: boolean;
           intensity: string; keyWorkouts: string[] } | null;
  /** Total training hours for this week: the ATP's per-week hours (older ATPs: phase hours, −35% in a deload week). */
  targetHours: number;
  deload: boolean;
  races: AtpRace[];
}
interface AtpContext {
  discipline: string;
  weeks: AtpWeek[];
  nextA: { date: string; title: string; weeksAway: number; distance?: string } | null;
}

const DAY_MS = 24 * 3600 * 1000;
/** Last week of a base/build block of 3+ weeks is a deload week. */
const isDeload = (type: PhaseType, weekInPhase: number, phaseWeeks: number) =>
  (type === 'base' || type === 'build') && phaseWeeks >= 3 && weekInPhase === phaseWeeks;
const isoAddDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const raceTitle  = (r: AtpRace) => r.name || r.label || r.distance || 'start';

async function loadAtpContext(userId: string, sport: string, weekStart: string): Promise<AtpContext | null> {
  const { data } = await supabase.from('training_plans').select('plan_json')
    .eq('user_id', userId).eq('sport_type', 'atp').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const pj = data?.plan_json as { discipline?: string; phases?: Array<Record<string, unknown>>; races?: AtpRace[] } | undefined;
  if (!pj?.phases?.length) return null;
  const discipline = pj.discipline ?? 'triathlon';             // legacy ATPs were triathlon-only
  if (discipline !== sport) return null;
  const phases = pj.phases.some(p => !(Number(p.targetWeeklyHours) > 0))
    ? fillPhaseHours(pj.phases, (await supabase.from('weekly_summaries').select('*').eq('user_id', userId)
        .order('week_start', { ascending: false }).limit(8)).data ?? [], discipline)
    : pj.phases;

  const races = (pj.races ?? []).filter(r => r?.date && ISO_DATE.test(r.date));
  const weeks: AtpWeek[] = [0, 1].map(k => {
    const ws = isoAddDays(weekStart, 7 * k), we = isoAddDays(ws, 6);
    const p  = phases.find(ph => ws >= String(ph.startDate) && ws <= String(ph.endDate));
    const type = (p && PHASE_TYPES.has(p.type as PhaseType) ? p.type : 'base') as PhaseType;
    const weekInPhase = p ? Math.floor((Date.parse(ws) - Date.parse(String(p.startDate))) / (7 * DAY_MS)) + 1 : 0;
    const phaseWeeks  = p ? Number(p.weeks) || 1 : 0;
    const hours = p ? Number(p.targetWeeklyHours) || 0 : 0;
    const perWeek = p && Array.isArray(p.weeklyHours) ? Number((p.weeklyHours as unknown[])[weekInPhase - 1]) || 0 : 0;
    const deload = perWeek
      ? (type === 'base' || type === 'build') && perWeek < hours * 0.8
      : isDeload(type, weekInPhase, phaseWeeks);
    return {
      weekStart: ws,
      races: races.filter(r => r.date >= ws && r.date <= we),
      deload,
      targetHours: perWeek || (hours ? roundHalf(deload ? hours * 0.65 : hours) : 0),
      phase: p ? {
        name: String(p.name ?? ''), type, weekInPhase, phaseWeeks,
        focus: String(p.focus ?? ''), targetWeeklyTSS: Number(p.targetWeeklyTSS) || 0,
        targetWeeklyHours: hours, hoursEstimated: !!p.hoursEstimated,
        intensity: String(p.intensity ?? ''),
        keyWorkouts: Array.isArray(p.keyWorkouts) ? (p.keyWorkouts as unknown[]).map(String).slice(0, 5) : [],
      } : null,
    };
  });
  if (!weeks.some(w => w.phase)) return null;                  // ATP doesn't cover these weeks (outdated)

  const a = races.filter(r => r.priority === 'A' && r.date >= weekStart).sort((x, y) => x.date.localeCompare(y.date))[0];
  return {
    discipline, weeks,
    nextA: a ? { date: a.date, title: raceTitle(a), distance: a.distance, weeksAway: Math.round((Date.parse(a.date) - Date.parse(weekStart)) / (7 * DAY_MS)) } : null,
  };
}

const DAY_NAMES = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
const INTENSITY_PL: Record<string, string> = { low: 'niska', moderate: 'umiarkowana', high: 'wysoka' };

function atpPromptBlock(ctx: AtpContext): string {
  const weekLine = (w: AtpWeek, idx: number) => {
    const head = `TYDZIEŃ ${idx + 1} (od ${w.weekStart}):`;
    if (!w.phase) return `${head} poza zakresem ATP — kontynuuj logicznie poprzedni tydzień.`;
    const p = w.phase;
    const deload = w.deload;
    const lines = [
      `${head} faza „${p.name}” (${p.type}), tydzień ${p.weekInPhase}/${p.phaseWeeks}, intensywność ${INTENSITY_PL[p.intensity] ?? p.intensity}` +
        (p.targetWeeklyTSS ? `, średni tygodniowy TSS fazy ≈ ${p.targetWeeklyTSS}` : ''),
      w.targetHours ? `  ŁĄCZNY CZAS TEGO TYGODNIA: ${w.targetHours} h (±10%, suma pól "minutes")${deload ? ' — już obniżony na odciążenie' : ''}` : '',
      p.focus ? `  Fokus fazy: ${p.focus}` : '',
      p.keyWorkouts.length ? `  Kluczowe treningi fazy: ${p.keyWorkouts.join('; ')}` : '',
      deload ? '  To ostatni tydzień bloku → TYDZIEŃ ODCIĄŻENIOWY: TSS −30–40% względem średniej fazy, bez ciężkich akcentów.' : '',
      ...w.races.map(r => {
        const day = DAY_NAMES[Math.round((Date.parse(r.date) - Date.parse(w.weekStart)) / DAY_MS)] ?? '';
        const off = r.discipline && r.discipline !== ctx.discipline ? `, ${DISCIPLINE_LABELS[r.discipline] ?? r.discipline}` : '';
        return `  START ${r.priority}: ${raceTitle(r)} (${r.label ?? r.distance ?? ''}${off}) — ${day} ${r.date}`;
      }),
    ];
    return lines.filter(Boolean).join('\n');
  };

  return `
KONTEKST Z PLANU ROCZNEGO (ATP) — plan MUSI być z nim spójny:
${ctx.nextA ? `Najbliższy start A: ${ctx.nextA.title}, ${ctx.nextA.date} (za ${ctx.nextA.weeksAway} tyg.)` : 'Brak kolejnego startu A w ATP.'}
${ctx.weeks.map(weekLine).join('\n')}

ZASADY ATP (mają pierwszeństwo przed ogólnymi regułami poniżej):
- Łączny czas tygodnia = „ŁĄCZNY CZAS TEGO TYGODNIA” (±10%), jeśli podany — to twardy cel objętości. W tygodniu startu A/B czas może być niższy (tapering).
- Łączne obciążenie tygodnia ≈ średni TSS fazy z ATP (±10%), chyba że to tydzień odciążeniowy lub startowy; progresja między tygodniami wynika z ATP, nie z reguły „+5–10%”.
- Intensywność fazy: niska → głównie Z1–Z2, max 1 akcent/tydz.; umiarkowana → 2 akcenty (próg/tempo, sweet spot); wysoka → jakość wyścigowa, krótsza objętość.
- Wpleć kluczowe treningi fazy w tydzień (nie wszystkie muszą wystąpić co tydzień).
- Start w tygodniu: wpisz go jako sesję w dniu startu (label „START <priorytet>: nazwa”, type wg dyscypliny startu), dzień przed — odpoczynek lub krótki rozruch, dzień po — regeneracja.
  A: cały tydzień to tapering (objętość −40–60%, krótkie akcenty w tempie startowym). B: mini-tapering 3–4 dni przed. C: bez taperingu, start zastępuje akcent tygodnia.
- Faza regeneracji/roztrenowania: tylko lekkie sesje, dużo swobody, bez interwałów.
- W „assessment” nazwij fazę ATP i powiedz, jak te 2 tygodnie realizują jej cel.`;
}

/* ── Triathlon time split ──
   Targets = share of training TIME per discipline for the A-race distance
   (same numbers as RACE_TARGETS in packages/core/src/targets.ts). */
const TRI_TARGETS: Record<string, { swim: number; bike: number; run: number; label: string; minBike: number }> = {
  sprint:  { swim: 15, bike: 45, run: 40, label: 'Sprint',       minBike: 2 },
  olympic: { swim: 18, bike: 42, run: 40, label: 'Olympic',      minBike: 2 },
  half:    { swim: 20, bike: 45, run: 35, label: 'Half Ironman', minBike: 3 },
  full:    { swim: 18, bike: 50, run: 32, label: 'Full Ironman', minBike: 3 },
};

function triSplitBlock(summaries: Array<Record<string,unknown>>, atp: AtpContext | null, trainingDays: number): string {
  const distance = atp?.nextA?.distance && TRI_TARGETS[atp.nextA.distance] ? atp.nextA.distance : 'half';
  const t = TRI_TARGETS[distance];
  const last4 = summaries.slice(0, 4);                          // newest-first
  const sum = (k: string) => last4.reduce((a, r) => a + ((r[k] as number) ?? 0), 0);
  const swim = sum('swim_time_min'), bike = sum('bike_time_min'), run = sum('run_time_min');
  const total = swim + bike + run;
  const pct = (v: number) => total ? Math.round(v / total * 100) : 0;
  const cur = { swim: pct(swim), bike: pct(bike), run: pct(run) };
  const gaps = (['swim', 'bike', 'run'] as const)
    .map(k => ({ k, gap: t[k] - cur[k] }))
    .filter(g => total && Math.abs(g.gap) >= 5);
  const names = { swim: 'pływanie', bike: 'rower', run: 'bieg' };
  const minBike = trainingDays >= 5 ? t.minBike : Math.min(2, t.minBike);

  // Per-discipline hours for each ATP week: shares move ≤5 pp/week from the current split toward the target.
  const keys = ['swim', 'bike', 'run'] as const;
  const shift = (from: Record<string, number>) => {
    const next = Object.fromEntries(keys.map(k => [k, from[k] + Math.max(-5, Math.min(5, t[k] - from[k]))]));
    const sum = keys.reduce((a, k) => a + next[k], 0);
    return Object.fromEntries(keys.map(k => [k, next[k] / sum * 100]));
  };
  const tShare: Record<string, number> = { swim: t.swim, bike: t.bike, run: t.run };
  const share1 = total ? shift(cur) : tShare;
  const share2 = total ? shift(share1) : tShare;
  const hoursLine = (w: AtpWeek | undefined, share: Record<string, number>, n: number) => {
    if (!w?.targetHours) return '';
    const h = (k: typeof keys[number]) => roundHalf(w.targetHours * share[k] / 100);
    return `- Tydzień ${n}: ${w.targetHours} h → pływanie ≈ ${h('swim')} h · rower ≈ ${h('bike')} h · bieg ≈ ${h('run')} h.`;
  };
  const hoursLines = [hoursLine(atp?.weeks[0], share1, 1), hoursLine(atp?.weeks[1], share2, 2)].filter(Boolean).join('\n');

  return `
PROPORCJE CZASU TRENINGU (cel dla ${atp?.nextA ? `startu A: ${t.label}` : `domyślnie ${t.label} — brak startu A w ATP`}):
- Cel: pływanie ${t.swim}% · rower ${t.bike}% · bieg ${t.run}% łącznego czasu tygodnia.
- Ostatnie 4 tyg.: ${total ? `pływanie ${cur.swim}% · rower ${cur.bike}% · bieg ${cur.run}% (${Math.round(total / 4 / 60 * 10) / 10} h/tydz.)` : 'brak danych'}.
${gaps.length ? gaps.map(g => `- ${names[g.k]}: ${g.gap > 0 ? `poniżej celu o ${g.gap} pp → zwiększaj` : `powyżej celu o ${-g.gap} pp → zmniejszaj`} udział stopniowo (ok. 5 pp na tydzień), nie zwiększając łącznego obciążenia ponad ATP.`).join('\n') : '- Proporcje bliskie celu — utrzymaj je.'}
${hoursLines ? `CZAS NA DYSCYPLINY (z godzin ATP i docelowych proporcji):\n${hoursLines}\n` : ''}- Rower: min. ${minBike} sesje/tydzień${minBike >= 3 ? ', w tym długa jazda Z2 w weekend' : ''}; brick (rower + krótki bieg) liczy się jako sesja rowerowa.
- Licz proporcje z pola "minutes": ${gaps.length ? 'tydzień 1 przesuwa udziały o ok. 5 pp w stronę celu, tydzień 2 o kolejne ~5 pp' : 'oba tygodnie w granicach ±5 pp od celu'} (nie dotyczy tygodnia ze startem lub taperingiem).`;
}

function buildPrompt(
  summaries: Array<Record<string,unknown>>,
  recentActs: Array<Record<string,unknown>>,
  trainingDays: number,
  weekStart: string,
  sport: Exclude<SportType,'atp'>,
  hrZones: Array<{min:number;max:number}> | null,
  profile: { weight?: number; ftp?: number } = {},
  atp: AtpContext | null = null,
): string {
  const recent = summaries.slice(0, 8);                         // summaries are newest-first
  const avg = (k: string) => recent.length ? recent.reduce((s,r)=>s+((r[k] as number)??0),0)/recent.length : 0;

  const pmc     = calcPMC(summaries);
  const form    = pmc.tsb > 5 ? 'wypoczęty' : pmc.tsb > -10 ? 'optymalny' : 'zmęczony';
  const level   = (() => {
    if (sport === 'triathlon') {                                // all three disciplines, by weekly hours
      const hours = (avg('swim_time_min') + avg('bike_time_min') + avg('run_time_min')) / 60;
      return hours < 5 ? 'początkujący' : hours < 9 ? 'średniozaawansowany' : 'zaawansowany';
    }
    const run = avg('run_dist_km'), bike = avg('bike_dist_km'), swim = avg('swim_dist_km');
    const primary = sport==='run'?run : sport==='bike'?bike : sport==='swim'?swim*10 : run;
    const th = sport==='swim' ? [30,80] : sport==='bike' ? [60,120] : [15,30];
    return primary < th[0] ? 'początkujący' : primary < th[1] ? 'średniozaawansowany' : 'zaawansowany';
  })();

  const analysis = {
    run:  analyzeActivities(recentActs, 'run'),
    bike: analyzeActivities(recentActs, 'bike'),
    swim: analyzeActivities(recentActs, 'swim'),
  };

  const w2s = new Date(weekStart); w2s.setDate(w2s.getDate()+7);
  const days7 = (start: string) => Array.from({length:7},(_,i)=>`${['Pon','Wt','Śr','Czw','Pt','Sob','Nd'][i]} ${formatDate(start,i)}`).join(', ');

  return `Jesteś doświadczonym trenerem sportowym. Wygeneruj precyzyjny 2-tygodniowy plan treningowy.

PROFIL ZAWODNIKA (poziom: ${level}, dyscyplina: ${SPORT_LABELS[sport]}):
- CTL (forma bazowa): ${pmc.ctl} | ATL (zmęczenie): ${pmc.atl} | Form: ${pmc.tsb > 0?'+':''}${pmc.tsb} (${form})
- Śr. tyg. TSS ostatnie 8 tyg.: ${Math.round(avg('tss'))}
${sport==='triathlon'||sport==='swim'?`- Pływanie: ${avg('swim_dist_km').toFixed(1)} km/tyg`:''}
${sport==='triathlon'||sport==='bike'?`- Rower: ${avg('bike_dist_km').toFixed(1)} km/tyg`:''}
${sport==='triathlon'||sport==='run'?`- Bieg: ${avg('run_dist_km').toFixed(1)} km/tyg`:''}
${profile.weight?`- Waga: ${profile.weight} kg`:''}
${profile.ftp?`- FTP: ${profile.ftp} W`:''}
${hrZoneContext(hrZones)}
- Dni treningowe: ${trainingDays}/tydzień
${sportContext(sport, analysis)}
${sport === 'triathlon' ? triSplitBlock(summaries, atp, trainingDays) : ''}
${atp ? atpPromptBlock(atp) : ''}

TYDZIEŃ 1: ${days7(weekStart)}
TYDZIEŃ 2: ${days7(w2s.toISOString().split('T')[0])}

SCHEMAT JSON (odpowiedz TYLKO tym JSON, bez markdown):
{
  "assessment": "2-3 zdania: ocena zawodnika, aktualny Form i priorytet na 2 tygodnie${atp ? ' (z nazwą fazy ATP)' : ''}",
  "week1": [
    {
      "day": "Pon",
      "date": "${formatDate(weekStart,0)}",
      "sessions": [
        {"type":"rest","label":"Odpoczynek","distance":"—","duration":"—","minutes":0,"description":""}
      ]
    },
    {
      "day": "Wt",
      "date": "${formatDate(weekStart,1)}",
      "sessions": [
        {"type":"swim","label":"Pływanie techniczne","distance":"2.0km","duration":"50min","minutes":50,"description":"Dryle high-elbow + 4x400m w tempie wyścigowym"},
        {"type":"run","label":"Bieg łatwy","distance":"6km","duration":"35min","minutes":35,"description":"Z2, tuż po pływaniu — przyzwyczajenie nóg"}
      ]
    },
    {
      "day": "Śr",
      "date": "${formatDate(weekStart,2)}",
      "sessions": [
        {"type":"bike","label":"Rower sweet spot","distance":"40km","duration":"1h30min","minutes":90,"description":"3x12 min 88–93% FTP, przerwy 5 min Z1"}
      ]
    }
  ],
  "week2": [takie same 7 dni jak week1]
}

REGUŁY:
- Każda sesja (poza rest) ma "minutes" — czas trwania w minutach jako liczba, zgodny z "duration"
- Dokładnie ${trainingDays} dni z co najmniej 1 sesją, reszta = rest (sessions z type=rest)
${atp ? '- Obciążenie tygodni zgodnie z ATP (patrz ZASADY ATP)' : '- Tydzień 2 trudniejszy o 5-10% od tygodnia 1'}
- Nie 2 ciężkie dni pod rząd
- MOŻESZ planować 2-3 sesje w jednym dniu (rano + wieczór) jeśli zawodnik tego potrzebuje
  Typowe kombinacje: swim+run, swim+bike, bike+run (brick), lekki bieg+siłownia
  Przy double day: pierwsza sesja intensywna, druga lekka/regeneracyjna
- Dla zaawansowanych: więcej double days, dla początkujących: max 1 sesja/dzień
- Długa/ciężka sesja w sob lub nd
- Form=${form}: ${pmc.tsb < -10 ? 'uwzględnij więcej regeneracji' : pmc.tsb > 5 ? 'możesz zwiększyć obciążenie' : 'utrzymaj obecny poziom'}
- Odpowiedz TYLKO JSON.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {

  if (req.method === 'GET') {
    const jwt2 = (req.headers.authorization ?? '').replace('Bearer ', '');
    const { data: { user: u2 }, error: e2 } = await supabase.auth.getUser(jwt2);
    if (e2 || !u2) return res.status(401).json({ error: 'Unauthorized' });
    const sport2 = (req.query.sport as SportType) ?? 'triathlon';
    const { data } = await supabase.from('training_plans').select('*').eq('user_id', u2.id).eq('sport_type', sport2).order('created_at', { ascending:false }).limit(1).maybeSingle();
    const { data: smr } = await supabase.from('weekly_summaries').select('swim_sessions,bike_sessions,run_sessions').eq('user_id', u2.id).order('week_start',{ascending:false}).limit(4);
    const avgS = smr?.length ? smr.reduce((s,r)=>s+(r.swim_sessions??0)+(r.bike_sessions??0)+(r.run_sessions??0),0)/smr.length : 5;
    const atpContext = sport2 === 'atp' ? null : await loadAtpContext(u2.id, sport2, nextMonday());
    // ATPs saved before weekly hours existed: estimate them from TSS and the athlete's own hours/TSS ratio.
    const pj = data?.plan_json as { discipline?: string; phases?: Array<Record<string, unknown>> } | undefined;
    if (sport2 === 'atp' && pj?.phases?.some(p => !(Number(p.targetWeeklyHours) > 0))) {
      const { data: hist } = await supabase.from('weekly_summaries').select('*').eq('user_id', u2.id).order('week_start', { ascending:false }).limit(8);
      pj.phases = fillPhaseHours(pj.phases, hist ?? [], pj.discipline ?? 'triathlon');
    }
    return res.json({ plan: data ?? null, suggestedDays: Math.max(3,Math.min(6,Math.round(avgS))), atpContext });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body as { trainingDays?: number; sport?: SportType };
  const sport = body.sport ?? 'triathlon';

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  const { data: summaries = [] } = await supabase.from('weekly_summaries').select('*').eq('user_id', user.id).order('week_start',{ascending:false}).limit(12);

  let profile: { weight?: number; ftp?: number } = {};
  let hrZones: Array<{min:number;max:number}> | null = null;
  let recentActs: Array<Record<string,unknown>> = [];

  if (tokenRow?.access_token) {
    const headers = { Authorization: `Bearer ${tokenRow.access_token}` };
    const fourWeeksAgo = Math.floor((Date.now() - 28*24*60*60*1000) / 1000);
    const [athleteRes, zonesRes, actsRes] = await Promise.all([
      fetch('https://www.strava.com/api/v3/athlete', { headers }).then(r=>r.ok?r.json():{}),
      fetch('https://www.strava.com/api/v3/athlete/zones', { headers }).then(r=>r.ok?r.json():{}),
      fetch(`https://www.strava.com/api/v3/athlete/activities?after=${fourWeeksAgo}&per_page=100`, { headers }).then(r=>r.ok?r.json():[]),
    ]);
    const a = athleteRes as { weight?: number; ftp?: number };
    if (a.weight) profile.weight = Math.round(a.weight);
    if (a.ftp)    profile.ftp    = a.ftp;
    const z = zonesRes as { heart_rate?: { zones?: Array<{min:number;max:number}> } };
    if (z?.heart_rate?.zones) hrZones = z.heart_rate.zones;
    recentActs = Array.isArray(actsRes) ? actsRes as Array<Record<string,unknown>> : [];
  }

  /* ── ATP path ── */
  if (sport === 'atp') {
    const discipline = shortStr((body as Record<string, unknown>).discipline, 20) || 'triathlon';
    const season = parseSeason(body as Record<string, unknown>);
    if (typeof season === 'string') return res.status(400).json({ error: season });
    const { races } = season;
    const phases = applySeasonLoad(season.phases, summaries ?? [], discipline);

    const prompt = buildATPPrompt(summaries ?? [], discipline, races, phases, profile);
    let msg: Anthropic.Message;
    try {
      msg = await anthropic.messages.create({
        model: MODEL, max_tokens: 8000, thinking: NO_THINKING,
        system: 'You are a JSON generator. Respond with ONLY valid JSON, no markdown, no code blocks. Start with { end with }.',
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (e) { return aiError(res, e); }
    const rawAtp = textOf(msg);
    let ai: { assessment?: unknown; phases?: Array<Record<string, unknown>> };
    try {
      let c = rawAtp.replace(/^```json?\s*/im,'').replace(/```\s*$/im,'').trim();
      const f = c.indexOf('{'), l = c.lastIndexOf('}');
      if (f !== -1 && l > f) c = c.slice(f, l+1);
      ai = JSON.parse(c);
    } catch { return res.status(502).json({ error: 'AI returned invalid JSON' }); }

    // Merge AI content into the fixed skeleton — dates and structure always come from the client skeleton.
    const byIndex = new Map((Array.isArray(ai.phases) ? ai.phases : []).map((p, idx) => [Number.isInteger(p?.i) ? Number(p.i) : idx, p]));
    const mergedPhases = phases.map((p, i) => {
      const a = byIndex.get(i) ?? {};
      return {
        ...p,
        focus: shortStr(a.focus, 300),
        intensity: ['low', 'moderate', 'high'].includes(String(a.intensity)) ? a.intensity : DEFAULT_INTENSITY[p.type],
        keyWorkouts: Array.isArray(a.keyWorkouts) ? a.keyWorkouts.map(w => shortStr(w, 200)).filter(Boolean).slice(0, 5) : [],
      };
    });
    const mainRace = races.filter(r => r.priority === 'A').sort((x, y) => x.date.localeCompare(y.date))[0];
    const atpJson = {
      assessment: shortStr(ai.assessment, 1000),
      discipline,
      races: [...races].sort((x, y) => x.date.localeCompare(y.date)),
      phases: mergedPhases,
      startHours: phases[0]?.targetWeeklyHours ?? null,
      raceDate: mainRace.date,     // legacy fields, kept for older readers
      raceType: mainRace.distance,
    };

    const { data: saved, error: saveErr } = await supabase.from('training_plans')
      .upsert({ user_id:user.id, training_days_per_week:0, suggested_days:0, plan_json:atpJson, week_start:nextMonday(), sport_type:'atp' }, { onConflict:'user_id,week_start,sport_type' })
      .select().single();
    if (saveErr) return res.status(500).json({ error: saveErr.message });
    const { input_tokens, output_tokens } = msg.usage;
    return res.json({ plan: saved, usage: { inputTokens:input_tokens, outputTokens:output_tokens, costUsd:costUsd(msg.usage) } });
  }

  /* ── Weekly plan path ── */
  const trainingDays = body.trainingDays ?? 5;
  if (trainingDays < 2 || trainingDays > 7)
    return res.status(400).json({ error: 'trainingDays must be 2–7' });

  const weekStart     = nextMonday();
  const atpContext    = await loadAtpContext(user.id, sport, weekStart);
  const prompt        = buildPrompt(summaries ?? [], recentActs, trainingDays, weekStart, sport as Exclude<SportType,'atp'>, hrZones, profile, atpContext);
  const avgSessions   = (summaries ?? []).slice(0,4).reduce((s,r)=>s+((r.swim_sessions as number)??0)+((r.bike_sessions as number)??0)+((r.run_sessions as number)??0),0) / Math.max(1, Math.min((summaries??[]).length,4));
  const suggestedDays = Math.max(3, Math.min(6, Math.round(avgSessions)));

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 6000,
      thinking:   NO_THINKING,
      system:     'You are a JSON generator. Respond with ONLY valid JSON, no markdown, no explanation, no code blocks. Start your response with { and end with }.',
      messages:   [{ role: 'user', content: prompt }],
    });
  } catch (e) { return aiError(res, e); }

  const raw = textOf(message);

  // Aggressively extract JSON: find first { and last }
  let planJson: Record<string,unknown>;
  try {
    let cleaned = raw
      .replace(/^```json?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace  = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    planJson = JSON.parse(cleaned);
    if (atpContext) planJson.atpContext = atpContext;            // which ATP phase this plan was built for
  } catch {
    // Log first 500 chars for debugging
    console.error('[generate-plan] Invalid JSON, first 500 chars:', raw.slice(0, 500));
    return res.status(502).json({ error: 'AI returned invalid JSON' });
  }

  const { data: saved, error: saveErr } = await supabase.from('training_plans')
    .upsert({ user_id:user.id, training_days_per_week:trainingDays, suggested_days:suggestedDays, plan_json:planJson, week_start:weekStart, sport_type:sport }, { onConflict:'user_id,week_start,sport_type' })
    .select().single();

  if (saveErr) return res.status(500).json({ error: saveErr.message });

  const { input_tokens, output_tokens } = message.usage;

  res.json({ plan: saved, suggestedDays, atpContext, usage: { inputTokens: input_tokens, outputTokens: output_tokens, costUsd: costUsd(message.usage) } });
}
