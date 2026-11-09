---
name: strava-api
description: How TriCoach's Vercel serverless API (api/*) talks to Strava API v3, Supabase and Anthropic — endpoint template, token refresh, DB tables, Strava endpoints in use, sport-type mapping. Use when adding/changing anything in api/, fetching new Strava data, touching Supabase tables, or the AI endpoints.
---

# Strava / Supabase / AI backend (api/)

## Endpoint template

Every file in `api/` is a standalone Vercel function. There is **no shared module** — each file repeats the client + refresh helper. Copy this shape for a new endpoint:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function refreshToken(row: Record<string, unknown>): Promise<string> {
  if (Date.now() / 1000 < (row.expires_at as number) - 300) return row.access_token as string;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET,
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
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single();
  if (!tokenRow) return res.status(404).json({ error: 'Strava not connected' });

  let token: string;
  try { token = await refreshToken(tokenRow); }
  catch { return res.status(401).json({ error: 'Token refresh failed — reconnect Strava' }); }

  const headers = { Authorization: `Bearer ${token}` };
  // … Strava calls; on !r.ok → res.status(502)
  res.json({ /* … */ });
}
```

Status conventions: 401 auth/refresh, 404 Strava not connected, 405 wrong method, 502 Strava error.
Frontend calls with `Authorization: Bearer ${session.access_token}` (Supabase session from `useAuth()`).
Routing: `vercel.json` rewrites `/api/(.*)` → function; `npm run dev` (Vite) does NOT serve `api/` — use `vercel dev`.

## Strava API v3 endpoints in use

| Endpoint | Used in |
|---|---|
| `GET /athlete` | profile, sync, athlete, discipline, ai/generate-plan |
| `GET /athlete/zones` | stream, athlete, discipline, ai/generate-plan |
| `GET /athlete/activities?after=&before=&per_page=&page=` | activities, prs, sync, athlete, discipline, ai/generate-plan |
| `GET /activities/{id}` | stream |
| `GET /activities/{id}/laps` | stream |
| `GET /activities/{id}/streams?keys=…&series_type=time&resolution=medium` | stream (heartrate,velocity_smooth,altitude,time,distance,cadence,watts), athlete & discipline (HR) |

Limits: Strava rate limit is 100 req / 15 min and 1000 / day per app — prefer `per_page=200` and avoid per-activity stream fan-out where possible. Units from Strava: distance m, `moving_time` s, speed m/s.

## Sport-type mapping (`sport_type`)

```ts
swim: 'Swim'
bike: 'Ride','VirtualRide','EBikeRide','Velomobile','Handcycle'
run:  'Run','TrailRun','VirtualRun'
else → 'other'
```
(Duplicated in several api files — keep them consistent.)

## Supabase tables (service-role client bypasses RLS)

| Table | Key columns / use |
|---|---|
| `strava_tokens` | user_id, access_token, refresh_token, expires_at, updated_at — one row per user |
| `weekly_summaries` | user_id, week_start, swim/bike/run_sessions, … — written by `strava/sync`, read by Dashboard & generate-plan |
| `training_plans` | user_id, sport_type (`run`/`swim`/`bike`/`atp`), created_at — AI plans |
| `running_zones` | VDOT zones saved per user (`training/run-zones`) |
| `run_insights` | AI run-analysis notes (`training/run-zones`) |

## OAuth flow

`/api/auth/strava?token=<supabase jwt>` → verify user → redirect to `strava.com/oauth/authorize` with userId in `state` → `/api/auth/callback` exchanges code, upserts `strava_tokens`, redirects to `APP_URL/?strava=connected` (handled in `AuthContext`).

## Cron

`vercel.json` runs `GET /api/strava/sync` daily at 03:00 with `Authorization: Bearer $CRON_SECRET`; same endpoint with POST + user JWT syncs one user.

## AI endpoints

`api/ai/analyze-workout.ts` and `api/ai/generate-plan.ts` use `@anthropic-ai/sdk` (`ANTHROPIC_API_KEY`), model in a `MODEL` const per file (`claude-sonnet-5-5`, thinking off via `between_tools`; SDK 0.92 needs a cast for it), cost via `costUsd()` at $2/$10 per MTok. Plans are stored in `training_plans`; GET returns the latest one.
