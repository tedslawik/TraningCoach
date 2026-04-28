import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.query.token as string;

  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  // Verify Supabase JWT → get user
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  // State encodes userId + timestamp (prevents CSRF)
  const state = Buffer.from(JSON.stringify({ uid: user.id, ts: Date.now() })).toString('base64url');

  const callbackUri = `${process.env.APP_URL}/api/auth/callback`;

  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', process.env.STRAVA_CLIENT_ID!);
  url.searchParams.set('redirect_uri', callbackUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'activity:read_all');
  url.searchParams.set('approval_prompt', 'auto');
  url.searchParams.set('state', state);

  res.redirect(302, url.toString());
}
