import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Analyzer from '../components/analyzer/Analyzer';
import NutritionCalculator from '../components/tri/NutritionCalculator';
import SectionLabel from '../components/SectionLabel';

type Calc = 'analyzer' | 'nutrition';

const TABS: { value: Calc; icon: string; label: string; short: string }[] = [
  { value: 'analyzer',  icon: '📊', label: 'Analizator treningowy', short: 'Analizator' },
  { value: 'nutrition', icon: '🍌', label: 'Kalkulator żywienia',   short: 'Żywienie'   },
];

export default function CalculatorsPage() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get('tab') === 'nutrition' ? 'nutrition' : 'analyzer') as Calc;
  const [active, setActive] = useState<Calc>(initial);

  useEffect(() => {
    const t = params.get('tab');
    if (t === 'nutrition' || t === 'analyzer') setActive(t);
  }, [params]);

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
            Praktyczne kalkulatory dla treningu i wyścigu — sprawdź proporcje treningowe lub oblicz żywienie wyścigowe.
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
    </>
  );
}
