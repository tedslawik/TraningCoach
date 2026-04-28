import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type StravaToken } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  stravaToken: StravaToken | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshStravaToken: () => Promise<StravaToken | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [stravaToken, setStravaToken] = useState<StravaToken | null>(null);
  const [loading, setLoading]       = useState(true);

  const fetchStravaToken = async (userId: string) => {
    const { data } = await supabase
      .from('strava_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();
    setStravaToken(data ?? null);
    return data as StravaToken | null;
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) await fetchStravaToken(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        await fetchStravaToken(session.user.id);
      } else {
        setStravaToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check URL for Strava callback success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected' && session) {
      fetchStravaToken(session.user.id);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setStravaToken(null);
  };

  const refreshStravaToken = async () => {
    if (!session) return null;
    return fetchStravaToken(session.user.id);
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      stravaToken,
      loading,
      signIn,
      signUp,
      signOut,
      refreshStravaToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
