import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

function fmtTime(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m} min` : `${h}h`;
}

function fmtPace(distKm: number, timeMin: number) {
  if (!distKm || !timeMin) return null;
  const p = timeMin / distKm;
  const m = Math.floor(p), s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function calcZoneTimes(hr: number[], time: number[], zones: Array<{ min: number; max: number }>): number[] {
  const totals = new Array(zones.length).fill(0);
  for (let i = 0; i < hr.length - 1; i++) {
    const dt = time[i + 1] - time[i];
    if (dt <= 0 || dt > 60) continue;
    const h = hr[i];
    for (let z = 0; z < zones.length; z++) {
      const lo = zones[z].min <= 0 ? 0 : zones[z].min;
      const hi = zones[z].max <= 0 ? 9999 : zones[z].max;
      if (h >= lo && h < hi) { totals[z] += dt; break; }
    }
  }
  return totals;
}

function getMondayOf(d: Date): Date {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const m = new Date(d);
  m.setDate(m.getDate() - (day - 1));
  m.setHours(0, 0, 0, 0);
  return m;
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
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await refreshToken(tokenRow); }
  catch { return res.status(401).json({ error: 'Token refresh failed' }); }

  const headers = { Authorization: `Bearer ${token}` };

  // Week range
  const weekStartParam = req.query.weekStart as string | undefined;
  const weekStart = weekStartParam ? new Date(weekStartParam) : getMondayOf(new Date());
  weekStart.setHours(0, 0, 0, 0);
  const after  = Math.floor(weekStart.getTime() / 1000);
  const before = after + 7 * 24 * 60 * 60;

  // Fetch activities + HR zones in parallel
  const [activitiesRes, zonesRes] = await Promise.all([
    fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=50`, { headers }),
    fetch('https://www.strava.com/api/v3/athlete/zones', { headers }),
  ]);

  if (!activitiesRes.ok) return res.status(502).json({ error: 'Strava API error' });

  type ZonesShape = { heart_rate?: { zones?: Array<{min:number;max:number}> }; power?: { zones?: Array<{min:number;max:number}> } };
  const [rawAll, zonesRaw] = await Promise.all([
    activitiesRes.json(),
    zonesRes.ok ? zonesRes.json() : {},
  ]);
  const zd = zonesRaw as ZonesShape;

  // Filter runs only
  const rawRuns = (rawAll as Record<string, unknown>[]).filter(a => RUN_TYPES.has(a.sport_type as string));

  // HR zones (Strava or calculated from max HR)
  const hrZonesFromAPI = zd?.heart_rate?.zones ?? null;
  const maxHRSeen = rawRuns.map(a => (a.max_heartrate as number) ?? 0).reduce((m, v) => Math.max(m, v), 0);
  function calcHRZones(mx: number) {
    const h = (p: number) => Math.round(mx * p);
    return [{ min: 0, max: h(0.60) }, { min: h(0.60), max: h(0.70) }, { min: h(0.70), max: h(0.80) }, { min: h(0.80), max: h(0.90) }, { min: h(0.90), max: mx }];
  }
  const hrZones = hrZonesFromAPI ?? (maxHRSeen > 100 ? calcHRZones(maxHRSeen) : null);

  // Build run activities
  let totalDistKm = 0, totalTimeMin = 0, totalSufferScore = 0;
  let longestRunKm = 0, totalHR = 0, hrCount = 0;

  const runs = rawRuns.map(a => {
    const distKm  = ((a.distance as number) ?? 0) / 1000;
    const timeMin = ((a.moving_time as number) ?? 0) / 60;
    const suffer  = (a.suffer_score as number | null) ?? null;
    const avgHR   = (a.average_heartrate as number | null) ?? null;

    totalDistKm    += distKm;
    totalTimeMin   += timeMin;
    if (suffer)     totalSufferScore += suffer;
    if (distKm > longestRunKm) longestRunKm = distKm;
    if (avgHR) { totalHR += avgHR; hrCount++; }

    return {
      id:            a.id,
      name:          a.name,
      sportType:     a.sport_type,
      date:          a.start_date_local,
      distanceKm:    Math.round(distKm * 10) / 10,
      timeFormatted: fmtTime(timeMin),
      pace:          fmtPace(distKm, timeMin),
      movingTimeSec: (a.moving_time as number) ?? 0,
      sufferScore:   suffer,
      avgHeartRate:  avgHR,
      maxHeartRate:  (a.max_heartrate as number | null) ?? null,
      elevationGain: Math.round((a.total_elevation_gain as number) ?? 0),
      hasHeartRate:  (a.has_heartrate as boolean) ?? false,
      zoneTimes:     null as number[] | null,
    };
  });

  // Fetch HR streams for runs in parallel
  if (hrZones) {
    const hrRuns = runs.filter(r => r.hasHeartRate);
    const streamResults = await Promise.allSettled(
      hrRuns.map(r =>
        fetch(`https://www.strava.com/api/v3/activities/${r.id}/streams?keys=heartrate,time&series_type=time&resolution=medium`, { headers })
          .then(res => res.ok ? res.json() as Promise<Array<{ type: string; data: number[] }>> : null)
      )
    );
    streamResults.forEach((result, idx) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const streams  = result.value;
      const hrStream = streams.find(s => s.type === 'heartrate')?.data;
      const tmStream = streams.find(s => s.type === 'time')?.data;
      if (hrStream && tmStream) hrRuns[idx].zoneTimes = calcZoneTimes(hrStream, tmStream, hrZones);
    });
  }

  // Weekly zone totals
  const weeklyZoneTimes = runs.reduce<number[]>((acc, r) => {
    if (!r.zoneTimes) return acc;
    r.zoneTimes.forEach((sec, i) => { acc[i] = (acc[i] ?? 0) + sec; });
    return acc;
  }, [0, 0, 0, 0, 0]);

  res.json({
    weekStart: weekStart.toISOString().split('T')[0],
    hrZones,
    activities: runs,
    totals: {
      distanceKm:    Math.round(totalDistKm * 10) / 10,
      timeFormatted: fmtTime(totalTimeMin),
      avgPace:       fmtPace(totalDistKm, totalTimeMin),
      avgHeartRate:  hrCount > 0 ? Math.round(totalHR / hrCount) : null,
      sufferScore:   Math.round(totalSufferScore),
      sessions:      runs.length,
      longestRunKm:  Math.round(longestRunKm * 10) / 10,
      zoneTimes:     weeklyZoneTimes,
    },
  });
}
