import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Analyzer from '../components/analyzer/Analyzer';
import NutritionCalculator from '../components/tri/NutritionCalculator';
import RacePredictor from '../components/athlete/RacePredictor';
import VdotCalculator from '../components/training/VdotCalculator';
import SectionLabel from '../components/SectionLabel';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { WeeklySummary } from '@tricoach/core';

type Calc = 'analyzer' | 'nutrition' | 'predictor' | 'vdot';

const TABS: { value: Calc; icon: string; label: string; short: string }[] = [
  { value: 'analyzer',  icon: '📊', label: 'Analizator treningowy', short: 'Analizator' },
  { value: 'nutrition', icon: '🍌', label: 'Kalkulator żywienia',   short: 'Żywienie'   },
  { value: 'predictor', icon: '🏁', label: 'Predyktor wyścigu',     short: 'Predyktor'  },
  { value: 'vdot',      icon: '⏱️', label: 'VDOT — tempo biegu',    short: 'VDOT'       },
];

export default function CalculatorsPage() {
  const { user } = useAuth();
  const [params, setParams]     = useSearchParams();
  const initial                 = (() => {
    const t = params.get('tab');
    return t === 'nutrition' || t === 'predictor' || t === 'vdot' ? t : 'analyzer';
  })() as Calc;
  const [active, setActive]     = useState<Calc>(initial);
  const [summaries, setSums]    = useState<WeeklySummary[]>([]);

  useEffect(() => {
    const t = params.get('tab');
    if (t === 'nutrition' || t === 'analyzer' || t === 'predictor' || t === 'vdot') setActive(t);
  }, [params]);

  // Fetch summaries lazily when predictor tab opens (or always for logged-in users — both work)
  useEffect(() => {
    if (active !== 'predictor' || !user) return;
    supabase
      .from('weekly_summaries')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: true })
      .then(({ data }) => {
        if (!data?.length) { setSums([]); return; }
        setSums(data.map(r => ({
          weekStart:   r.week_start,
          swimDistKm:  r.swim_dist_km,  swimTimeMin: r.swim_time_min,
          bikeDistKm:  r.bike_dist_km,  bikeTimeMin: r.bike_time_min,
          runDistKm:   r.run_dist_km,   runTimeMin:  r.run_time_min,
          sufferScore: r.suffer_score,  tss: r.tss,  kilojoules: r.kilojoules,
        })));
      });
  }, [active, user]);

  const switchTab = (t: Calc) => {
    setActive(t);
    setParams({ tab: t });
  };

  return (
    <>
      {/* Hero */}
      <section style={{ background: 'var(--bg-tertiary)', padding: '3rem 5vw 2rem' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <SectionLabel discipline="tri">Kalkulatory</SectionLabel>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,42px)', fontWeight: 700, letterSpacing: -1.5, marginTop: 4, marginBottom: 8 }}>
            Narzędzia obliczeniowe
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 640, lineHeight: 1.6 }}>
            Praktyczne kalkulatory dla treningu i wyścigu — proporcje, żywienie, predykcja czasu na mecie.
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginTop: '1.75rem', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t.value}
                onClick={() => switchTab(t.value)}
                style={{
                  padding: '10px 18px', borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${active === t.value ? 'var(--tri)' : 'var(--border-md)'}`,
                  background: active === t.value ? 'var(--tri)18' : 'var(--bg)',
                  color: active === t.value ? 'var(--tri)' : 'var(--text-secondary)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Analizator */}
      {active === 'analyzer' && (
        <section>
          <div className="section-inner narrow">
            <div className="analyzer-header">
              <SectionLabel discipline="tri">Analizator proporcji</SectionLabel>
              <h2>Sprawdź podział między dyscypliny</h2>
              <p>Wprowadź swoje ostatnie treningi (lub pobierz ze Stravy) — analizator wyliczy proporcje czasu pływania, jazdy i biegu względem Twojego wyścigu docelowego.</p>
            </div>
            <Analyzer />
          </div>
        </section>
      )}

      {/* Kalkulator żywienia */}
      {active === 'nutrition' && (
        <section>
          <div className="section-inner">
            <div className="section-header">
              <SectionLabel discipline="tri">Odżywianie wyścigowe</SectionLabel>
              <h2>Wylicz żele i bidony na wyścig</h2>
              <p>Wybierz format wyścigu i planowany czas — kalkulator przeliczy dokładne ilości węglowodanów, żeli i bidonów na podstawie Twojej wagi.</p>
            </div>
            <NutritionCalculator />
          </div>
        </section>
      )}

      {/* VDOT — kalkulator tempa */}
      {active === 'vdot' && (
        <section>
          <div style={{ maxWidth: 1060, margin: '0 auto', padding: '2rem 5vw' }}>
            <div className="section-header">
              <SectionLabel discipline="run">VDOT — kalkulator tempa biegu</SectionLabel>
              <h2>Strefy tempa wg Jacka Danielsa</h2>
              <p>Wpisz swój wynik na 5K, 10K, półmaratonie lub innym dystansie. Kalkulator wyliczy VDOT i podpowie tempa dla każdego rodzaju treningu — od regeneracyjnego po interwały VO₂max. Opcjonalnie dodaj max HR, żeby dostać też strefy tętna.</p>
            </div>
            <VdotCalculator />
          </div>
        </section>
      )}

      {/* Predyktor wyścigu */}
      {active === 'predictor' && (
        <section>
          <div className="section-inner narrow">
            <div className="section-header">
              <SectionLabel discipline="tri">Predyktor wyścigu</SectionLabel>
              <h2>Szacowany czas na podstawie treningów</h2>
              <p>Predyktor analizuje Twoje średnie tempa pływania, jazdy i biegu z ostatnich 8 tygodni i szacuje czas wyścigu na różnych dystansach triathlonowych.</p>
            </div>
            {!user
              ? <p style={{ fontSize:14, color:'var(--text-secondary)', textAlign:'center', padding:'2rem' }}>Zaloguj się, aby zobaczyć predyktor.</p>
              : summaries.length === 0
                ? <p style={{ fontSize:14, color:'var(--text-secondary)', textAlign:'center', padding:'2rem' }}>Brak danych — synchronizuj historię ze Stravy w Dashboardzie.</p>
                : <RacePredictor summaries={summaries} />
            }
          </div>
        </section>
      )}
    </>
  );
}
