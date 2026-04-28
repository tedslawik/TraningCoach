import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const SWIM_TYPES  = new Set(['Swim']);
const BIKE_TYPES  = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'Velomobile', 'Handcycle']);
const RUN_TYPES   = new Set(['Run', 'TrailRun', 'VirtualRun']);

async function refreshIfNeeded(row: Record<string, unknown>) {
  const expiresAt = row.expires_at as number;
  if (Date.now() / 1000 < expiresAt - 300) {
    return row.access_token as string; // still valid
  }

  // Refresh the token
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
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at,
    updated_at:    new Date().toISOString(),
  }).eq('user_id', row.user_id);

  return data.access_token as string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate via Supabase JWT
  const authHeader = req.headers.authorization ?? '';
  const jwt = authHeader.replace('Bearer ', '');

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get Strava token from DB
  const { data: tokenRow, error: dbError } = await supabase
    .from('strava_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (dbError || !tokenRow) {
    return res.status(404).json({ error: 'Strava not connected' });
  }

  // Refresh if expired
  let accessToken: string;
  try {
    accessToken = await refreshIfNeeded(tokenRow);
  } catch {
    return res.status(401).json({ error: 'Token refresh failed — reconnect Strava' });
  }

  // Fetch last 7 days
  const after = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  const activitiesRes = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!activitiesRes.ok) {
    return res.status(502).json({ error: 'Strava API error' });
  }

  const activities = await activitiesRes.json() as Array<{
    sport_type: string;
    distance: number;
    moving_time: number;
  }>;

  // Aggregate by discipline
  const acc = {
    swimDist: 0, swimTime: 0, swimSessions: 0,
    bikeDist: 0, bikeTime: 0, bikeSessions: 0,
    runDist:  0, runTime:  0, runSessions:  0,
  };

  for (const a of activities) {
    const dist = a.distance / 1000;       // m → km
    const time = a.moving_time / 60;      // s → min

    if (SWIM_TYPES.has(a.sport_type)) {
      acc.swimDist += dist; acc.swimTime += time; acc.swimSessions++;
    } else if (BIKE_TYPES.has(a.sport_type)) {
      acc.bikeDist += dist; acc.bikeTime += time; acc.bikeSessions++;
    } else if (RUN_TYPES.has(a.sport_type)) {
      acc.runDist  += dist; acc.runTime  += time; acc.runSessions++;
    }
  }

  res.json({
    swimDist:     Math.round(acc.swimDist * 10) / 10,
    swimTime:     Math.round(acc.swimTime),
    swimSessions: acc.swimSessions,
    bikeDist:     Math.round(acc.bikeDist * 10) / 10,
    bikeTime:     Math.round(acc.bikeTime),
    bikeSessions: acc.bikeSessions,
    runDist:      Math.round(acc.runDist * 10) / 10,
    runTime:      Math.round(acc.runTime),
    runSessions:  acc.runSessions,
  });
}
