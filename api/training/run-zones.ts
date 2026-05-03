import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const [zonesRes, insightsRes] = await Promise.all([
      supabase.from('running_zones').select('*').eq('user_id', user.id).single(),
      supabase.from('run_insights').select('*').eq('user_id', user.id).single(),
    ]);
    return res.json({
      zones:    zonesRes.data   ?? null,
      insights: insightsRes.data ?? null,
    });
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;

    // Save zones
    if (body.zones) {
      const { error: ze } = await supabase.from('running_zones').upsert({
        user_id:       user.id,
        vdot:          body.vdot,
        race_dist_m:   body.raceDistM,
        race_time_sec: body.raceTimeSec,
        race_label:    body.raceLabel,
        zones:         body.zones,
        predictions:   body.predictions,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (ze) return res.status(500).json({ error: ze.message });
    }

    // Save insights
    if (body.insights) {
      const { error: ie } = await supabase.from('run_insights').upsert({
        user_id:    user.id,
        content:    body.insights,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (ie) return res.status(500).json({ error: ie.message });
    }

    return res.json({ ok: true });
  }

  res.status(405).end();
}
