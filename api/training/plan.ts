import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data, error: dbErr } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (dbErr || !data) return res.status(404).json({ error: 'No plan found' });

  // Also compute suggested days from weekly_summaries
  const { data: summaries } = await supabase
    .from('weekly_summaries')
    .select('swim_sessions,bike_sessions,run_sessions')
    .eq('user_id', user.id)
    .order('week_start', { ascending: false })
    .limit(4);

  const avgSessions = summaries?.length
    ? summaries.reduce((s, r) => s + (r.swim_sessions ?? 0) + (r.bike_sessions ?? 0) + (r.run_sessions ?? 0), 0) / summaries.length
    : 5;
  const suggestedDays = Math.max(3, Math.min(6, Math.round(avgSessions)));

  res.json({ plan: data, suggestedDays });
}
