import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const SWIM_TYPES = new Set(['Swim']);
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'Velomobile', 'Handcycle']);
const RUN_TYPES  = new Set(['Run', 'TrailRun', 'VirtualRun']);

function typeKey(sportType: string): 'swim' | 'bike' | 'run' | 'other' {
  if (SWIM_TYPES.has(sportType)) return 'swim';
  if (BIKE_TYPES.has(sportType)) return 'bike';
  if (RUN_TYPES.has(sportType))  return 'run';
  return 'other';
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m} min` : `${h}h`;
}

function formatPace(distKm: number, timeMin: number, type: 'swim' | 'bike' | 'run'): string {
  if (distKm === 0 || timeMin === 0) return '—';
  if (type === 'bike') {
    return `${(distKm / (timeMin / 60)).toFixed(1)} km/h`;
  }
  const base   = type === 'swim' ? distKm * 10 : distKm; // per 100m or per 1km
  const pace   = timeMin / base;
  const m      = Math.floor(pace);
  const s      = Math.round((pace - m) * 60);
  const unit   = type === 'swim' ? '/100m' : '/km';
  return `${m}:${String(s).padStart(2, '0')}${unit}`;
}

async function refreshIfNeeded(row: Record<string, unknown>): Promise<string> {
  if (Date.now() / 1000 < (row.expires_at as number) - 300) {
    return row.access_token as string;
  }
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: row.refresh_token,
    }),
  });
  if (!res.ok) throw new Error('Token refresh failed');
  const data = await res.json();
  await supabase.from('strava_tokens').update({
    access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: data.expires_at, updated_at: new Date().toISOString(),
  }).eq('user_id', row.user_id);
  return data.access_token as string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: tokenRow, error: dbError } = await supabase
    .from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (dbError || !tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let accessToken: string;
  try { accessToken = await refreshIfNeeded(tokenRow); }
  catch { return res.status(401).json({ error: 'Token refresh failed — reconnect Strava' }); }

  const after = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const stravaRes = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!stravaRes.ok) return res.status(502).json({ error: 'Strava API error' });

  const raw = await stravaRes.json() as Array<{
    id: number; name: string; sport_type: string;
    start_date_local: string; distance: number; moving_time: number;
  }>;

  // All returned activities are already within 7 days (Strava API filters via `after`)
  const acc = { swimDist:0,swimTime:0,swimSessions:0,bikeDist:0,bikeTime:0,bikeSessions:0,runDist:0,runTime:0,runSessions:0 };
  for (const a of raw) {
    const dist = a.distance / 1000;
    const time = a.moving_time / 60;
    const key  = typeKey(a.sport_type);
    if (key === 'swim') { acc.swimDist += dist; acc.swimTime += time; acc.swimSessions++; }
    else if (key === 'bike') { acc.bikeDist += dist; acc.bikeTime += time; acc.bikeSessions++; }
    else if (key === 'run')  { acc.runDist  += dist; acc.runTime  += time; acc.runSessions++;  }
  }

  const summary = {
    swimDist: Math.round(acc.swimDist * 10) / 10, swimTime: Math.round(acc.swimTime), swimSessions: acc.swimSessions,
    bikeDist: Math.round(acc.bikeDist * 10) / 10, bikeTime: Math.round(acc.bikeTime), bikeSessions: acc.bikeSessions,
    runDist:  Math.round(acc.runDist  * 10) / 10, runTime:  Math.round(acc.runTime),  runSessions:  acc.runSessions,
  };

  // Last 7 individual activities — all already within 7 days from Strava API
  const activities = raw
    .filter(a => typeKey(a.sport_type) !== 'other')
    .slice(0, 7)
    .map(a => {
      const type = typeKey(a.sport_type) as 'swim' | 'bike' | 'run';
      const distKm = a.distance / 1000;
      const timeMin = a.moving_time / 60;
      return {
        id:           a.id,
        name:         a.name,
        type,
        date:         a.start_date_local,
        distanceKm:   Math.round(distKm * 10) / 10,
        timeFormatted: formatTime(timeMin),
        paceOrSpeed:  formatPace(distKm, timeMin, type),
      };
    });

  res.json({ summary, activities });
}
