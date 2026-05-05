import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

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
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const activityId = req.query.activityId as string;
  if (!activityId) return res.status(400).json({ error: 'activityId required' });

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await refreshToken(tokenRow); }
  catch { return res.status(401).json({ error: 'Token refresh failed' }); }

  const headers = { Authorization: `Bearer ${token}` };

  const [streamsRes, zonesRes, activityRes, lapsRes] = await Promise.all([
    fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,velocity_smooth,altitude,time,distance,cadence,watts&resolution=medium&series_type=time`, { headers }),
    fetch('https://www.strava.com/api/v3/athlete/zones', { headers }),
    fetch(`https://www.strava.com/api/v3/activities/${activityId}`, { headers }),
    fetch(`https://www.strava.com/api/v3/activities/${activityId}/laps`, { headers }),
  ]);

  if (!streamsRes.ok) return res.status(502).json({ error: 'Could not fetch streams' });

  type StreamItem = { type: string; data: number[] };
  type ZonesShape = { heart_rate?: { zones?: Array<{min:number;max:number}> } };

  const [streamsRaw, zonesRaw, activityRaw, lapsRaw] = await Promise.all([
    streamsRes.json() as Promise<StreamItem[]>,
    zonesRes.ok ? zonesRes.json() : {},
    activityRes.ok ? activityRes.json() : {},
    lapsRes.ok    ? lapsRes.json()    : [],
  ]);

  const get = (type: string) => (streamsRaw as StreamItem[]).find(s => s.type === type)?.data ?? [];

  const time      = get('time');
  const distance  = get('distance');
  const altitude  = get('altitude');
  const heartrate = get('heartrate');
  const velocity  = get('velocity_smooth');
  // Strava cadence = steps/min per ONE leg → multiply × 2 for total SPM (runs only)
  const RUN_SPORTS_S = new Set(['Run','TrailRun','VirtualRun']);
  const actSport    = (activityRaw as Record<string,unknown>)?.sport_type as string ?? '';
  const cadenceRaw  = get('cadence');
  const cadence     = RUN_SPORTS_S.has(actSport)
    ? cadenceRaw.map((v: number) => Math.round(v * 2))
    : cadenceRaw;
  const watts     = get('watts');

  const zonesTyped = zonesRaw as ZonesShape;
  const hrZonesAPI = zonesTyped?.heart_rate?.zones ?? null;

  // Fallback HR zones from max HR in stream
  const maxHRSeen = heartrate.length > 0 ? Math.max(...heartrate) : 0;
  function calcHRZones(mx: number) {
    const h = (p: number) => Math.round(mx * p);
    return [{ min:0, max:h(0.60) }, { min:h(0.60), max:h(0.70) }, { min:h(0.70), max:h(0.80) }, { min:h(0.80), max:h(0.90) }, { min:h(0.90), max:mx }];
  }
  const hrZones = hrZonesAPI ?? (maxHRSeen > 100 ? calcHRZones(maxHRSeen) : null);

  // Stats
  const totalDistKm = distance.length > 0 ? distance[distance.length - 1] / 1000 : 0;
  const totalTimeSec = time.length > 0 ? time[time.length - 1] : 0;

  let elevGain = 0;
  for (let i = 1; i < altitude.length; i++) {
    if (altitude[i] > altitude[i - 1]) elevGain += altitude[i] - altitude[i - 1];
  }

  const avgHR   = heartrate.length > 0 ? Math.round(heartrate.reduce((s,v)=>s+v,0) / heartrate.length) : null;
  const maxHR   = heartrate.length > 0 ? Math.max(...heartrate) : null;
  const avgVel  = velocity.length  > 0 ? velocity.reduce((s,v)=>s+v,0) / velocity.length : null;
  const avgWatt = watts.length > 0 ? Math.round(watts.reduce((s,v)=>s+v,0) / watts.length) : null;

  // Normalized Power (NP): 30-s rolling avg → 4th power avg → 4th root
  let normalizedPower: number | null = null;
  if (watts.length > 30 && time.length === watts.length) {
    const rolling: number[] = [];
    for (let i = 0; i < watts.length; i++) {
      // Find all samples within 30 seconds before this point
      const tNow = time[i];
      let sum = 0, count = 0;
      for (let j = i; j >= 0 && time[j] >= tNow - 30; j--) {
        sum += watts[j]; count++;
      }
      rolling.push(count > 0 ? sum / count : 0);
    }
    const fourthPowerAvg = rolling.reduce((s, v) => s + Math.pow(v, 4), 0) / rolling.length;
    normalizedPower = Math.round(Math.pow(fourthPowerAvg, 0.25));
  }

  const activity = activityRaw as { name?: string; sport_type?: string; start_date_local?: string };

  // Process laps: filter auto-laps (uniform distance = not useful) vs manual laps
  type RawLap = { lap_index: number; name?: string; distance: number; moving_time: number; elapsed_time: number; average_speed: number; average_heartrate?: number };
  const laps = (lapsRaw as RawLap[]).map(l => ({
    lapIndex:  l.lap_index,
    name:      l.name ?? `Lap ${l.lap_index}`,
    distM:     Math.round(l.distance),
    timeSec:   Math.round(l.moving_time),
    elapsedSec: Math.round(l.elapsed_time),
    velMs:     l.average_speed,
    avgHR:     l.average_heartrate ?? null,
  }));

  // Detect if these are auto-laps (all same distance → useless for interval analysis)
  const isAutoLap = laps.length > 2 && (() => {
    const dists = laps.map(l => l.distM);
    const medD  = dists.slice().sort((a,b)=>a-b)[Math.floor(dists.length/2)];
    const maxDev = Math.max(...dists.map(d => Math.abs(d - medD)));
    return maxDev < 60; // all laps within 60m of median → auto-lap
  })();

  res.json({
    activityId: +activityId,
    name:       activity.name ?? '',
    sportType:  activity.sport_type ?? '',
    startDate:  activity.start_date_local ?? '',
    time, distance, altitude, heartrate, velocity, cadence, watts,
    hrZones,
    laps:       isAutoLap ? [] : laps, // empty array if auto-lap (stream analysis will be used)
    stats: {
      totalDistKm:   Math.round(totalDistKm * 10) / 10,
      totalTimeSec,
      elevGain:      Math.round(elevGain),
      avgHeartRate:  avgHR,
      maxHeartRate:  maxHR,
      avgVelocityMs: avgVel,
      avgWatts:        avgWatt,
      normalizedPower: normalizedPower,
    },
  });
}
