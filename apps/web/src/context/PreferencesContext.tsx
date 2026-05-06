import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

/* ── Feature catalogue ── */
export interface FeatureDef {
  id:          string;
  label:       string;
  description: string;
  category:    'run' | 'swim' | 'bike' | 'tri' | 'general';
  defaultOn:   boolean;
}

export const FEATURES: FeatureDef[] = [
  /* Running Coach */
  { id:'run_weekly_comparison',  label:'Porównanie z poprzednim tygodniem',  description:'Pasek porównujący aktualny tydzień z poprzednim — deficit i surplus czasu treningu.',           category:'run', defaultOn:true  },
  { id:'run_assessment',         label:'Ocena tygodnia biegowego',           description:'Automatyczne alerty (ok/warn) dla wolumenu, intensywności i długiego biegu.',                     category:'run', defaultOn:true  },
  { id:'run_zones',              label:'Kalkulator stref VDOT',              description:'Oblicza strefy tempa i HR na podstawie wyników lub biegów ze Stravy.',                           category:'run', defaultOn:true  },
  { id:'run_technique_ai',       label:'Analiza techniki AI',                description:'AI analizuje kadencję, EF i technikę biegu na podstawie ostatnich 7 biegów (koszt ~$0.04).',     category:'run', defaultOn:false },
  { id:'run_cadence_chart',      label:'Wykres kadencji',                    description:'Pokazuje kadencję spm z dynamicznym zakresem optymalnym dopasowanym do tempa.',                   category:'run', defaultOn:true  },
];

export type FeatureId = (typeof FEATURES)[number]['id'];
export type Features  = Partial<Record<FeatureId, boolean>>;

/* ── Context ── */
interface PreferencesValue {
  features:  Features;
  isEnabled: (id: FeatureId) => boolean;
  toggle:    (id: FeatureId) => Promise<void>;
  loading:   boolean;
}

const Ctx = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [features, setFeatures] = useState<Features>({});
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase.from('user_preferences').select('features').eq('user_id', user.id).single()
      .then(r => {
        if (r.data?.features) setFeatures(r.data.features as Features);
        setLoading(false);
      });
  }, [user]);

  const isEnabled = useCallback((id: FeatureId) => {
    if (id in features) return !!features[id];
    return FEATURES.find(f => f.id === id)?.defaultOn ?? true;
  }, [features]);

  const toggle = useCallback(async (id: FeatureId) => {
    if (!user) return;
    const next = { ...features, [id]: !isEnabled(id) };
    setFeatures(next);
    await supabase.from('user_preferences').upsert(
      { user_id: user.id, features: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }, [features, isEnabled, user]);

  return (
    <Ctx.Provider value={{ features, isEnabled, toggle, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreferences must be inside PreferencesProvider');
  return ctx;
}
