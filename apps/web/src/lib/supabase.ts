import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key);

export type StravaToken = {
  user_id: string;
  athlete_id: number;
  athlete_name: string;
  athlete_avatar: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
