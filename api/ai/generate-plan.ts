import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase  = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function nextMonday(): string {
  const d = new Date();
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

function buildPrompt(
  summaries: Array<Record<string, unknown>>,
  trainingDays: number,
  weekStart: string,
  profile: { weight?: number; ftp?: number; ctlEstimate?: number } = {},
): string {
  const recent = summaries.slice(-8);

  const avgSwimKm  = recent.length ? recent.reduce((s, r) => s + (r.swim_dist_km as number ?? 0), 0) / recent.length : 0;
  const avgBikeKm  = recent.length ? recent.reduce((s, r) => s + (r.bike_dist_km as number ?? 0), 0) / recent.length : 0;
  const avgRunKm   = recent.length ? recent.reduce((s, r) => s + (r.run_dist_km  as number ?? 0), 0) / recent.length : 0;
  const avgSessions = recent.length ? recent.reduce((s, r) => s + (r.swim_sessions as number ?? 0) + (r.bike_sessions as number ?? 0) + (r.run_sessions as number ?? 0), 0) / recent.length : 0;
  const avgTSS     = recent.length ? recent.reduce((s, r) => s + (r.tss as number ?? 0), 0) / recent.length : 0;

  const level = avgRunKm < 15 && avgBikeKm < 60 ? 'początkujący'
    : avgRunKm < 30 && avgBikeKm < 120 ? 'średniozaawansowany'
    : 'zaawansowany';

  const w1 = Array.from({ length: 7 }, (_, i) => `${['Pon','Wt','Śr','Czw','Pt','Sob','Nd'][i]} ${formatDate(weekStart, i)}`).join(', ');
  const w2start = new Date(weekStart); w2start.setDate(w2start.getDate() + 7);
  const w2 = Array.from({ length: 7 }, (_, i) => `${['Pon','Wt','Śr','Czw','Pt','Sob','Nd'][i]} ${formatDate(w2start.toISOString().split('T')[0], i)}`).join(', ');

  return `Jesteś doświadczonym trenerem triathlonowym. Wygeneruj 2-tygodniowy plan treningowy dla zawodnika.

PROFIL ZAWODNIKA (poziom: ${level}):
- Śr. tyg. pływanie: ${avgSwimKm.toFixed(1)} km (${(recent.find(r => r.swim_sessions) ? recent.reduce((s,r)=>(s + (r.swim_sessions as number ?? 0)), 0)/recent.length : 0).toFixed(1)} sesji)
- Śr. tyg. rower: ${avgBikeKm.toFixed(1)} km
- Śr. tyg. bieg: ${avgRunKm.toFixed(1)} km
- Śr. sesji/tydzień: ${avgSessions.toFixed(0)}
- Śr. tygodniowy TSS: ${avgTSS.toFixed(0)}
${profile.weight ? `- Waga: ${profile.weight} kg` : ''}
${profile.ftp ? `- FTP: ${profile.ftp} W` : ''}
${profile.ctlEstimate ? `- Szac. CTL (forma bazowa): ${profile.ctlEstimate}` : ''}
- Dostępne dni treningowe: ${trainingDays} dni/tydzień

TYDZIEŃ 1 dni: ${w1}
TYDZIEŃ 2 dni: ${w2}

Wygeneruj plan jako JSON (bez dodatkowego tekstu, tylko JSON):
{
  "assessment": "2-3 zdania oceny poziomu zawodnika i priorytetu na te 2 tygodnie",
  "week1": [
    {"day":"Pon","date":"${formatDate(weekStart,0)}","type":"rest|swim|bike|run|brick","sport":"swim|bike|run|brick|rest","label":"krótki tytuł","distance":"X km lub —","duration":"Xmin","description":"1-2 zdania co dokładnie robić"}
  ],
  "week2": [same 7 days]
}

ZASADY:
- Dokładnie ${trainingDays} dni z treningiem w każdym tygodniu (reszta = rest)
- Progresja: tydzień 2 o 5-10% trudniejszy od tygodnia 1
- Nie planuj 2 ciężkich dni pod rząd
- Długi bieg/rower w sobotę lub niedzielę
- Brick (rower+bieg) raz na 2 tygodnie
- Dostosuj objętości do poziomu zawodnika
- Pływanie: co najmniej 2x/tydzień jeśli pozwalają dni
- Odpowiedz TYLKO czystym JSON, bez markdown.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { trainingDays } = req.body as { trainingDays: number };
  if (!trainingDays || trainingDays < 2 || trainingDays > 7)
    return res.status(400).json({ error: 'trainingDays must be 2–7' });

  // Fetch historical data
  const [summariesRes, tokenRes] = await Promise.all([
    supabase.from('weekly_summaries').select('*').eq('user_id', user.id).order('week_start', { ascending: false }).limit(8),
    supabase.from('strava_tokens').select('athlete_name').eq('user_id', user.id).single(),
  ]);

  const summaries = summariesRes.data ?? [];

  // Try to get athlete profile for weight/FTP
  let profile: { weight?: number; ftp?: number; ctlEstimate?: number } = {};
  if (tokenRes.data) {
    const tokenRow = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
    if (tokenRow.data?.access_token) {
      try {
        const aRaw = await fetch('https://www.strava.com/api/v3/athlete', {
          headers: { Authorization: `Bearer ${tokenRow.data.access_token}` },
        }).then(r => r.ok ? r.json() : {});
        const a = aRaw as { weight?: number; ftp?: number };
        if (a.weight) profile.weight = Math.round(a.weight);
        if (a.ftp)    profile.ftp    = a.ftp;
      } catch { /* ignore */ }
    }
  }

  // Estimate CTL from recent TSS
  if (summaries.length >= 6) {
    const recentTSS = summaries.slice(0, 6).map(s => (s.tss as number) ?? 0);
    profile.ctlEstimate = Math.round(recentTSS.reduce((s, v) => s + v, 0) / recentTSS.length);
  }

  const weekStart = nextMonday();
  const prompt    = buildPrompt(summaries, trainingDays, weekStart, profile);

  // Suggested days based on avg sessions
  const avgSessions = summaries.length
    ? summaries.slice(0, 4).reduce((s, r) => s + ((r.swim_sessions as number) ?? 0) + ((r.bike_sessions as number) ?? 0) + ((r.run_sessions as number) ?? 0), 0) / Math.min(summaries.length, 4)
    : 5;
  const suggestedDays = Math.max(3, Math.min(6, Math.round(avgSessions)));

  // Call Claude
  const message = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw  = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';
  let planJson: Record<string, unknown>;
  try {
    // Strip markdown code block if present
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    planJson = JSON.parse(cleaned);
  } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON', raw });
  }

  // Save to database (upsert: one plan per user per week_start)
  const { data: saved, error: saveErr } = await supabase
    .from('training_plans')
    .upsert({
      user_id:                user.id,
      training_days_per_week: trainingDays,
      suggested_days:         suggestedDays,
      plan_json:              planJson,
      week_start:             weekStart,
    }, { onConflict: 'user_id,week_start' })
    .select()
    .single();

  if (saveErr) return res.status(500).json({ error: saveErr.message });

  res.json({ plan: saved, suggestedDays });
}
