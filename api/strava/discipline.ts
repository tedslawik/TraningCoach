/**
 * GET /api/strava/discipline?sport=run|swim|bike&weekStart=YYYY-MM-DD
 * Replaces: runs.ts, swims.ts, bikes.ts
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const SPORT_TYPES = {
  run:  new Set(['Run', 'TrailRun', 'VirtualRun']),
  swim: new Set(['Swim', 'OpenWaterSwim']),
  bike: new Set(['Ride', 'VirtualRide', 'EBikeRide', 'Velomobile', 'Handcycle']),
};

type Sport = 'run' | 'swim' | 'bike';

function fmtTime(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m} min` : `${h}h`;
}
function fmtPace100m(dKm: number, tMin: number) {
  if (!dKm || !tMin) return null;
  const p = tMin / (dKm * 10), m = Math.floor(p), s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/100m`;
}
function fmtSpeed(dKm: number, tMin: number) {
  if (!dKm || !tMin) return null;
  return `${(dKm / (tMin / 60)).toFixed(1)} km/h`;
}
function fmtRunPace(dKm: number, tMin: number) {
  if (!dKm || !tMin) return null;
  const p = tMin / dKm, m = Math.floor(p), s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
function calcZoneTimes(stream: number[], time: number[], zones: Array<{min:number;max:number}>): number[] {
  const totals = new Array(zones.length).fill(0);
  for (let i = 0; i < stream.length - 1; i++) {
    const dt = time[i+1] - time[i];
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
function calcHRZones(mx: number) {
  const h = (p: number) => Math.round(mx * p);
  return [{ min:0,max:h(0.60) },{min:h(0.60),max:h(0.70)},{min:h(0.70),max:h(0.80)},{min:h(0.80),max:h(0.90)},{min:h(0.90),max:mx}];
}
function calcPowerZones(ftp: number) {
  const p = (pct: number) => Math.round(ftp * pct);
  return [{min:0,max:p(0.55)},{min:p(0.56),max:p(0.75)},{min:p(0.76),max:p(0.90)},{min:p(0.91),max:p(1.05)},{min:p(1.06),max:p(1.20)},{min:p(1.21),max:p(1.50)},{min:p(1.51),max:-1}];
}

function getMondayOf(d: Date) {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const m = new Date(d); m.setDate(m.getDate() - (day-1)); m.setHours(0,0,0,0); return m;
}

async function refreshToken(row: Record<string,unknown>): Promise<string> {
  if (Date.now()/1000 < (row.expires_at as number) - 300) return row.access_token as string;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({client_id:process.env.STRAVA_CLIENT_ID,client_secret:process.env.STRAVA_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:row.refresh_token}),
  });
  if (!r.ok) throw new Error('refresh failed');
  const d = await r.json();
  await supabase.from('strava_tokens').update({access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at,updated_at:new Date().toISOString()}).eq('user_id',row.user_id);
  return d.access_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const sport = (req.query.sport as string) as Sport;
  if (!SPORT_TYPES[sport]) return res.status(400).json({ error: 'sport must be run|swim|bike' });

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await refreshToken(tokenRow); } catch { return res.status(401).json({ error: 'Token refresh failed' }); }

  const headers = { Authorization: `Bearer ${token}` };
  const weekStartParam = req.query.weekStart as string | undefined;
  const daysBackParam  = req.query.daysBack  as string | undefined;

  let after: number, before: number, responseWeekStart: string;
  if (daysBackParam) {
    const days   = Math.min(90, Math.max(7, parseInt(daysBackParam)));
    before       = Math.floor(Date.now() / 1000);
    after        = before - days * 24 * 60 * 60;
    responseWeekStart = new Date(after * 1000).toISOString().split('T')[0];
  } else {
    const ws = weekStartParam ? new Date(weekStartParam) : getMondayOf(new Date());
    ws.setHours(0, 0, 0, 0);
    after        = Math.floor(ws.getTime() / 1000);
    before       = after + 7 * 24 * 60 * 60;
    responseWeekStart = ws.toISOString().split('T')[0];
  }

  // Parallel fetches (bike also needs athlete for FTP)
  const fetches: Promise<unknown>[] = [
    fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=50`, { headers }).then(r => r.ok ? r.json() : []),
    fetch('https://www.strava.com/api/v3/athlete/zones', { headers }).then(r => r.ok ? r.json() : {}),
  ];
  if (sport === 'bike') {
    fetches.push(fetch('https://www.strava.com/api/v3/athlete', { headers }).then(r => r.ok ? r.json() : {}));
  }

  const results = await Promise.all(fetches);
  const rawAll    = results[0] as Record<string,unknown>[];
  const zonesRaw  = results[1] as { heart_rate?: { zones?: Array<{min:number;max:number}> }; power?: { zones?: Array<{min:number;max:number}> } };
  const athleteRaw = sport === 'bike' ? results[2] as { ftp?: number; weight?: number } : null;

  const rawSport = rawAll.filter(a => (SPORT_TYPES[sport] as Set<string>).has(a.sport_type as string));

  // Zones
  const hrZonesAPI = zonesRaw?.heart_rate?.zones ?? null;
  const maxHRSeen  = rawSport.map(a => (a.max_heartrate as number) ?? 0).reduce((m,v) => Math.max(m,v), 0);
  const hrZones    = hrZonesAPI ?? (maxHRSeen > 100 ? calcHRZones(maxHRSeen) : null);
  const ftp        = sport === 'bike' && athleteRaw?.ftp && athleteRaw.ftp > 0 ? athleteRaw.ftp : null;
  const pwrZonesAPI = sport === 'bike' ? (zonesRaw?.power?.zones ?? null) : null;
  const powerZones  = sport === 'bike' ? (pwrZonesAPI ?? (ftp ? calcPowerZones(ftp) : null)) : null;

  // Build activities
  let totalDist=0, totalTime=0, totalSuffer=0, totalKj=0, totalWatts=0, wattsCount=0, totalTSS=0, longestKm=0, totalHR=0, hrCount=0;

  const activities = rawSport.map(a => {
    const dM   = ((a.distance as number) ?? 0) / 1000;
    const tMin = ((a.moving_time as number) ?? 0) / 60;
    const suffer = (a.suffer_score as number | null) ?? null;
    const kj     = (a.kilojoules as number | null) ?? null;
    const avgW   = (a.average_watts as number | null) ?? null;
    const np     = (a.weighted_average_watts as number | null) ?? null;
    const avgHR  = (a.average_heartrate as number | null) ?? null;
    const devW   = (a.device_watts as boolean) ?? false;

    let tss: number | null = null;
    if (ftp && np && np > 0) {
      const sec = (a.moving_time as number) ?? 0;
      const IF  = np / ftp;
      tss = (sec * np * IF) / (ftp * 3600) * 100;
    }

    totalDist   += dM; totalTime += tMin;
    if (suffer) totalSuffer += suffer;
    if (kj)     totalKj     += kj;
    if (tss)    totalTSS    += tss;
    if (avgW && devW) { totalWatts += avgW; wattsCount++; }
    if (dM > longestKm) longestKm = dM;
    if (avgHR) { totalHR += avgHR; hrCount++; }

    const pace = sport === 'swim' ? fmtPace100m(dM, tMin)
               : sport === 'bike' ? fmtSpeed(dM, tMin)
               : fmtRunPace(dM, tMin);

    return {
      id:              a.id, name: a.name, sportType: a.sport_type,
      date:            a.start_date_local,
      distanceKm:      Math.round(dM * 10) / 10,
      timeFormatted:   fmtTime(tMin),
      pace,
      movingTimeSec:   (a.moving_time as number) ?? 0,
      elevationGain:   Math.round((a.total_elevation_gain as number) ?? 0),
      sufferScore:     suffer, avgHeartRate: avgHR,
      maxHeartRate:    (a.max_heartrate as number | null) ?? null,
      avgWatts:        avgW, normalizedWatts: np,
      kilojoules:      kj ? Math.round(kj) : null,
      // Strava run cadence = one-leg SPM → × 2 for real cadence; bike = full RPM, no change
      avgCadence:      (() => { const raw = (a.average_cadence as number|null)??null; if(!raw)return null; return SPORT_TYPES.run.has(a.sport_type as string) ? Math.round(raw*2) : Math.round(raw); })(),
      tss:             tss ? Math.round(tss) : null,
      if_:             ftp && np ? Math.round((np/ftp)*100)/100 : null,
      hasHeartRate:    (a.has_heartrate as boolean) ?? false,
      deviceWatts:     devW,
      zoneTimes:       null as number[] | null,
      powerZoneTimes:  null as number[] | null,
    };
  });

  // Streams for HR (and power for bike)
  if (hrZones || powerZones) {
    const needsStream = activities.filter(a => a.hasHeartRate || (sport === 'bike' && a.deviceWatts)).slice(0, 15);
    const streamResults = await Promise.allSettled(
      needsStream.map(a => {
        const keys = [a.hasHeartRate && 'heartrate', (sport==='bike' && a.deviceWatts) && 'watts', 'time'].filter(Boolean).join(',');
        return fetch(`https://www.strava.com/api/v3/activities/${a.id}/streams?keys=${keys}&series_type=time&resolution=medium`, { headers })
          .then(r => r.ok ? r.json() as Promise<Array<{type:string;data:number[]}>> : null);
      })
    );
    streamResults.forEach((result, idx) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const streams  = result.value;
      const tmStream = streams.find(s => s.type === 'time')?.data;
      const hrStream = streams.find(s => s.type === 'heartrate')?.data;
      const pwStream = streams.find(s => s.type === 'watts')?.data;
      if (!tmStream) return;
      if (hrStream && hrZones)   needsStream[idx].zoneTimes      = calcZoneTimes(hrStream, tmStream, hrZones);
      if (pwStream && powerZones) needsStream[idx].powerZoneTimes = calcZoneTimes(pwStream, tmStream, powerZones);
    });
  }

  // Weekly zone totals
  const weeklyHRZones  = activities.reduce<number[]>((acc,a) => { a.zoneTimes?.forEach((s,i)=>{ acc[i]=(acc[i]??0)+s; }); return acc; }, [0,0,0,0,0]);
  const weeklyPwrZones = activities.reduce<number[]>((acc,a) => { a.powerZoneTimes?.forEach((s,i)=>{ acc[i]=(acc[i]??0)+s; }); return acc; }, [0,0,0,0,0,0,0]);

  const avgPace = sport === 'swim' ? fmtPace100m(totalDist, totalTime)
                : sport === 'bike' ? fmtSpeed(totalDist, totalTime)
                : fmtRunPace(totalDist, totalTime);

  const longestRounded = Math.round(longestKm * 10) / 10;

  res.json({
    weekStart: responseWeekStart,
    sport, ftp, powerZones, hrZones,
    activities,
    totals: {
      distanceKm:    Math.round(totalDist * 10) / 10,
      totalTimeMin:  Math.round(totalTime),
      timeFormatted: fmtTime(totalTime),
      avgPace,
      avgSpeed:      sport === 'bike' ? fmtSpeed(totalDist, totalTime) : null,
      avgHeartRate:  hrCount > 0 ? Math.round(totalHR / hrCount) : null,
      avgWatts:      wattsCount > 0 ? Math.round(totalWatts / wattsCount) : null,
      kilojoules:    Math.round(totalKj),
      sufferScore:   Math.round(totalSuffer),
      tss:           Math.round(totalTSS),
      sessions:      activities.length,
      longestKm:     longestRounded,
      longestRunKm:  longestRounded, // alias for RunCoachPage
      longestKm2:    longestRounded, // alias for SwimCoachPage (longestKm)
      zoneTimes:     weeklyHRZones,  // alias — coach pages expect zoneTimes
      weeklyHRZones, weeklyPwrZones,
    },
  });
}
