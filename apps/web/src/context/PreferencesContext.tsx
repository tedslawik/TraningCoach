import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

/* ── Feature catalogue ── */
export interface FeatureDef {
  id:          string;
  label:       string;
  description: string;
  category:    'run' | 'swim' | 'bike' | 'tri' | 'general' | 'tabs';
  defaultOn:   boolean;
}

export const FEATURES: FeatureDef[] = [
  /* ── Zakładki ── */
  { id:'tab_tri',  label:'Tri Coach',  description:'Triathlon — periodyzacja, plany i kalkulator żywienia.',  category:'tabs', defaultOn:true },
  { id:'tab_run',  label:'Run Coach',  description:'Bieganie — treningi tygodniowe, strefy, analiza techniki.', category:'tabs', defaultOn:true },
  { id:'tab_swim', label:'Swim Coach', description:'Pływanie — technika, dystanse i sesje tygodniowe.',         category:'tabs', defaultOn:true },
  { id:'tab_bike', label:'Bike Coach', description:'Kolarstwo — moc, FTP i jazdy tygodniowe.',                  category:'tabs', defaultOn:true },

  /* ── Tri Coach ── */
  { id:'tri_nutrition_calc', label:'Kalkulator żywienia',       description:'Interaktywny kalkulator żeli i bidonów na wyścig z doborem produktów.',    category:'tri', defaultOn:true },

  /* ── Run Coach ── */
  { id:'run_weekly_comparison',  label:'Porównanie tygodniowe',          description:'Deficit/surplus czasu biegu vs poprzedni tydzień.',                     category:'run', defaultOn:true  },
  { id:'run_assessment',         label:'Ocena tygodnia biegowego',       description:'Automatyczne alerty (ok/warn) dla wolumenu, intensywności i długiego biegu.', category:'run', defaultOn:true  },
  { id:'run_zones',              label:'Kalkulator stref VDOT',          description:'Oblicza strefy tempa i HR na podstawie wyników lub biegów ze Stravy.',   category:'run', defaultOn:true  },
  { id:'run_technique_ai',       label:'Analiza techniki AI',            description:'AI analizuje kadencję, EF i technikę biegu (koszt ~$0.04/analizę).',     category:'run', defaultOn:false },

  /* ── Swim Coach ── */
  { id:'swim_weekly_comparison', label:'Porównanie tygodniowe',          description:'Deficit/surplus czasu pływania vs poprzedni tydzień.',                   category:'swim', defaultOn:true },
  { id:'swim_assessment',        label:'Ocena tygodnia pływackiego',     description:'Alerty dla wolumenu, regularności i długości najdłuższej sesji.',        category:'swim', defaultOn:true },

  /* ── Bike Coach ── */
  { id:'bike_weekly_comparison', label:'Porównanie tygodniowe',          description:'Deficit/surplus czasu jazdy i TSS vs poprzedni tydzień.',                category:'bike', defaultOn:true },
  { id:'bike_assessment',        label:'Ocena tygodnia rowerowego',      description:'Alerty dla wolumenu, TSS i Intensity Factor.',                            category:'bike', defaultOn:true },
  { id:'bike_power_zones',       label:'Strefy mocy FTP',                description:'Wyświetla Twoje strefy mocy obliczone z FTP pobranego ze Stravy.',       category:'bike', defaultOn:true },
];

export type FeatureId  = (typeof FEATURES)[number]['id'];
export type Features   = Partial<Record<FeatureId, boolean>>;
export type Category   = FeatureDef['category'];

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
