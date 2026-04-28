import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const SWIM_TYPES = new Set(['Swim']);
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'Velomobile', 'Handcycle']);
const RUN_TYPES  = new Set(['Run', 'TrailRun', 'VirtualRun']);

function typeKey(s: string) {
  if (SWIM_TYPES.has(s)) return 'swim';
  if (BIKE_TYPES.has(s)) return 'bike';
  if (RUN_TYPES.has(s))  return 'run';
  return 'other';
}

function calcPowerZones(ftp: number) {
  const p = (pct: number) => Math.round(ftp * pct);
  return [
    { min: 0,       max: p(0.55) },
    { min: p(0.56), max: p(0.75) },
    { min: p(0.76), max: p(0.90) },
    { min: p(0.91), max: p(1.05) },
    { min: p(1.06), max: p(1.20) },
    { min: p(1.21), max: p(1.50) },
    { min: p(1.51), max: -1      },
  ];
}

function calcHRZones(maxHR: number) {
  const h = (pct: number) => Math.round(maxHR * pct);
  return [
    { min: 0,     max: h(0.60) },
    { min: h(0.60), max: h(0.70) },
    { min: h(0.70), max: h(0.80) },
    { min: h(0.80), max: h(0.90) },
    { min: h(0.90), max: maxHR  },
  ];
}

function fmtTime(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m} min` : `${h}h`;
}

function fmtPace(distKm: number, timeMin: number, type: string) {
  if (!distKm || !timeMin) return null;
  if (type === 'bike') return `${(distKm / (timeMin / 60)).toFixed(1)} km/h`;
  const base = type === 'swim' ? distKm * 10 : distKm;
  const p = timeMin / base;
  const m = Math.floor(p), s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}${type === 'swim' ? '/100m' : '/km'}`;
}

async function getToken(row: Record<string, unknown>): Promise<string> {
  if (Date.now() / 1000 < (row.expires_at as number) - 300)
    return row.access_token as string;

  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token', refresh_token: row.refresh_token,
    }),
  });
  if (!r.ok) throw new Error('refresh failed');
  const d = await r.json();
  await supabase.from('strava_tokens').update({
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at, updated_at: new Date().toISOString(),
  }).eq('user_id', row.user_id);
  return d.access_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: tokenRow } = await supabase
    .from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await getToken(tokenRow); }
  catch { return res.status(401).json({ error: 'Token refresh failed' }); }

  const headers = { Authorization: `Bearer ${token}` };
  const after   = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  const [athleteRes, zonesRes, activitiesRes] = await Promise.all([
    fetch('https://www.strava.com/api/v3/athlete', { headers }),
    fetch('https://www.strava.com/api/v3/athlete/zones', { headers }),
    fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`, { headers }),
  ]);

  if (!athleteRes.ok || !activitiesRes.ok)
    return res.status(502).json({ error: 'Strava API error' });

  const [athlete, zonesData, raw] = await Promise.all([
    athleteRes.json(),
    zonesRes.ok ? zonesRes.json() : {},
    activitiesRes.json(),
  ]);

  const profile = {
    id:       athlete.id,
    name:     `${athlete.firstname} ${athlete.lastname}`.trim(),
    avatar:   athlete.profile_medium ?? null,
    weight:   athlete.weight ?? null,
    ftp:      athlete.ftp && athlete.ftp > 0 ? athlete.ftp : null,
    city:     athlete.city ?? null,
    country:  athlete.country ?? null,
    sex:      athlete.sex ?? null,
  };

  console.log('[athlete] status — athlete:', athleteRes.status, 'zones:', zonesRes.status, 'activities:', activitiesRes.status);
  console.log('[athlete] weight:', athlete.weight, '| ftp:', athlete.ftp);
  console.log('[athlete] zones keys:', Object.keys(zonesData ?? {}));

  const hrZonesFromAPI    = zonesData?.heart_rate?.zones ?? zonesData?.heartrate?.zones ?? null;
  const powerZonesFromAPI = zonesData?.power?.zones ?? null;

  // Fallback: calculate zones when Strava API returns null
  // Power: from FTP; HR: from highest max_heartrate observed in week's activities
  const maxHRSeen = (raw as Record<string, unknown>[])
    .map(a => (a.max_heartrate as number | null) ?? 0)
    .reduce((m, v) => Math.max(m, v), 0);

  const ftp = athlete.ftp && athlete.ftp > 0 ? athlete.ftp : null;

  const hrZones    = hrZonesFromAPI    ?? (maxHRSeen > 100 ? calcHRZones(maxHRSeen) : null);
  const powerZones = powerZonesFromAPI ?? (ftp ? calcPowerZones(ftp) : null);
  const hrSource   = hrZonesFromAPI    ? 'strava' : (maxHRSeen > 100 ? 'calculated' : null);
  const pwrSource  = powerZonesFromAPI ? 'strava' : (ftp ? 'calculated' : null);

  console.log('[athlete] zones — hrSource:', hrSource, '| pwrSource:', pwrSource, '| ftp:', ftp, '| maxHR:', maxHRSeen);

  let totalSufferScore = 0;
  let totalKilojoules  = 0;
  let totalTimeMin     = 0;

  const activities = (raw as Record<string, unknown>[]).map(a => {
    const type    = typeKey(a.sport_type as string);
    const distKm  = ((a.distance as number) ?? 0) / 1000;
    const timeMin = ((a.moving_time as number) ?? 0) / 60;
    const suffer  = (a.suffer_score as number | null) ?? null;
    const kj      = (a.kilojoules as number | null) ?? null;

    if (suffer) totalSufferScore += suffer;
    if (kj)     totalKilojoules  += kj;
    totalTimeMin += timeMin;

    return {
      id:                a.id,
      name:              a.name,
      type,
      sportType:         a.sport_type,
      date:              a.start_date_local,
      distanceKm:        Math.round(distKm * 10) / 10,
      elevationGain:     Math.round((a.total_elevation_gain as number) ?? 0),
      timeFormatted:     fmtTime(timeMin),
      paceOrSpeed:       type !== 'other' ? fmtPace(distKm, timeMin, type) : null,
      sufferScore:       suffer,
      avgHeartRate:      (a.average_heartrate as number | null) ?? null,
      maxHeartRate:      (a.max_heartrate as number | null) ?? null,
      avgWatts:          (a.average_watts as number | null) ?? null,
      normalizedWatts:   (a.weighted_average_watts as number | null) ?? null,
      kilojoules:        kj ? Math.round(kj) : null,
      avgCadence:        (a.average_cadence as number | null) ?? null,
      perceivedExertion: (a.perceived_exertion as number | null) ?? null,
      hasHeartRate:      (a.has_heartrate as boolean) ?? false,
      deviceWatts:       (a.device_watts as boolean) ?? false,
    };
  });

  res.json({
    profile,
    zones: { heartRate: hrZones, power: powerZones, hrSource, pwrSource },
    activities,
    weekTotals: {
      sufferScore:  Math.round(totalSufferScore),
      kilojoules:   Math.round(totalKilojoules),
      timeFormatted: fmtTime(totalTimeMin),
      sessions:     activities.length,
    },
  });
}
