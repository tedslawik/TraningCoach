import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error: stravaError } = req.query;

  if (stravaError === 'access_denied') {
    return res.redirect(302, `${process.env.APP_URL}/?strava=denied`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  // Decode and validate state
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const age = Date.now() - decoded.ts;
    if (age > 10 * 60 * 1000) throw new Error('State expired'); // 10 min max
    userId = decoded.uid;
  } catch {
    return res.status(400).json({ error: 'Invalid state' });
  }

  // Exchange code for Strava tokens
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return res.status(502).json({ error: 'Strava token exchange failed' });
  }

  const data = await tokenRes.json();

  // Upsert tokens into DB (insert or update on conflict)
  const { error: dbError } = await supabase.from('strava_tokens').upsert({
    user_id:        userId,
    athlete_id:     data.athlete.id,
    athlete_name:   data.athlete.firstname,
    athlete_avatar: data.athlete.profile_medium ?? null,
    access_token:   data.access_token,
    refresh_token:  data.refresh_token,
    expires_at:     data.expires_at,
    updated_at:     new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (dbError) {
    console.error('DB upsert error:', dbError);
    return res.status(500).json({ error: 'Failed to store tokens' });
  }

  res.redirect(302, `${process.env.APP_URL}/?strava=connected`);
}
