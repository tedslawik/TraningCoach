import { usePreferences, FEATURES, type FeatureId } from '../context/PreferencesContext';
import SectionLabel from '../components/SectionLabel';
import { useAuth } from '../context/AuthContext';

const CATEGORY_META = {
  tabs:    { label: 'Zakładki Coach',  icon: '🗂️', color: 'var(--text)'  },
  tri:     { label: 'Tri Coach',       icon: '🏅', color: 'var(--tri)'   },
  run:     { label: 'Run Coach',       icon: '🏃', color: 'var(--run)'   },
  swim:    { label: 'Swim Coach',      icon: '🏊', color: 'var(--swim)'  },
  bike:    { label: 'Bike Coach',      icon: '🚴', color: 'var(--bike)'  },
  general: { label: 'Ogólne',          icon: '⚙️', color: 'var(--text-secondary)' },
};

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        background: enabled ? 'var(--tri)' : 'var(--bg-secondary)',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        border: `0.5px solid ${enabled ? 'var(--tri)' : 'var(--border-md)'}`,
      }}
      aria-label={enabled ? 'Wyłącz' : 'Włącz'}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2,
        left: enabled ? 22 : 2,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { isEnabled, toggle, loading } = usePreferences();

  if (!user) return (
    <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Zaloguj się, aby zarządzać ustawieniami.
    </div>
  );

  // Group features by category
  const categories = ['tabs', 'tri', 'run', 'swim', 'bike', 'general'] as Array<keyof typeof CATEGORY_META>;
  const byCategory = categories
    .map(cat => ({
      cat,
      meta: CATEGORY_META[cat],
      features: FEATURES.filter(f => f.category === cat),
    }))
    .filter(g => g.features.length > 0);

  return (
    <>
      <section style={{ background: 'var(--bg-tertiary)', padding: '3rem 5vw 2.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <SectionLabel discipline="tri">Ustawienia</SectionLabel>
          <h1 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 700, letterSpacing: -1.2, marginTop: 4 }}>
            Funkcje aplikacji
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
            Włącz lub wyłącz poszczególne funkcje. Zmiany są zapisywane natychmiast.
          </p>
        </div>
      </section>

      <section>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 5vw', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {loading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Ładowanie ustawień…</p>
          ) : (
            byCategory.map(({ cat, meta, features }) => (
              <div key={cat}>
                {/* Category header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>{meta.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: meta.color }}>
                    {meta.label}
                  </span>
                </div>

                {/* Feature rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                  {features.map((f, i) => {
                    const on = isEnabled(f.id as FeatureId);
                    return (
                      <div
                        key={f.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                          padding: '14px 18px',
                          borderBottom: i < features.length - 1 ? '0.5px solid var(--border)' : 'none',
                          background: on ? 'var(--bg)' : 'var(--bg-secondary)',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: on ? 'var(--text)' : 'var(--text-secondary)', marginBottom: 3 }}>
                            {f.label}
                            {!f.defaultOn && (
                              <span style={{ marginLeft: 8, fontSize: 10, background: '#ede9fd', color: 'var(--tri)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>
                                AI
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {f.description}
                          </div>
                        </div>
                        <Toggle enabled={on} onToggle={() => toggle(f.id as FeatureId)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Info note */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px 16px', lineHeight: 1.6 }}>
            Funkcje oznaczone <strong style={{ color: 'var(--tri)' }}>AI</strong> korzystają z Claude API — każde wywołanie ma koszt widoczny po generowaniu.
            Wyłączenie funkcji AI nie usuwa poprzednich analiz.
          </div>
        </div>
      </section>
    </>
  );
}
