import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase  = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type SportType = 'triathlon' | 'run' | 'bike' | 'swim';

const SPORT_LABELS: Record<SportType, string> = {
  triathlon: 'Triathlon',
  run:       'Bieganie',
  bike:      'Kolarstwo',
  swim:      'Pływanie',
};

function nextMonday(): string {
  const d   = new Date();
  const day = d.getDay() === 0 ? 1 : 8 - d.getDay();
  d.setDate(d.getDate() + day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function formatDate(base: string, offset: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function sportContext(sport: SportType, avgRunKm: number, avgBikeKm: number, avgSwimKm: number): string {
  if (sport === 'run') return `
PLAN: WYŁĄCZNIE BIEGOWY
Typy treningów biegowych:
- Długi bieg (LSR): 1x/tydzień, spokojne tempo Z2, buduje wytrzymałość
- Bieg tempo: 1x/tydzień, 20-40 min w tempie progu, podnosi progi
- Bieg łatwy/regeneracyjny: 2-3x/tydzień, Z1-Z2
- Interwały: opcjonalnie 1x/tydzień jeśli poziom pozwala
Kluczowa dyscyplina: TYLKO bieg (type=run). Nie dodawaj swim ani bike.
Bazowe dane: śr. ${avgRunKm.toFixed(0)} km/tydzień biegu.`;

  if (sport === 'bike') return `
PLAN: WYŁĄCZNIE ROWEROWY
Typy treningów rowerowych:
- Długa jazda wytrzymałościowa: 1x/tydzień, Z2, buduje bazę
- Sweet Spot (88-93% FTP): 1-2x/tydzień, najefektywniejsza strefa
- Interwały FTP: 1x/tydzień, 2-3 bloki po 10-20 min
- Jazda łatwa/regeneracyjna: 1-2x/tydzień, Z1-Z2
Kluczowa dyscyplina: TYLKO rower (type=bike). Nie dodawaj swim ani run.
Bazowe dane: śr. ${avgBikeKm.toFixed(0)} km/tydzień na rowerze.`;

  if (sport === 'swim') return `
PLAN: WYŁĄCZNIE PŁYWACKI
Typy treningów pływackich:
- Sesja techniczna: 1-2x/tydzień, dryle (catch-up, high-elbow, side-kick)
- Wytrzymałościowa: 1-2x/tydzień, ciągły dystans w tempie aerobowym
- Interwałowa: 1x/tydzień, 4-6×400m lub 8×200m z przerwami
- Długi trening: 1x/tydzień, 3-4 km ciągiem
Kluczowa dyscyplina: TYLKO pływanie (type=swim). Nie dodawaj run ani bike.
Bazowe dane: śr. ${avgSwimKm.toFixed(1)} km/tydzień w basenie.`;

  return `
PLAN: TRIATHLONOWY (wszystkie 3 dyscypliny)
- Pływanie: 2x/tydzień minimum
- Rower: długa jazda w weekend, krótsze w tygodniu
- Bieg: długi bieg w niedzielę, tempo/interwały w środku tygodnia
- Brick (rower+bieg): 1x na 2 tygodnie
Balansuj dyscypliny proporcjonalnie do celu wyścigu Half IM.`;
}

function buildPrompt(
  summaries: Array<Record<string, unknown>>,
  trainingDays: number,
  weekStart: string,
  sport: SportType,
  profile: { weight?: number; ftp?: number; ctlEstimate?: number } = {},
): string {
  const recent = summaries.slice(-8);
  const avg    = (key: string) => recent.length ? recent.reduce((s,r) => s + ((r[key] as number) ?? 0), 0) / recent.length : 0;

  const avgSwimKm  = avg('swim_dist_km');
  const avgBikeKm  = avg('bike_dist_km');
  const avgRunKm   = avg('run_dist_km');
  const avgSessions = avg('swim_sessions') + avg('bike_sessions') + avg('run_sessions');
  const avgTSS     = avg('tss');

  const primaryKm = sport === 'run' ? avgRunKm : sport === 'bike' ? avgBikeKm : sport === 'swim' ? avgSwimKm * 10 : avgRunKm;
  const level = primaryKm < (sport === 'swim' ? 30 : sport === 'bike' ? 60 : 15) ? 'początkujący'
    : primaryKm < (sport === 'swim' ? 80 : sport === 'bike' ? 120 : 30) ? 'średniozaawansowany'
    : 'zaawansowany';

  const w2start = new Date(weekStart); w2start.setDate(w2start.getDate() + 7);
  const days7   = (start: string) => Array.from({length:7},(_,i)=>`${['Pon','Wt','Śr','Czw','Pt','Sob','Nd'][i]} ${formatDate(start,i)}`).join(', ');

  return `Jesteś trenerem sportowym specjalizującym się w ${SPORT_LABELS[sport].toLowerCase()}. Wygeneruj 2-tygodniowy plan treningowy.

PROFIL ZAWODNIKA (poziom: ${level}, sport: ${SPORT_LABELS[sport]}):
${sport === 'triathlon' || sport === 'swim' ? `- Śr. tyg. pływanie: ${avgSwimKm.toFixed(1)} km` : ''}
${sport === 'triathlon' || sport === 'bike' ? `- Śr. tyg. rower: ${avgBikeKm.toFixed(1)} km` : ''}
${sport === 'triathlon' || sport === 'run'  ? `- Śr. tyg. bieg: ${avgRunKm.toFixed(1)} km` : ''}
- Śr. sesji/tydzień: ${avgSessions.toFixed(0)}
- Śr. tygodniowy TSS: ${avgTSS.toFixed(0)}
${profile.weight ? `- Waga: ${profile.weight} kg` : ''}
${profile.ftp ? `- FTP: ${profile.ftp} W` : ''}
${profile.ctlEstimate ? `- Szac. CTL: ${profile.ctlEstimate}` : ''}
- Dni treningowe: ${trainingDays}/tydzień
${sportContext(sport, avgRunKm, avgBikeKm, avgSwimKm)}

TYDZIEŃ 1 dni: ${days7(weekStart)}
TYDZIEŃ 2 dni: ${days7(w2start.toISOString().split('T')[0])}

Odpowiedz TYLKO czystym JSON:
{
  "assessment": "2-3 zdania: ocena zawodnika i priorytet na te 2 tygodnie",
  "week1": [
    {"day":"Pon","date":"${formatDate(weekStart,0)}","type":"rest|swim|bike|run|brick","sport":"swim|bike|run|brick|rest","label":"krótki tytuł","distance":"X km lub —","duration":"Xmin","description":"1-2 zdania co robić i jak"}
  ],
  "week2": [takie same 7 dni]
}

REGUŁY:
- Dokładnie ${trainingDays} dni treningowych w każdym tygodniu (reszta = rest)
- Tydzień 2 o 5-10% trudniejszy od tygodnia 1
- Nie 2 ciężkie dni pod rząd
- Długa sesja w sobotę lub niedzielę
- Dostosuj dystanse do poziomu
- Bez markdown, tylko JSON.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // GET: fetch existing plan (optionally filtered by sport)
  if (req.method === 'GET') {
    const jwt2 = (req.headers.authorization ?? '').replace('Bearer ', '');
    const { data: { user: u2 }, error: e2 } = await supabase.auth.getUser(jwt2);
    if (e2 || !u2) return res.status(401).json({ error: 'Unauthorized' });

    const sport2 = (req.query.sport as SportType) ?? 'triathlon';
    const { data, error: dbErr } = await supabase
      .from('training_plans').select('*')
      .eq('user_id', u2.id)
      .eq('sport_type', sport2)
      .order('created_at', { ascending: false })
      .limit(1).single();

    if (dbErr || !data) return res.status(404).json({ error: 'No plan found' });

    const { data: summaries } = await supabase
      .from('weekly_summaries').select('swim_sessions,bike_sessions,run_sessions')
      .eq('user_id', u2.id).order('week_start', { ascending: false }).limit(4);
    const avgS = summaries?.length
      ? summaries.reduce((s,r)=>s+(r.swim_sessions??0)+(r.bike_sessions??0)+(r.run_sessions??0), 0) / summaries.length : 5;
    return res.json({ plan: data, suggestedDays: Math.max(3, Math.min(6, Math.round(avgS))) });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { trainingDays, sport = 'triathlon' } = req.body as { trainingDays: number; sport?: SportType };
  if (!trainingDays || trainingDays < 2 || trainingDays > 7)
    return res.status(400).json({ error: 'trainingDays must be 2–7' });

  const [summariesRes, tokenRes] = await Promise.all([
    supabase.from('weekly_summaries').select('*').eq('user_id', user.id).order('week_start', { ascending: false }).limit(8),
    supabase.from('strava_tokens').select('*').eq('user_id', user.id).single(),
  ]);

  const summaries = summariesRes.data ?? [];
  let profile: { weight?: number; ftp?: number; ctlEstimate?: number } = {};

  if (tokenRes.data?.access_token) {
    try {
      const aRaw = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      }).then(r => r.ok ? r.json() : {});
      const a = aRaw as { weight?: number; ftp?: number };
      if (a.weight) profile.weight = Math.round(a.weight);
      if (a.ftp)    profile.ftp    = a.ftp;
    } catch { /* ignore */ }
  }

  if (summaries.length >= 6) {
    const recentTSS = summaries.slice(0,6).map(s => (s.tss as number) ?? 0);
    profile.ctlEstimate = Math.round(recentTSS.reduce((s,v)=>s+v,0) / recentTSS.length);
  }

  const weekStart = nextMonday();
  const prompt    = buildPrompt(summaries, trainingDays, weekStart, sport, profile);

  const avgSessions = summaries.length
    ? summaries.slice(0,4).reduce((s,r)=>s+((r.swim_sessions as number)??0)+((r.bike_sessions as number)??0)+((r.run_sessions as number)??0),0) / Math.min(summaries.length,4)
    : 5;
  const suggestedDays = Math.max(3, Math.min(6, Math.round(avgSessions)));

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw     = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';
  let planJson: Record<string, unknown>;
  try {
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    planJson = JSON.parse(cleaned);
  } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON', raw });
  }

  const { data: saved, error: saveErr } = await supabase
    .from('training_plans')
    .upsert({
      user_id: user.id,
      training_days_per_week: trainingDays,
      suggested_days: suggestedDays,
      plan_json: planJson,
      week_start: weekStart,
      sport_type: sport,
    }, { onConflict: 'user_id,week_start,sport_type' })
    .select().single();

  if (saveErr) return res.status(500).json({ error: saveErr.message });
  res.json({ plan: saved, suggestedDays });
}
