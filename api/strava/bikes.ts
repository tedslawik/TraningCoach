import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'Velomobile', 'Handcycle']);

function fmtTime(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m} min` : `${h}h`;
}

function fmtSpeed(distKm: number, timeMin: number) {
  if (!distKm || !timeMin) return null;
  return `${(distKm / (timeMin / 60)).toFixed(1)} km/h`;
}

function calcZoneTimes(stream: number[], time: number[], zones: Array<{ min: number; max: number }>): number[] {
  const totals = new Array(zones.length).fill(0);
  for (let i = 0; i < stream.length - 1; i++) {
    const dt = time[i + 1] - time[i];
    if (dt <= 0 || dt > 60) continue;
    const v = stream[i];
    for (let z = 0; z < zones.length; z++) {
      const lo = zones[z].min <= 0 ? 0 : zones[z].min;
      const hi = zones[z].max <= 0 ? 9999 : zones[z].max;
      if (v >= lo && v < hi) { totals[z] += dt; break; }
    }
  }
  return totals;
}

function calcPowerZones(ftp: number) {
  const p = (pct: number) => Math.round(ftp * pct);
  return [{ min: 0, max: p(0.55) }, { min: p(0.56), max: p(0.75) }, { min: p(0.76), max: p(0.90) }, { min: p(0.91), max: p(1.05) }, { min: p(1.06), max: p(1.20) }, { min: p(1.21), max: p(1.50) }, { min: p(1.51), max: -1 }];
}
function calcHRZones(mx: number) {
  const h = (p: number) => Math.round(mx * p);
  return [{ min: 0, max: h(0.60) }, { min: h(0.60), max: h(0.70) }, { min: h(0.70), max: h(0.80) }, { min: h(0.80), max: h(0.90) }, { min: h(0.90), max: mx }];
}

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
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await refreshToken(tokenRow); } catch { return res.status(401).json({ error: 'Token refresh failed' }); }

  const headers = { Authorization: `Bearer ${token}` };
  const weekStartParam = req.query.weekStart as string | undefined;
  const weekStart = weekStartParam ? new Date(weekStartParam) : getMondayOf(new Date());
  weekStart.setHours(0, 0, 0, 0);
  const after  = Math.floor(weekStart.getTime() / 1000);
  const before = after + 7 * 24 * 60 * 60;

  const [activitiesRes, zonesRes, athleteRes] = await Promise.all([
    fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=50`, { headers }),
    fetch('https://www.strava.com/api/v3/athlete/zones', { headers }),
    fetch('https://www.strava.com/api/v3/athlete', { headers }),
  ]);
  if (!activitiesRes.ok) return res.status(502).json({ error: 'Strava API error' });

  type ZonesShape   = { heart_rate?: { zones?: Array<{min:number;max:number}> }; power?: { zones?: Array<{min:number;max:number}> } };
  type AthleteShape = { ftp?: number; weight?: number };

  const [rawAll, zonesRaw, athleteRaw] = await Promise.all([
    activitiesRes.json(), zonesRes.ok ? zonesRes.json() : {}, athleteRes.ok ? athleteRes.json() : {},
  ]);
  const zonesData = zonesRaw   as ZonesShape;
  const athlete   = athleteRaw as AthleteShape;

  const ftp: number | null = athlete?.ftp && athlete.ftp > 0 ? athlete.ftp : null;
  const rawBikes = (rawAll as Record<string, unknown>[]).filter(a => BIKE_TYPES.has(a.sport_type as string));

  // Zones
  const pwrZonesFromAPI = zonesData?.power?.zones ?? null;
  const hrZonesFromAPI  = zonesData?.heart_rate?.zones ?? null;
  const maxHRSeen = rawBikes.map(a => (a.max_heartrate as number) ?? 0).reduce((m, v) => Math.max(m, v), 0);
  const powerZones = pwrZonesFromAPI ?? (ftp ? calcPowerZones(ftp) : null);
  const hrZones    = hrZonesFromAPI  ?? (maxHRSeen > 100 ? calcHRZones(maxHRSeen) : null);

  let totalDistKm = 0, totalTimeMin = 0, totalSufferScore = 0, totalKj = 0;
  let totalTSS = 0, totalWatts = 0, wattsCount = 0, longestKm = 0;

  const bikes = rawBikes.map(a => {
    const distKm    = ((a.distance as number) ?? 0) / 1000;
    const timeMin   = ((a.moving_time as number) ?? 0) / 60;
    const suffer    = (a.suffer_score as number | null) ?? null;
    const kj        = (a.kilojoules as number | null) ?? null;
    const avgW      = (a.average_watts as number | null) ?? null;
    const np        = (a.weighted_average_watts as number | null) ?? null;
    const deviceW   = (a.device_watts as boolean) ?? false;
    const hasHR     = (a.has_heartrate as boolean) ?? false;

    // TSS = (sec × NP × IF) / (FTP × 3600) × 100
    let tss: number | null = null;
    if (ftp && np && np > 0) {
      const sec = (a.moving_time as number) ?? 0;
      const IF  = np / ftp;
      tss = (sec * np * IF) / (ftp * 3600) * 100;
    }

    totalDistKm   += distKm;
    totalTimeMin  += timeMin;
    if (suffer) totalSufferScore += suffer;
    if (kj)     totalKj          += kj;
    if (tss)    totalTSS         += tss;
    if (avgW && deviceW) { totalWatts += avgW; wattsCount++; }
    if (distKm > longestKm) longestKm = distKm;

    return {
      id: a.id, name: a.name, sportType: a.sport_type, date: a.start_date_local,
      distanceKm:    Math.round(distKm * 10) / 10,
      elevationGain: Math.round((a.total_elevation_gain as number) ?? 0),
      timeFormatted: fmtTime(timeMin),
      speed:         fmtSpeed(distKm, timeMin),
      movingTimeSec: (a.moving_time as number) ?? 0,
      sufferScore:   suffer,
      avgHeartRate:  (a.average_heartrate as number | null) ?? null,
      maxHeartRate:  (a.max_heartrate as number | null) ?? null,
      avgWatts:      avgW, normalizedWatts: np,
      kilojoules:    kj ? Math.round(kj) : null,
      avgCadence:    (a.average_cadence as number | null) ?? null,
      tss:           tss ? Math.round(tss) : null,
      if_:           ftp && np ? Math.round((np / ftp) * 100) / 100 : null,
      hasHeartRate:  hasHR, deviceWatts: deviceW,
      zoneTimes:      null as number[] | null,
      powerZoneTimes: null as number[] | null,
    };
  });

  // Fetch streams for activities with power or HR
  const streamBikes = bikes.filter(b => b.deviceWatts || b.hasHeartRate).slice(0, 15);
  const streamResults = await Promise.allSettled(
    streamBikes.map(b => {
      const keys = [b.deviceWatts && 'watts', b.hasHeartRate && 'heartrate', 'time'].filter(Boolean).join(',');
      return fetch(`https://www.strava.com/api/v3/activities/${b.id}/streams?keys=${keys}&series_type=time&resolution=medium`, { headers })
        .then(r => r.ok ? r.json() as Promise<Array<{ type: string; data: number[] }>> : null);
    })
  );

  streamResults.forEach((result, idx) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    const streams = result.value;
    const tmStream  = streams.find(s => s.type === 'time')?.data;
    const hrStream  = streams.find(s => s.type === 'heartrate')?.data;
    const pwrStream = streams.find(s => s.type === 'watts')?.data;
    if (!tmStream) return;
    if (pwrStream && powerZones) streamBikes[idx].powerZoneTimes = calcZoneTimes(pwrStream, tmStream, powerZones);
    if (hrStream  && hrZones)   streamBikes[idx].zoneTimes       = calcZoneTimes(hrStream,  tmStream, hrZones);
  });

  // Weekly zone totals
  const weeklyPwrZones = bikes.reduce<number[]>((acc, b) => {
    if (!b.powerZoneTimes) return acc;
    b.powerZoneTimes.forEach((sec, i) => { acc[i] = (acc[i] ?? 0) + sec; });
    return acc;
  }, [0, 0, 0, 0, 0, 0, 0]);
  const weeklyHRZones = bikes.reduce<number[]>((acc, b) => {
    if (!b.zoneTimes) return acc;
    b.zoneTimes.forEach((sec, i) => { acc[i] = (acc[i] ?? 0) + sec; });
    return acc;
  }, [0, 0, 0, 0, 0]);

  res.json({
    weekStart: weekStart.toISOString().split('T')[0],
    ftp, powerZones, hrZones,
    activities: bikes,
    totals: {
      distanceKm:    Math.round(totalDistKm * 10) / 10,
      timeFormatted: fmtTime(totalTimeMin),
      avgSpeed:      fmtSpeed(totalDistKm, totalTimeMin),
      avgWatts:      wattsCount > 0 ? Math.round(totalWatts / wattsCount) : null,
      kilojoules:    Math.round(totalKj),
      sufferScore:   Math.round(totalSufferScore),
      tss:           Math.round(totalTSS),
      sessions:      bikes.length,
      longestKm:     Math.round(longestKm * 10) / 10,
      weeklyPwrZones,
      weeklyHRZones,
    },
  });
}
