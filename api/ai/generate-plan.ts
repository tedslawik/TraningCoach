import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase  = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type SportType = 'triathlon' | 'run' | 'bike' | 'swim';

const SPORT_LABELS: Record<SportType, string> = {
  triathlon: 'Triathlon', run: 'Bieganie', bike: 'Kolarstwo', swim: 'Pływanie',
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

/* ── Main prompt ── */
function buildPrompt(
  summaries: Array<Record<string,unknown>>,
  recentActs: Array<Record<string,unknown>>,
  trainingDays: number,
  weekStart: string,
  sport: SportType,
  hrZones: Array<{min:number;max:number}> | null,
  profile: { weight?: number; ftp?: number } = {},
): string {
  const recent = summaries.slice(-8);
  const avg = (k: string) => recent.length ? recent.reduce((s,r)=>s+((r[k] as number)??0),0)/recent.length : 0;

  const pmc     = calcPMC(summaries);
  const form    = pmc.tsb > 5 ? 'wypoczęty' : pmc.tsb > -10 ? 'optymalny' : 'zmęczony';
  const level   = (() => {
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

TYDZIEŃ 1: ${days7(weekStart)}
TYDZIEŃ 2: ${days7(w2s.toISOString().split('T')[0])}

SCHEMAT JSON (odpowiedz TYLKO tym JSON, bez markdown):
{
  "assessment": "2-3 zdania: ocena zawodnika, aktualny Form i priorytet na 2 tygodnie",
  "week1": [
    {
      "day": "Pon",
      "date": "${formatDate(weekStart,0)}",
      "sessions": [
        {"type":"rest","label":"Odpoczynek","distance":"—","duration":"—","description":""}
      ]
    },
    {
      "day": "Wt",
      "date": "${formatDate(weekStart,1)}",
      "sessions": [
        {"type":"swim","label":"Pływanie techniczne","distance":"2.0km","duration":"50min","description":"Dryle high-elbow + 4x400m w tempie wyścigowym"},
        {"type":"run","label":"Bieg łatwy","distance":"6km","duration":"35min","description":"Z2, tuż po pływaniu — przyzwyczajenie nóg"}
      ]
    }
  ],
  "week2": [takie same 7 dni jak week1]
}

REGUŁY:
- Dokładnie ${trainingDays} dni z co najmniej 1 sesją, reszta = rest (sessions z type=rest)
- Tydzień 2 trudniejszy o 5-10% od tygodnia 1
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
    const { data, error: dbErr } = await supabase.from('training_plans').select('*').eq('user_id', u2.id).eq('sport_type', sport2).order('created_at', { ascending:false }).limit(1).single();
    if (dbErr || !data) return res.status(404).json({ error: 'No plan found' });
    const { data: smr } = await supabase.from('weekly_summaries').select('swim_sessions,bike_sessions,run_sessions').eq('user_id', u2.id).order('week_start',{ascending:false}).limit(4);
    const avgS = smr?.length ? smr.reduce((s,r)=>s+(r.swim_sessions??0)+(r.bike_sessions??0)+(r.run_sessions??0),0)/smr.length : 5;
    return res.json({ plan: data, suggestedDays: Math.max(3,Math.min(6,Math.round(avgS))) });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { trainingDays, sport = 'triathlon' } = req.body as { trainingDays: number; sport?: SportType };
  if (!trainingDays || trainingDays < 2 || trainingDays > 7)
    return res.status(400).json({ error: 'trainingDays must be 2–7' });

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

  const weekStart     = nextMonday();
  const prompt        = buildPrompt(summaries ?? [], recentActs, trainingDays, weekStart, sport, hrZones, profile);
  const avgSessions   = (summaries ?? []).slice(0,4).reduce((s,r)=>s+((r.swim_sessions as number)??0)+((r.bike_sessions as number)??0)+((r.run_sessions as number)??0),0) / Math.max(1, Math.min((summaries??[]).length,4));
  const suggestedDays = Math.max(3, Math.min(6, Math.round(avgSessions)));

  const message = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4500,
    system:     'You are a JSON generator. Respond with ONLY valid JSON, no markdown, no explanation, no code blocks. Start your response with { and end with }.',
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';

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
  const costUsd = (input_tokens * 3 + output_tokens * 15) / 1_000_000;

  res.json({ plan: saved, suggestedDays, usage: { inputTokens: input_tokens, outputTokens: output_tokens, costUsd } });
}
