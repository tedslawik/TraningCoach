import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const SWIM_TYPES = new Set(['Swim', 'OpenWaterSwim']);
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide']);
const RUN_TYPES  = new Set(['Run', 'TrailRun', 'VirtualRun']);

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

// Take median of top N% to eliminate outliers (GPS errors, intervals, etc.)
function bestPace(values: number[], topFraction = 0.25): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); // ascending = fastest first
  const take   = Math.max(1, Math.ceil(sorted.length * topFraction));
  const top    = sorted.slice(0, take);
  return top.reduce((s, v) => s + v, 0) / top.length;
}

function bestSpeed(values: number[], topFraction = 0.25): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => b - a); // descending = fastest first
  const take   = Math.max(1, Math.ceil(sorted.length * topFraction));
  const top    = sorted.slice(0, take);
  return top.reduce((s, v) => s + v, 0) / top.length;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await refreshToken(tokenRow); }
  catch { return res.status(401).json({ error: 'Token refresh failed' }); }

  // Fetch last 6 months of activities (2 pages × 200 to be safe)
  const after  = Math.floor((Date.now() - 26 * 7 * 24 * 60 * 60 * 1000) / 1000);
  const headers = { Authorization: `Bearer ${token}` };

  const [p1, p2] = await Promise.all([
    fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200&page=1`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200&page=2`, { headers }).then(r => r.ok ? r.json() : []),
  ]);

  const activities: Record<string, unknown>[] = [...(p1 as Record<string, unknown>[]), ...(p2 as Record<string, unknown>[])];

  const swimPaces: number[] = [];   // min/100m
  const bikeSpeeds: number[] = [];  // km/h
  const runPaces: number[] = [];    // min/km

  for (const a of activities) {
    const sport   = a.sport_type as string;
    const distM   = (a.distance as number) ?? 0;
    const distKm  = distM / 1000;
    const timeSec = (a.moving_time as number) ?? 0;
    const timeMin = timeSec / 60;

    if (!distKm || !timeMin) continue;

    if (SWIM_TYPES.has(sport) && distKm >= 0.5) {
      // min per 100m — lower is better
      swimPaces.push(timeMin / (distKm * 10));
    }

    if (BIKE_TYPES.has(sport) && distKm >= 20) {
      // km/h — higher is better
      bikeSpeeds.push(distKm / (timeMin / 60));
    }

    if (RUN_TYPES.has(sport) && distKm >= 5) {
      // min per km — lower is better
      runPaces.push(timeMin / distKm);
    }
  }

  const swimPR   = bestPace(swimPaces);    // min/100m (lower = better)
  const bikeSpPR = bestSpeed(bikeSpeeds);  // km/h    (higher = better)
  const runPR    = bestPace(runPaces);     // min/km  (lower = better)

  // Format for display
  const fmt = (min: number | null, type: 'swim' | 'run') => {
    if (min === null) return null;
    const m = Math.floor(min), s = Math.round((min - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}${type === 'swim' ? '/100m' : '/km'}`;
  };

  res.json({
    swimPace:   swimPR,
    bikeSpeed:  bikeSpPR,
    runPace:    runPR,
    counts: { swim: swimPaces.length, bike: bikeSpeeds.length, run: runPaces.length },
    formatted: {
      swimPace:  fmt(swimPR,   'swim'),
      bikeSpeed: bikeSpPR != null ? `${bikeSpPR.toFixed(1)} km/h` : null,
      runPace:   fmt(runPR,   'run'),
    },
  });
}
