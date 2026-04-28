import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const SWIM  = new Set(['Swim', 'OpenWaterSwim']);
const BIKE  = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'Velomobile', 'Handcycle']);
const RUN   = new Set(['Run', 'TrailRun', 'VirtualRun']);

function getMondayOf(d: Date): Date {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const m = new Date(d); m.setDate(m.getDate() - (day - 1)); m.setHours(0, 0, 0, 0); return m;
}

async function refreshToken(row: Record<string, unknown>): Promise<string> {
  if (Date.now() / 1000 < (row.expires_at as number) - 300) return row.access_token as string;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: row.refresh_token }),
  });
  if (!r.ok) throw new Error('refresh failed');
  const d = await r.json();
  await supabase.from('strava_tokens').update({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, updated_at: new Date().toISOString() }).eq('user_id', row.user_id);
  return d.access_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await refreshToken(tokenRow); } catch { return res.status(401).json({ error: 'Token refresh failed' }); }

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch athlete for FTP
  const athleteData = await fetch('https://www.strava.com/api/v3/athlete', { headers }).then(r => r.ok ? r.json() : {});
  const ftp: number | null = athleteData?.ftp && athleteData.ftp > 0 ? athleteData.ftp : null;

  // Fetch last 16 weeks of activities
  const weeksBack = 16;
  const after = Math.floor((Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000) / 1000);
  let page = 1;
  const allActivities: Record<string, unknown>[] = [];

  while (true) {
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200&page=${page}`, { headers });
    if (!r.ok) break;
    const batch = await r.json() as Record<string, unknown>[];
    if (!batch.length) break;
    allActivities.push(...batch);
    if (batch.length < 200) break;
    page++;
  }

  // Group by week
  const byWeek: Record<string, {
    swimDistKm: number; swimTimeMin: number; swimSessions: number;
    bikeDistKm: number; bikeTimeMin: number; bikeSessions: number;
    runDistKm:  number; runTimeMin:  number; runSessions:  number;
    sufferScore: number; tss: number; kilojoules: number;
  }> = {};

  for (const a of allActivities) {
    const sport    = a.sport_type as string;
    const date     = new Date((a.start_date_local as string) || (a.start_date as string));
    const monday   = getMondayOf(date);
    const key      = monday.toISOString().split('T')[0];
    const distKm   = ((a.distance as number) ?? 0) / 1000;
    const timeMin  = ((a.moving_time as number) ?? 0) / 60;
    const suffer   = (a.suffer_score as number) || 0;
    const kj       = (a.kilojoules as number) || 0;

    // TSS: precise for bike with power, suffer score otherwise
    let tss = suffer;
    if (ftp && BIKE.has(sport) && (a.device_watts as boolean)) {
      const np  = (a.weighted_average_watts as number) || 0;
      const sec = (a.moving_time as number) || 0;
      if (np > 0) tss = (sec * np * (np / ftp)) / (ftp * 3600) * 100;
    }

    if (!byWeek[key]) byWeek[key] = { swimDistKm:0,swimTimeMin:0,swimSessions:0, bikeDistKm:0,bikeTimeMin:0,bikeSessions:0, runDistKm:0,runTimeMin:0,runSessions:0, sufferScore:0,tss:0,kilojoules:0 };

    const w = byWeek[key];
    w.sufferScore += suffer;
    w.tss         += tss;
    w.kilojoules  += kj;

    if      (SWIM.has(sport)) { w.swimDistKm += distKm; w.swimTimeMin += timeMin; w.swimSessions++; }
    else if (BIKE.has(sport)) { w.bikeDistKm += distKm; w.bikeTimeMin += timeMin; w.bikeSessions++; }
    else if (RUN.has(sport))  { w.runDistKm  += distKm; w.runTimeMin  += timeMin; w.runSessions++;  }
  }

  // Upsert into Supabase
  const rows = Object.entries(byWeek).map(([week_start, w]) => ({
    user_id: user.id, week_start,
    swim_dist_km: Math.round(w.swimDistKm * 10) / 10, swim_time_min: Math.round(w.swimTimeMin), swim_sessions: w.swimSessions,
    bike_dist_km: Math.round(w.bikeDistKm * 10) / 10, bike_time_min: Math.round(w.bikeTimeMin), bike_sessions: w.bikeSessions,
    run_dist_km:  Math.round(w.runDistKm  * 10) / 10, run_time_min:  Math.round(w.runTimeMin),  run_sessions:  w.runSessions,
    suffer_score: Math.round(w.sufferScore),
    tss:          Math.round(w.tss),
    kilojoules:   Math.round(w.kilojoules),
    synced_at:    new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase.from('weekly_summaries').upsert(rows, { onConflict: 'user_id,week_start' });
  if (upsertError) return res.status(500).json({ error: upsertError.message });

  res.json({ synced: rows.length, weeks: Object.keys(byWeek).length, activities: allActivities.length });
}
